// Editing behaviour adapted from Mochiboard, MIT. See LICENSE.mochiboard.
import { CardIdSchema, CommandSchema, LinkIdSchema } from "@aegis/domain";
import type { Board, Card, CardId, Command } from "@aegis/domain";
import type { FeatureContext } from "../composition.js";
import { descendants, locked } from "./model.js";

export interface Notice {
  readonly text: string;
  readonly action?: { readonly label: string; readonly run: () => void };
}
export type Notify = (notice: Notice) => void;

export function submit(
  context: FeatureContext,
  commands: readonly Command[],
  notify: Notify,
): boolean {
  if (!commands.length) return false;
  const result = context.workspace.submit(commands);
  if (result.kind === "applied") return true;
  notify({
    text: result.errors
      .map((error) => `${error.path}: ${error.reason}`)
      .join("\n"),
  });
  return false;
}

interface DeletedSelection {
  readonly boardId: Board['id'];
  readonly signature: string;
  readonly ids: readonly CardId[];
  readonly restore: () => boolean;
}
const deletedSelections = new WeakMap<FeatureContext['workspace'], DeletedSelection>();
const deletionSignature = (board: Board): string => JSON.stringify([board.cards, board.links, board.tray, board.palette]);

export function undoDeletedCards(context: FeatureContext, scoped = false): boolean {
  const pending = deletedSelections.get(context.workspace);
  if (!pending) return false;
  const board = context.workspace.scene.snapshot();
  if (board.id !== pending.boardId) { deletedSelections.delete(context.workspace); return false; }
  const unchanged = deletionSignature(board) === pending.signature;
  if (!unchanged && !scoped) return false;
  const restored = unchanged ? context.workspace.undo().kind === 'applied' : pending.restore();
  if (!restored) return false;
  deletedSelections.delete(context.workspace);
  context.workspace.act({ kind: 'select', ids: pending.ids.filter(id => context.workspace.record(id).getSnapshot() !== null) });
  return true;
}

export async function deleteCards(context: FeatureContext, ids: readonly CardId[], notify: Notify): Promise<void> {
  const current = context.workspace.scene.snapshot();
  const cards = descendants(current, ids).filter(card => !locked(current, card));
  if (!cards.length) return;
  const removed = new Set(cards.map(card => card.id));
  const links = current.links.filter(link => removed.has(link.a) || removed.has(link.b));
  if (!submit(context, [{ op: 'delete', ids: [...removed] }], notify)) return;
  context.workspace.act({ kind: 'select', ids: [] });
  const restore = (): boolean => {
    const next = context.workspace.scene.snapshot(), present = new Set(next.cards.map(card => card.id));
    const restoredCards = [...next.cards];
    for (const card of cards) {
      if (present.has(card.id)) continue;
      const index = current.cards.findIndex(item => item.id === card.id);
      const following = current.cards.slice(index + 1).find(item => present.has(item.id));
      const at = following ? restoredCards.findIndex(item => item.id === following.id) : restoredCards.length;
      restoredCards.splice(at, 0, card); present.add(card.id);
    }
    return submit(context, [{ op: 'restore', cards: restoredCards, links: [...next.links, ...links.filter(link => present.has(link.a) && present.has(link.b) && !next.links.some(item => item.id === link.id))] }], notify);
  };
  deletedSelections.set(context.workspace, { boardId: current.id, ids, signature: deletionSignature(context.workspace.scene.snapshot()), restore });
  notify({ text: `Deleted ${cards.length} window${cards.length === 1 ? '' : 's'}`, action: { label: 'Undo', run: () => { undoDeletedCards(context, true); document.getElementById('stage')?.focus({ preventScroll: true }); } } });
}

export function duplicateCards(
  context: FeatureContext,
  ids: readonly CardId[],
  notify: Notify,
): void {
  const board = context.workspace.scene.snapshot();
  const selectedGroups = new Set(
    board.cards
      .filter((card) => ids.includes(card.id))
      .flatMap((card) => (card.group ? [card.group] : [])),
  );
  const cards = descendants(board, [
    ...ids,
    ...board.cards
      .filter((card) => card.group && selectedGroups.has(card.group))
      .map((card) => card.id),
  ]);
  const remap = new Map(
    cards.map((card) => [
      card.id,
      CardIdSchema.parse(crypto.randomUUID().replaceAll("-", "").slice(0, 12)),
    ]),
  );
  const groups = new Map(
    cards.flatMap((card) =>
      card.group
        ? [[card.group, crypto.randomUUID().replaceAll("-", "").slice(0, 12)]]
        : [],
    ),
  );
  const commands: Command[] = cards.map((card) => {
    const { id, parent, group, props, ...content } = card;
    const parentId = parent ? remap.get(parent) : undefined;
    return CommandSchema.parse({
      ...content,
      op: "create",
      newId: remap.get(id),
      x: card.x + 30,
      y: card.y + 30,
      ...(group ? { group: groups.get(group) } : {}),
      ...(parentId ? { parent: parentId } : {}),
      ...(props
        ? {
            props: {
              ...props,
              ...(props.kids
                ? {
                    kids: props.kids.flatMap((id) => {
                      const mapped = remap.get(id);
                      return mapped ? [mapped] : [];
                    }),
                  }
                : {}),
              ...(props.colOf
                ? {
                    colOf: Object.fromEntries(
                      Object.entries(props.colOf).flatMap(([id, col]) => {
                        const mapped = remap.get(CardIdSchema.parse(id));
                        return mapped ? [[mapped, col]] : [];
                      }),
                    ),
                  }
                : {}),
            },
          }
        : {}),
    });
  });
  for (const link of board.links) {
    const a = remap.get(link.a),
      b = remap.get(link.b);
    if (a && b) {
      const newId = LinkIdSchema.parse(
        crypto.randomUUID().replaceAll("-", "").slice(0, 12),
      );
      const { id: _id, a: _a, b: _b, label, ...style } = link;
      commands.push({
        op: "connect",
        newId,
        a,
        b,
        ...(label === undefined ? {} : { label }),
      });
      if (Object.keys(style).length)
        commands.push(
          CommandSchema.parse({ op: "link_update", id: newId, set: style }),
        );
    }
  }
  if (submit(context, commands, notify))
    context.workspace.act({ kind: "select", ids: [...remap.values()] });
}

export function groupCards(
  context: FeatureContext,
  ids: readonly CardId[],
  ungroup: boolean,
  notify: Notify,
): void {
  const board = context.workspace.scene.snapshot();
  const group = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const groups = new Set(
    board.cards
      .filter((card) => ids.includes(card.id))
      .flatMap((card) => (card.group ? [card.group] : [])),
  );
  const cards = board.cards.filter(
    (card) =>
      (ids.includes(card.id) || (!!card.group && groups.has(card.group))) &&
      !locked(board, card),
  );
  if (!ungroup && cards.length < 2) return;
  submit(
    context,
    cards.map((card) => ({
      op: "update",
      id: card.id,
      set: { group: ungroup ? null : group },
    })),
    notify,
  );
}

export function selectedCards(board: Board, ids: readonly CardId[]): Card[] {
  return board.cards.filter((card) => ids.includes(card.id));
}
