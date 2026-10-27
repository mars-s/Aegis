const GLYPH = {
  Undo: '<path d="M5.5 6H10a3.5 3.5 0 0 1 0 7H7M5.5 6l2.5-2.5M5.5 6 8 8.5"/>',
  Redo: '<path d="M10.5 6H6a3.5 3.5 0 0 0 0 7h3M10.5 6 8 3.5M10.5 6 8 8.5"/>',
  Bold: '<path d="M4.5 2.5h4a2.75 2.75 0 0 1 0 5.5h-4m0 0H9a2.75 2.75 0 0 1 0 5.5H4.5z"/>',
  Italic: '<path d="M7 2.5h6M3 13.5h6M10 2.5l-4 11"/>',
  Underline: '<path d="M4 2.5v5a4 4 0 0 0 8 0v-5M3 14h10"/>',
  Strikethrough:
    '<path d="M11.5 4c-1-2-6.5-2-6.5 1 0 1.5 1.5 2 3 2.5M3 8h10M5 11.5c1 2.5 7 2.5 7-.5 0-.7-.4-1.3-1-1.7"/>',
  Link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.5.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.5-.5"/>',
  "Bullet list":
    '<circle cx="3.5" cy="4.5" r=".8"/><circle cx="3.5" cy="8" r=".8"/><circle cx="3.5" cy="11.5" r=".8"/><path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7"/>',
  "Numbered list":
    '<path d="M3 3.5h1v3M3 6.5h2M2.8 9.5h1.7l-1.7 3h1.9M6.5 4.5h7M6.5 8h7M6.5 11.5h7"/>',
  "Task list":
    '<rect x="2.5" y="3" width="3" height="3" rx=".6"/><path d="m3 11 1 1 1.8-2M7.5 4.5h6M7.5 11h6"/>',
  "Insert image":
    '<rect x="2" y="2.5" width="12" height="11" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="m2.5 12 3.5-3.5 3 3 2-2 2.5 2.5"/>',
  "Insert table":
    '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M2 10h12M6.5 2.5v11"/>',
  Divider: '<path d="M2 8h12M5 4.5h6M5 11.5h6"/>',
  "Clear formatting": '<path d="M3 13h10M5 10l5.5-6.5 2.5 2.5L7.5 12H5z"/>',
  "Decrease font size": '<path d="M4 8h8"/>',
  "Increase font size": '<path d="M4 8h8M8 4v8"/>',
};

const paths = new Map(Object.entries(GLYPH));
export function DocumentIcon({ name }: { readonly name: string }) {
  const path = paths.get(name);
  return path ? (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: path }}
    />
  ) : null;
}
