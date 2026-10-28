// Ported from Mochiboard, MIT. See LICENSE.mochiboard.
import { CardIdSchema, LinkIdSchema } from "@aegis/domain";
import type { Board, Card, CardId, Command } from "@aegis/domain";

type Positioned = {
  readonly x: number;
  readonly y: number;
  readonly text: string;
};
type Item = Positioned &
  (
    | { readonly t: "title" }
    | { readonly t: "note"; readonly color: string; readonly key?: string }
    | {
        readonly t: "group";
        readonly color: string;
        readonly notes: readonly string[];
      }
    | { readonly t: "swatch"; readonly hex: string }
    | { readonly t: "todo"; readonly items: readonly string[] }
  );
interface Framework {
  readonly name: string;
  readonly items: readonly Item[];
  readonly links?: readonly (readonly [string, string])[];
  readonly guide: string;
  readonly guideX?: number;
}
const title = (text: string): Item => ({ t: "title", x: 0, y: 0, text });
const group = (
  x: number,
  y: number,
  text: string,
  color: string,
  notes: readonly string[],
): Item => ({ t: "group", x, y, text, color, notes });
const note = (
  x: number,
  y: number,
  text: string,
  color = "plain",
  key?: string,
): Item => ({
  t: "note",
  x,
  y,
  text,
  color,
  ...(key === undefined ? {} : { key }),
});
export const frameworks: Readonly<Record<string, Framework>> = {
  affinity: {
    name: "Affinity map",
    items: [
      title("Affinity map"),
      group(0, 90, "Observations", "gray", [
        "Record a comment from your research.",
        "Add another observation.",
        "What happened?",
        "What caused confusion?",
      ]),
      group(330, 90, "A shared theme", "red", [
        "Move related observations into this group.",
        "Describe the pattern you found.",
      ]),
      group(660, 90, "Another theme", "green", [
        "Collect a different pattern here.",
      ]),
    ],
    guide:
      "Write one observation on each note. Gather related notes into groups, then give each group a name that explains the finding.",
  },
  opportunity: {
    name: "Opportunity map",
    items: [
      title("Opportunity map"),
      note(330, 90, "Outcome: more people complete setup", "blue", "outcome"),
      note(
        120,
        300,
        "Need: understand why details are needed",
        "yellow",
        "need1",
      ),
      note(540, 300, "Need: finish setup with less effort", "yellow", "need2"),
      note(0, 510, "Idea: explain each request", "green", "idea1"),
      note(240, 510, "Idea: allow optional steps later", "green", "idea2"),
      note(540, 510, "Idea: keep progress between visits", "green", "idea3"),
      note(
        0,
        720,
        "Experiment: try the revised screen with five people",
        "purple",
        "test",
      ),
    ],
    links: [
      ["outcome", "need1"],
      ["outcome", "need2"],
      ["need1", "idea1"],
      ["need1", "idea2"],
      ["need2", "idea3"],
      ["idea1", "test"],
    ],
    guide:
      "Put a measurable outcome at the top. Add needs found in research below it, followed by possible solutions and a small experiment. Connect each idea to the need it addresses.",
    guideX: 900,
  },
  matrix: {
    name: "Impact / effort",
    items: [
      title("Impact / effort"),
      group(0, 90, "Quick wins", "green", ["High impact, low effort"]),
      group(330, 90, "Larger investments", "blue", [
        "High impact, high effort",
      ]),
      group(0, 360, "Small improvements", "yellow", ["Low impact, low effort"]),
      group(330, 360, "Leave for later", "red", ["Low impact, high effort"]),
    ],
    guide:
      "Write one idea per note. Compare the benefit and effort, then place it in a quadrant. Choose a useful, manageable change to try first.",
    guideX: 660,
  },
  empathy: {
    name: "Empathy map",
    items: [
      title("Empathy map"),
      note(245, 90, "Person: who are we learning about?", "purple"),
      group(0, 270, "Says", "blue", ["Use an exact research quote."]),
      group(330, 270, "Thinks", "purple", [
        "What concern is behind the words?",
      ]),
      group(0, 520, "Does", "yellow", ["Describe an action you observed."]),
      group(330, 520, "Feels", "red", ["What emotion did they describe?"]),
    ],
    guide:
      "Choose one person or audience. Use research evidence for each section. Look for differences between what people say and what they do.",
    guideX: 660,
  },
  journey: {
    name: "Journey map",
    items: [
      title("Journey map"),
      group(0, 90, "1. Discovery", "blue", [
        "How do they find out about it?",
        "Feeling: interested",
      ]),
      group(300, 90, "2. Getting started", "purple", [
        "What steps do they take?",
        "Difficulty: too many requests",
      ]),
      group(600, 90, "3. First result", "yellow", [
        "What useful result do they get?",
      ]),
      group(900, 90, "4. Return visit", "green", ["Why would they come back?"]),
    ],
    guide:
      "Read the steps from left to right. Add actions, feelings and difficulties beneath each step. Rename the steps to match the journey you observed.",
    guideX: 1200,
  },
  hmw: {
    name: "How might we",
    items: [
      title("How might we"),
      group(0, 90, "Research problems", "red", [
        "People stop before completing setup.",
      ]),
      group(330, 90, "Questions to explore", "yellow", [
        "How might we make the first step clearer?",
        "How might we reduce the information needed?",
      ]),
    ],
    guide:
      "Turn each research problem into an open question. Keep the question specific enough to start exploring and broad enough to allow several answers.",
    guideX: 660,
  },
  rtb: {
    name: "Rose, thorn, bud",
    items: [
      title("Rose, thorn, bud"),
      group(0, 90, "Rose: successes", "red", ["What helped the team?"]),
      group(330, 90, "Thorn: difficulties", "orange", [
        "What made the work harder?",
      ]),
      group(660, 90, "Bud: possibilities", "green", [
        "What would you like to try?",
      ]),
    ],
    guide:
      "Take a few quiet minutes to write. Share the notes, group related thoughts and choose one practical improvement for the next round.",
  },
};
export const starters: Readonly<Record<string, readonly Item[]>> = {
  Moodboard: [
    title("Moodboard"),
    note(0, 60, "Describe the mood in a few words.", "yellow"),
    note(250, 60, "Drop visual references onto this board.", "red"),
    note(500, 60, "Choose a colour palette.", "green"),
    { t: "swatch", x: 0, y: 260, text: "Blush", hex: "#ff9ec4" },
    { t: "swatch", x: 130, y: 260, text: "Cream", hex: "#fff5c8" },
    { t: "swatch", x: 260, y: 260, text: "Mint", hex: "#7ad3a3" },
    {
      t: "todo",
      x: 500,
      y: 240,
      text: "Next steps",
      items: ["Gather references", "Choose typefaces", "Review with the team"],
    },
  ],
  "App plan": [
    title("App plan"),
    note(0, 60, "Describe the intended audience.", "blue"),
    note(250, 60, "What problem needs solving?", "red"),
    note(500, 60, "What is the main benefit?", "yellow"),
    {
      t: "todo",
      x: 0,
      y: 260,
      text: "Screens to plan",
      items: ["Welcome", "Main screen", "Preferences"],
    },
    note(280, 260, "Compare existing options and their gaps.", "purple"),
  ],
  "Brain dump": [
    title("Brain dump"),
    note(
      0,
      60,
      "Capture ideas with Quick capture. Move ideas from Unsorted onto the board.",
      "yellow",
    ),
  ],
};

