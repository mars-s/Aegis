// Built-in card metadata. No import-time registration or mutable singleton.
import type {CardType} from './schema.js';
export const CARD_CATALOG = Object.freeze({
  "note": {
    "size": [
      220,
      96
    ],
    "guide": ""
  },
  "title": {
    "size": [
      360,
      56
    ],
    "guide": ""
  },
  "todo": {
    "size": [
      260,
      160
    ],
    "guide": ""
  },
  "link": {
    "size": [
      260,
      76
    ],
    "guide": ""
  },
  "image": {
    "size": [
      320,
      220
    ],
    "guide": ""
  },
  "video": {
    "size": [
      480,
      270
    ],
    "guide": ""
  },
  "web": {
    "size": [
      480,
      340
    ],
    "guide": ""
  },
  "agent": {
    "size": [
      300,
      160
    ],
    "guide": ""
  },
  "object": {
    "size": [
      520,
      360
    ],
    "guide": ""
  },
  "doc": {
    "size": [
      760,
      740
    ],
    "guide": "a document window with a Markdown side editor. text is its only title, do not repeat it as an H1 in the body. Write props.body as Markdown: #, ##, ### headings, lists, - [ ] tasks, > quotes, **bold**, *italic*, `code`, fenced code, ---, links, $inline LaTeX$ and $$block LaTeX$$ maths. Omit props.doc; the editor builds rich content from body."
  },
  "deck": {
    "size": [
      470,
      352
    ],
    "guide": "a slide deck. text is the deck name. props.slides is an ordered list of {id: stable unique string, layout: \"title\"|\"chart\"|\"three\"|\"text\", title, sub: subtitle, body: plain text, background?: \"plain\"|\"sci-fi-wave\"}. title is typography-first by default. Set background: \"sci-fi-wave\" explicitly for decorative thin wave lines, which are not chart data. Keep existing background values when editing; chart reads chart: {values: number[], labels?: string[], target?: number, label?: accessible chart description, smooth?: boolean, sourceId?: plot card id}. Lines use straight segments unless smooth is true. sourceId preserves the complete plot kind, every series, axes, number formatting and smoothing. The board saves its latest resolved model in chart.spec automatically. A missing source shows a labelled saved snapshot, or a broken binding if no resolved snapshot exists. Keep sourceId to retain the live link; three uses the first three newline-separated body lines as independent columns by default; set relationship: \"overlap\" explicitly for overlapping circles; text shows body below the subtitle. props.current is the zero-based current slide index. Agents create decks with create {type: \"deck\", text, props: {slides, current: 0}} and edit, add, reorder or remove slides with update {id, set: {props: {slides, current}}}, sending the complete slides list. Keep slide ids when editing. Pictures must be the person's own media; use drawn graphics here, never stock or generated photos presented as theirs."
  },
  "frame": {
    "size": [
      393,
      852
    ],
    "guide": "a device screen for wireframes. text is its name; w and h: iPhone 393x852, Android 412x915, iPad 834x1194, Desktop 1440x1024. props {device, radius, fill: \"#ffffff\"}."
  },
  "box": {
    "size": [
      160,
      100
    ],
    "guide": "a wireframe block (button, image slot, bar). props {fill: \"#rrggbb\", radius, sw: border width, stroke: \"#rrggbb\", opacity 0 to 1, img: image label, placeholder: true for a local pattern labelled as a placeholder, src: actual image URL}. parent: the frame id."
  },
  "text": {
    "size": [
      240,
      36
    ],
    "guide": "wireframe text. text is the words; props {font: \"Arial\", size: px, weight: 400|500|700, ink: \"#rrggbb\", align: left|center|right, hollow: true for outlined letters, stroke: outline colour, sw: outline width}. parent: the frame id."
  },
  "icon": {
    "size": [
      40,
      40
    ],
    "guide": "a Material icon. props {name: a Material Symbols name such as search, home, menu, person, settings, star; ink: \"#rrggbb\"}. Square w and h. parent: the frame id."
  },
  "font": {
    "size": [
      320,
      190
    ],
    "guide": "a font specimen. text is the sample; props {font: family name}."
  },
  "section": {
    "size": [
      560,
      360
    ],
    "guide": "a big tinted area behind a website section. text is its label; props {fill: \"#rrggbb\", radius}."
  },
  "swatch": {
    "size": [
      160,
      160
    ],
    "guide": "one colour chip. props {hex: \"#rrggbb\", label}."
  },
  "audio": {
    "size": [
      340,
      240
    ],
    "guide": "a recording the person made. Read only for agents."
  },
  "spotify": {
    "size": [
      340,
      192
    ],
    "guide": "a Spotify player. url is an open.spotify.com track, album or playlist link."
  },
  "ink": {
    "size": [
      240,
      160
    ],
    "guide": "freehand pen strokes the person drew. Read only for agents."
  },
  "shape": {
    "size": [
      180,
      140
    ],
    "guide": "a drawn shape that can hold text. props {shape: rect|circle|tri|diamond|star|heart|arrow|hexagon, fill: \"#rrggbb\"|\"none\", stroke: \"ink\"|\"#rrggbb\", sw: line width 0 to 24, sdash: solid|dash|dot|none, dl: dash length 1 to 40, dg: gap 1 to 40}. text sits inside."
  },
  "path": {
    "size": [
      240,
      160
    ],
    "guide": "a vector line or outline. props {points: [{x, y}] in the card's own pixels, ow: w, oh: h, closed, stroke, sw, sdash: solid|dash|dot|none, dl, dg, fill}."
  },
  "stamp": {
    "size": [
      80,
      80
    ],
    "guide": "one emoji sticker. props {emoji}."
  },
  "dataset": {
    "size": [
      640,
      420
    ],
    "guide": "an imported CSV kept whole. props {src: asset id, name, rows, profile}. Read only: query it with data_query for exact figures, never from the preview."
  },
  "canvas": {
    "size": [
      260,
      180
    ],
    "guide": "a door into a nested board the person made. Read only for agents."
  },
  "template-group": {
    "size": [
      288,
      200
    ],
    "guide": "a framework area. text is its name; notes inside set parent to its id and move with it."
  },
  "coll": {
    "size": [
      300,
      180
    ],
    "guide": "a collection that stacks cards in columns. text is its name; props.kids lists member card ids in reading order; the board links and stacks them."
  }
} as const satisfies Record<CardType,{readonly size:readonly [number,number];readonly guide:string}>);
export type {CardType} from './schema.js';
for(const entry of Object.values(CARD_CATALOG)) {Object.freeze(entry.size);Object.freeze(entry);}
export const CARD_TYPES = Object.freeze(Object.keys(CARD_CATALOG));
export const cardTypeGuide = () => Object.entries(CARD_CATALOG).filter(([, entry]) => entry.guide).map(([type, entry]) => `- ${type}: ${entry.guide}`).join('\n');
