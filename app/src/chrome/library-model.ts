import type { Board, BoardId, Source } from "@aegis/domain";
import type { BoardListEntry } from "@aegis/protocol/http";
import type { StoredLibrary } from "@aegis/protocol/storage";

export type LibraryNode = Pick<
  StoredLibrary["nodes"][number],
  "id" | "kind" | "name" | "parent" | "cover"
>;
export type LibraryBoard = Pick<
  BoardListEntry,
  "id" | "name" | "cards" | "rev" | "boardParent" | "editedAt" | "subtitle"
> & { readonly parent: string | null };
export interface LibrarySnapshot {
  readonly nodes: readonly LibraryNode[];
  readonly boards: readonly LibraryBoard[];
}
export type LibraryItem =
  | (LibraryNode & { readonly item: "node" })
  | (LibraryBoard & { readonly item: "board" });
export type LibraryDestination =
  | { readonly kind: "folder"; readonly id: string | null }
  | { readonly kind: "board"; readonly id: BoardId };

// Proposed semantic service for the host-client owner. Chrome never gets transport access.
// remove owns the durable eight-second Undo period, including reload and final-board recovery.
export interface LibraryService {
  readonly source: Source<LibrarySnapshot>;
  readonly refresh: (signal: AbortSignal) => Promise<void>;
  readonly open: (id: BoardId) => Promise<boolean>;
  readonly load: (id: BoardId, signal: AbortSignal) => Promise<Board>;
  readonly create: (
    kind: "board" | "folder" | "project",
    parent: string | null,
  ) => Promise<string>;
  readonly rename: (item: LibraryItem, name: string) => Promise<void>;
  readonly move: (
    item: LibraryItem,
    destination: LibraryDestination,
  ) => Promise<void>;
  readonly duplicate: (item: LibraryItem) => Promise<string>;
  readonly cover: (id: string, jpeg: string | null) => Promise<void>;
  readonly remove: (
    item: LibraryItem,
  ) => Promise<{ readonly undo: () => Promise<void> }>;
}

export function libraryItems(data: LibrarySnapshot): LibraryItem[] {
  return [
    ...data.nodes.map((node) => ({ ...node, item: "node" as const })),
    ...data.boards.map((board) => ({ ...board, item: "board" as const })),
  ];
}

export function ancestors(data: LibrarySnapshot, id: string): LibraryItem[] {
  const items = new Map(libraryItems(data).map((item) => [item.id, item]));
  const chain: LibraryItem[] = [],
    seen = new Set<string>([id]);
  let current = items.get(id);
  while (current) {
    const parent =
      current.item === "board"
        ? (current.boardParent ?? current.parent)
        : current.parent;
    if (!parent || seen.has(parent)) break;
    seen.add(parent);
    current = items.get(parent);
    if (current) chain.unshift(current);
  }
  return chain;
}

export function scopeRoot(
  data: LibrarySnapshot,
  id: string,
): LibraryNode | undefined {
  const item = data.nodes.find((node) => node.id === id);
  return ancestors(data, id).find((node) => node.item === "node") ?? item;
}
