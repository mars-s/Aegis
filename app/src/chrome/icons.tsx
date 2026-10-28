/** One line-icon family for the chrome: a 16 px grid, round caps and the stroke set in chrome.css. */
const paths = {
  select: 'M4 2.5 12 8l-3.6.7L10.6 13l-1.5.7-2.2-4.3L4 12z',
  note: 'M3.5 2.5h6l3 3v8h-9zM9.5 2.5v3h3',
  title: 'M3.5 4V3h9v1M8 3v10M6 13h4',
  todo: 'M5 3h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m.5 5 1.8 1.8L10.5 6',
  readme: 'M3 3.5h4a1.5 1.5 0 0 1 1 .5 1.5 1.5 0 0 1 1-.5h4V12H9a1.5 1.5 0 0 0-1 .5 1.5 1.5 0 0 0-1-.5H3zM8 4v8.5',
  link: 'M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.8.8M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.8-.8',
  media: 'M4.5 3h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M6 5.3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4M3 12l3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5',
  doc: 'M4 1.5h5l3 3v10H4zM9 1.5v3h3M6 7h4M6 9.5h4M6 12h2',
  deck: 'M3.7 3.5h8.6a1.2 1.2 0 0 1 1.2 1.2v5.1a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2V4.7a1.2 1.2 0 0 1 1.2-1.2M5.5 13.5h5',
  'draw-ink': 'm3 11 8-8 2 2-8 8-3 1zM9 5l2 2',
  'draw-shape': 'M3 2h6a1 1 0 0 1 1 1v3M6 10H3a1 1 0 0 1-1-1V3M10 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8',
  vector: 'm8 1 5 8-5 6-5-6zM8 1v7M8 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
  'draw-stamp': 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M5 6h.1M11 6h.1M5 9q3 4 6 0',
  wireframe: 'M5 1h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2m1 11h4',
  'import-image': 'M3 10v4h10v-4M8 1v9m-3-3 3 3 3-3',
  swatch: 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3M8 3v10M3 8h10',
  audio: 'M8 2a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0V4a2 2 0 0 1 2-2M3 7v1a5 5 0 0 0 10 0V7M8 13v2',
  video: 'M4 4h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m6 2 4-2v8l-4-2',
  canvas: 'M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2M5 5h6M5 8h4',
  templates: 'M3 2h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1m7 0h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1M3 9h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1m6 2.5h5M11.5 9v5',
  coll: 'M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2M2 6h12',
  undo: 'M5.5 3.5 2.5 6.5l3 3M3 6.5h6.5a4 4 0 0 1 0 8H7',
  redo: 'm10.5 3.5 3 3-3 3M13 6.5H6.5a4 4 0 0 0 0 8H9',
  more: 'M3 8h.01M8 8h.01M13 8h.01',
  left: 'm10 4-4 4 4 4',
  right: 'm6 4 4 4-4 4',
  close: 'm4 4 8 8M12 4l-8 8',
  plus: 'M3 8h10M8 3v10',
  window: 'M3.75 2.75h8.5a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-8.5a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2M6 3v10',
  lock: 'M4 7h8v6H4zM5 7V5a3 3 0 0 1 6 0v2',
  hidden: 'm2 2 12 12M6 4c4-1 7 2 8 4l-2 3M9 12c-4 1-6-2-7-4l2-3',
  rotate: 'M12.5 6a5 5 0 1 0 .5 4M9 6h4V2',
  align: 'M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h7',
  colour: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11M8 2.5v11',
  ai: 'm8 2 1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5Z',
  bold: 'M4.5 2.5h4a2.75 2.75 0 0 1 0 5.5h-4m0 0H9a2.75 2.75 0 0 1 0 5.5H4.5z',
  italic: 'M7 2.5h6M3 13.5h6M10 2.5l-4 11',
  duplicate: 'M7 5.5h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 12V7A1.5 1.5 0 0 1 7 5.5m3.5 0v-3h-8v8h3',
  delete: 'M2.5 4h11M6 4V2h4v2M4 4l.5 10h7L12 4M6.5 6.5v5M9.5 6.5v5',
  group: 'M5.5 2.5h-3v3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M6.5 5.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1',
  open: 'M9 2.5h4.5V7M13.5 2.5l-7 7M6 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-3',
  replace: 'M3 6a5 5 0 0 1 9-2l1.5 2M13.5 2v4H9.5M13 10a5 5 0 0 1-9 2l-1.5-2M2.5 14v-4h4',
  download: 'M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 10.5v3h11v-3',
  arrange: 'M2.5 2.5v11M5.5 4.5h7M5.5 8h4.5M5.5 11.5h6',
  unlock: 'M4 7h8v6H4zM5 7V5a3 3 0 0 1 5.8-1',
  agents: 'M5 3.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M11 3.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M1.5 13c.6-2 2-3 3.5-3s2.9 1 3.5 3M7.5 13c.6-2 2-3 3.5-3s2.9 1 3.5 3',
  settings: 'M2.5 4.5h5.5M11 4.5h2.5M2.5 11.5h2.5M8 11.5h5.5M9.5 3v3M6.5 10v3',
  command: 'M6 6V4.5A1.5 1.5 0 1 0 4.5 6H6zm0 0h4M6 6v4m4-4V4.5A1.5 1.5 0 1 1 11.5 6H10zm0 0v4m0 0v1.5a1.5 1.5 0 1 0 1.5-1.5H10zm0 0H6m0 0v1.5A1.5 1.5 0 1 1 4.5 10H6z',
  idea: 'M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2v.1h4v-.1c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5',
  zoom: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9M13.5 13.5l-3.3-3.3M5 7h4M7 5v4',
} as const;

export type IconName = keyof typeof paths;
export const iconNames = Object.keys(paths);
export function isIconName(name: string): name is IconName { return Object.hasOwn(paths, name); }

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" data-icon={name}>
      <path d={paths[name]} />
    </svg>
  );
}