export function templateCommands(
  key: string,
  board: Board,
): readonly Command[] {
  const framework = frameworks[key],
    items = framework?.items ?? starters[key];
  if (!items) throw new Error("Unknown template.");
  const commands: Command[] = [],
    keyed = new Map<string, CardId>();
  const x0 = board.cards.length
    ? Math.max(...board.cards.map((card) => card.x + card.w)) + 200
    : 0;
  const y0 = board.cards.length
    ? Math.min(...board.cards.map((card) => card.y))
    : 0;
  type Create = Extract<Command, { op: "create" }>;
  function add(
    type: "title" | "note" | "coll" | "swatch" | "todo",
    values: Omit<Create, "op" | "type" | "newId">,
  ): CardId {
    const id = CardIdSchema.parse(
      crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    );
    commands.push({ op: "create", type, newId: id, ...values });
    return id;
  }
  for (const item of items) {
    const position = { x: x0 + item.x, y: y0 + item.y };
    switch (item.t) {
      case "group": {
        const id = add("coll", {
          ...position,
          w: 288,
          text: item.text,
          color: item.color,
          props: { kids: [], cols: 1 },
        });
        const kids = item.notes.map((text) =>
          add("note", { ...position, w: 264, h: 106, text, color: item.color }),
        );
        commands.push({ op: "update", id, set: { props: { kids, cols: 1 } } });
        break;
      }
      case "note": {
        const id = add("note", {
          ...position,
          text: item.text,
          color: item.color,
        });
        if (item.key) keyed.set(item.key, id);
        break;
      }
      case "title":
        add("title", { ...position, text: item.text, color: "plain" });
        break;
      case "swatch":
        add("swatch", {
          ...position,
          text: item.text,
          color: "plain",
          w: 120,
          h: 150,
          props: { hex: item.hex, label: item.text },
        });
        break;
      case "todo":
        add("todo", {
          ...position,
          text: item.text,
          color: "plain",
          items: item.items.map((text) => ({ text, done: false })),
        });
        break;
      default: {
        const exhaustive: never = item;
        throw new Error(String(exhaustive));
      }
    }
  }
  if (framework)
    add("note", {
      x: x0 + (framework.guideX ?? 990),
      y: y0 + 90,
      w: 280,
      h: 300,
      text: `How to use this template\n\n${framework.guide}`,
    });
  for (const [from, to] of framework?.links ?? []) {
    const a = keyed.get(from),
      b = keyed.get(to);
    if (!a || !b)
      throw new Error("Template connector refers to a missing note.");
    const id = LinkIdSchema.parse(
      crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    );
    commands.push(
      { op: "connect", newId: id, a, b },
      { op: "link_update", id, set: { arrow: "end" } },
    );
  }
  if (starters[key]) {
    const tray =
      key === "Brain dump"
        ? [
            "A task to finish",
            "An idea to explore",
            "Something to follow up",
            "A reference to find",
            "A question to answer",
          ].map((text) => ({
            id: crypto.randomUUID().replaceAll("-", "").slice(0, 12),
            type: "note",
            text,
            x: 0,
            y: 0,
            w: 220,
            h: 140,
            color: "plain",
          }))
        : [];
    commands.push({ op: "board_set", set: { tray } });
  }
  return commands;
}

export function expandTemplateDrag(cards: readonly Card[], board: Pick<Board, "cards">): Card[] {
  const ids = new Set(cards.map(card => card.id));
  for (const parent of cards) {
    if (parent.type !== "template-group") continue;
    for (const child of board.cards) if (child.parent === parent.id) ids.add(child.id);
  }
  return board.cards.filter(card => ids.has(card.id));
}

export function templateDropCommands(cards: readonly Card[], board: Pick<Board, "cards">, kind: "move" | "resize"): Command[] {
  if (kind !== "move") return [];
  return cards.filter(card => card.type === "note").flatMap((card): Command[] => {
    if (cards.some(parent => parent.id === card.parent && parent.type === "template-group")) return [];
    const centre = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
    const group = [...board.cards].reverse().find(parent => parent.type === "template-group" && centre.x > parent.x && centre.x < parent.x + parent.w && centre.y > parent.y && centre.y < parent.y + parent.h);
    const previous = board.cards.find(parent => parent.id === card.parent);
    if (!group && previous?.type !== "template-group") return [];
    if ((card.parent ?? "") === (group?.id ?? "")) return [];
    return [{ op: "update", id: card.id, set: { parent: group?.id ?? "" } }];
  });
}
