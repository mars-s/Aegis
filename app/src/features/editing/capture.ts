import { BoardIdSchema, CardSchema, CommandSchema } from "@aegis/domain";
import type { Board, BoardId, CardId, Command } from "@aegis/domain";
import type { FeatureWorkspace } from "../../composition.js";
import { cloneCommands } from "./operations.js";

type CaptureCreate = Extract<Command, { readonly op: "create" }>;
export function parseCapture(value: string): CaptureCreate[] {
  const cards: CaptureCreate[] = [];
  let todo: { text: string; done: boolean }[] | null = null;
  function flush() {
    if (todo)
      cards.push({
        op: "create",
        type: "todo",
        text: "Checklist",
        items: todo,
      });
    todo = null;
  }
  for (const line of value
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean)) {
    const item = /^-\s+(?:\[([ xX])\]\s*)?(.+)$/.exec(line);
    if (item && item[2]) {
      todo ??= [];
      todo.push({ text: item[2], done: !!item[1]?.trim() });
    } else {
      flush();
      cards.push(/^https?:\/\/\S+$/i.test(line)
        ? { op: "create", type: "link", text: "", url: line }
        : { op: "create", type: "note", text: line });
    }
  }
  flush();
  return cards;
}

export interface CaptureReceipt {
  readonly boardId: BoardId;
  readonly trayIds: readonly CardId[];
  readonly description: string;
  readonly location: { readonly kind: "tray" } | { readonly kind: "board"; readonly ids: readonly CardId[] };
}

export function describeCapture(cards: readonly { readonly type?: string | undefined }[]): string {
  return ([['note', 'note'], ['link', 'link card'], ['todo', 'checklist']] as const)
    .map(([type, name]) => {
      const count = cards.filter(card => card.type === type).length;
      return count ? `${count} ${name}${count === 1 ? '' : 's'}` : '';
    }).filter(Boolean).join(', ');
}

function submit(workspace: FeatureWorkspace, commands: readonly Command[]): void {
  const result = workspace.submit(commands);
  if (result.kind === "rejected") throw new Error(result.errors.map(field => field.reason).join('. '));
}

export function captureIdeas(workspace: FeatureWorkspace, text: string): CaptureReceipt | null {
  const commands = parseCapture(text);
  if (!commands.length) return null;
  const board = workspace.scene.snapshot();
  const cards = commands.map(({ op: _op, ...fields }) => {
    const card = CardSchema.parse({ ...fields, id: crypto.randomUUID(), color: 'plain', x: 0, y: 0, w: 268, h: 140 });
    return { ...card, h: card.type === 'todo' ? Math.max(160, (card.items?.length ?? 0) * 30 + 60) : card.h };
  });
  submit(workspace, [CommandSchema.parse({ op: 'board_set', set: { tray: [...cards, ...(board.tray ?? [])] } })]);
  return { boardId: board.id, trayIds: cards.map(card => card.id), description: describeCapture(cards), location: { kind: 'tray' } };
}

function trayWithout(board: Board, ids: readonly CardId[]) {
  const captured = new Set(ids);
  return (board.tray ?? []).filter(item => {
    const parsed = CardSchema.safeParse(item);
    return !parsed.success || !captured.has(parsed.data.id);
  });
}

export function putCaptured(workspace: FeatureWorkspace, receipt: CaptureReceipt, at: { readonly x: number; readonly y: number }): CaptureReceipt | null {
  const board = workspace.scene.snapshot();
  if (board.id !== receipt.boardId || receipt.location.kind !== 'tray') return null;
  const captured = new Set(receipt.trayIds);
  const cards = CardSchema.array().parse(board.tray ?? []).filter(card => captured.has(card.id));
  if (!cards.length) return null;
  const cloned = cloneCommands({ from: BoardIdSchema.parse('tray'), cards, links: [], text: '' }, board, at, 0);
  const cols = Math.min(3, cards.length);
  submit(workspace, [
    { op: 'board_set', set: { tray: trayWithout(board, receipt.trayIds) } },
    ...cloned.commands,
    { op: 'layout', ids: cloned.ids, shape: 'grid', cols, x: at.x - cols * 148, y: at.y - 100 },
  ]);
  workspace.act({ kind: 'select', ids: cloned.ids });
  return { ...receipt, location: { kind: 'board', ids: cloned.ids } };
}

export function undoCapture(workspace: FeatureWorkspace, receipt: CaptureReceipt): void {
  const board = workspace.scene.snapshot();
  if (board.id !== receipt.boardId) return;
  const ids = receipt.location.kind === 'board' ? receipt.location.ids.filter(id => workspace.record(id).getSnapshot()) : [];
  submit(workspace, [
    { op: 'board_set', set: { tray: trayWithout(board, receipt.trayIds) } },
    ...(ids.length ? [{ op: 'delete', ids } satisfies Command] : []),
  ]);
}
