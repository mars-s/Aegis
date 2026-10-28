import { describe, expect, it } from "vitest";
import {
  BoardSchema,
  CardIdSchema,
  CardSchema,
  applyBatch,
} from "@aegis/domain";
import type { Board, Command } from "@aegis/domain";
import {
  arrange,
  cloneCommands,
  effectiveFlag,
  makeClip,
  snapRotation,
} from "./operations.js";
import { collectionDrop } from "./collection-operations.js";
import { restoreDeleted } from "./delete-operations.js";
import { layerDescendants, layerParents } from "./layers.js";
import { parseCapture } from "./capture.js";
const id = (value: string) => CardIdSchema.parse(value);
function fixture(): Board {
  return BoardSchema.parse({
    id: "test-board",
    name: "Editing",
    rev: 0,
    view: { x: 0, y: 0, z: 1 },
    cards: [
      {
        id: "oneone",
        type: "note",
        x: 0,
        y: 10,
        w: 200,
        h: 100,
        color: "plain",
        text: "First",
        group: "together",
      },
      {
        id: "twotwo",
        type: "note",
        x: 240,
        y: 30,
        w: 200,
        h: 100,
        color: "plain",
        text: "Second",
        group: "together",
      },
      {
        id: "threethree",
        type: "note",
        x: 600,
        y: 160,
        w: 200,
        h: 100,
        color: "plain",
        text: "Third",
      },
    ],
    links: [
      {
        id: "wirewire",
        a: "oneone",
        b: "twotwo",
        bend: 60,
        dash: true,
        arrow: "both",
        label: "Related",
      },
    ],
  });
}
function run(board: Board, commands: Command[]): Board {
  const result = applyBatch(board, { commands });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  Object.assign(board, result.board);
  return board;
}
describe("editing commands on the real domain reducer", () => {
  it("copies grouped windows with links and allocates independent identities and groups", () => {
    const board = fixture(),
      clip = makeClip(board, [id("oneone")]),
      copied = cloneCommands(clip, board, { x: 0, y: 0 }, 60);
    run(board, copied.commands);
    expect(board.cards).toHaveLength(5);
    expect(board.links).toHaveLength(2);
    const first = board.cards.find((card) => card.id === copied.ids[0]),
      second = board.cards.find((card) => card.id === copied.ids[1]);
    expect(first?.x).toBe(60);
    expect(second?.x).toBe(300);
    expect(first?.group).not.toBe("together");
    expect(first?.group).toBe(second?.group);
    const link = board.links.find((link) => link.id !== "wirewire");
    expect(link).toMatchObject({
      a: first?.id,
      b: second?.id,
      bend: 60,
      dash: true,
      arrow: "both",
      label: "Related",
    });
  });
  it("centres a cross-board paste and excludes links outside the copied selection", () => {
    const source = fixture(),
      clip = makeClip(source, [id("threethree")]),
      target = BoardSchema.parse({
        ...fixture(),
        id: "other",
        cards: [],
        links: [],
      });
    const copied = cloneCommands(clip, target, { x: 400, y: 300 });
    run(target, copied.commands);
    expect(target.cards[0]).toMatchObject({ x: 300, y: 250, text: "Third" });
    expect(target.links).toEqual([]);
    expect(target.cards[0]?.id).not.toBe("threethree");
  });
  it("remaps collection children, parent ownership and column maps together", () => {
    const board = fixture();
    board.cards.push(
      CardSchema.parse({
        id: "collection",
        type: "coll",
        x: 0,
        y: 0,
        w: 520,
        h: 300,
        color: "plain",
        text: "Related",
        props: { kids: ["oneone", "twotwo"], colOf: { oneone: 0, twotwo: 1 } },
      }),
    );
    const first = board.cards[0];
    if (first) first.parent = id("collection");
    const copied = cloneCommands(makeClip(board, [id("collection")]), board, {
      x: 0,
      y: 0,
    });
    run(board, copied.commands);
    const collection = board.cards.find(
      (card) => card.id !== "collection" && card.type === "coll",
    );
    expect(collection?.props?.kids).toHaveLength(2);
    expect(collection?.props?.kids).not.toContain("oneone");
    const child = board.cards.find(
      (card) => card.id === collection?.props?.kids?.[0],
    );
    expect(child?.parent).toBe(collection?.id);
    expect(Object.keys(collection?.props?.colOf ?? {})).toEqual(
      collection?.props?.kids,
    );
  });
  it("aligns groups as one unit and keeps inherited locked windows fixed", () => {
    const board = fixture(),
      one = board.cards[0],
      two = board.cards[1];
    if (one) one.props = { locked: true };
    const before = two?.x;
    run(
      board,
      arrange(
        board,
        board.cards.map((card) => card.id),
        "left",
      ),
    );
    expect(board.cards[0]?.x).toBe(0);
    expect(board.cards[1]?.x).toBe(before);
    expect(board.cards[2]?.x).toBe(240);
  });
  it("drops into a new collection column through the shared collection layout", () => {
    const board = fixture();
    board.cards.push(
      CardSchema.parse({
        id: "collection",
        type: "coll",
        x: 0,
        y: 0,
        w: 268,
        h: 400,
        text: "Collection",
        color: "plain",
        props: { kids: ["oneone"], colOf: { oneone: 0 } },
      }),
    );
    const card = board.cards.find((card) => card.id === "threethree");
    if (!card) throw new Error("Fixture missing");
    run(board, collectionDrop(board, [card], { x: 280, y: 100 }));
    expect(
      board.cards.find((card) => card.id === "collection")?.props?.cols,
    ).toBe(2);
    expect(
      board.cards.find((card) => card.id === "collection")?.props?.colOf
        ?.threethree,
    ).toBe(1);
    expect(board.cards.find((card) => card.id === "threethree")?.parent).toBe(
      "collection",
    );
  });
  it("restores deleted windows and their links while keeping later edits", () => {
    const before = fixture(),
      current = structuredClone(before),
      cards = before.cards.filter((card) => card.id === "oneone");
    run(current, [
      { op: "delete", ids: [id("oneone")] },
      { op: "update", id: id("threethree"), set: { text: "A later edit" } },
    ]);
    run(
      current,
      restoreDeleted(current, {
        boardId: before.id,
        ids: [id("oneone")],
        cards,
        links: before.links,
        before,
      }),
    );
    expect(current.cards.find((card) => card.id === "threethree")?.text).toBe(
      "A later edit",
    );
    expect(current.cards.find((card) => card.id === "oneone")?.text).toBe(
      "First",
    );
    expect(current.links).toHaveLength(1);
    expect(
      restoreDeleted(BoardSchema.parse({ ...current, id: "another" }), {
        boardId: before.id,
        ids: [],
        cards,
        links: before.links,
        before,
      }),
    ).toEqual([]);
  });
  it("keeps nested layers reachable even with malformed imported ownership cycles", () => {
    const board = fixture(),
      first = board.cards[0],
      second = board.cards[1];
    if (first) first.parent = id("twotwo");
    if (second) {
      second.parent = id("oneone");
      second.props = { hidden: true };
    }
    if (!first) throw new Error("Fixture missing");
    expect(effectiveFlag(board, first, "hidden")).toBe(true);
    const parents = layerParents(board);
    expect(
      parents.get(id("oneone")) === id("twotwo") &&
        parents.get(id("twotwo")) === id("oneone"),
    ).toBe(false);
    expect(layerDescendants(board, [id("oneone"), id("twotwo")])).toHaveLength(
      2,
    );
  });
  it("retains the first and last notes around a captured checklist and link", () => {
    const commands = parseCapture(
      "First idea\n- [x] Done\n- Next\nhttps://example.com\nLast idea",
    );
    expect(
      commands.map((command) =>
        command.op === "create" ? command.type : null,
      ),
    ).toEqual(["note", "todo", "link", "note"]);
    const board = BoardSchema.parse({ ...fixture(), cards: [], links: [] });
    run(board, commands);
    expect(board.cards[1]?.items).toEqual([
      { text: "Done", done: true },
      { text: "Next", done: false },
    ]);
    expect(board.cards[3]?.text).toBe("Last idea");
  });
  it("snaps near fifteen-degree stops and allows free rotation away from them", () => {
    expect(snapRotation(28)).toBe(28);
    expect(snapRotation(29)).toBe(30);
    expect(snapRotation(-17)).toBe(-17);
    expect(snapRotation(-17, true)).toBe(-15);
  });
});
