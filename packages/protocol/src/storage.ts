import { z } from 'zod/v4';
import { BoardSchema, LegacyBoardSchema, JsonSchema, preserve } from '@aegis/domain/schema';
import type { Board, LegacyBoard } from '@aegis/domain/schema';

// Catchall fields retain future and imported metadata byte-for-byte in JSON values.
const LibraryNodeSchema = z.object({id:z.string(),kind:z.enum(['project','folder']),name:z.string(),parent:z.string().nullable(),cover:z.string().optional()}).catchall(JsonSchema);
export const StoredLibrarySchema = z.object({nodes:z.array(LibraryNodeSchema),boards:z.record(z.string(),z.string())}).catchall(JsonSchema);
export type StoredLibrary = z.output<typeof StoredLibrarySchema>;
export function decodeStoredBoard(value: unknown): Board { return preserve(BoardSchema,value); }
export function encodeStoredBoard(board: LegacyBoard): string { return JSON.stringify(board); }
export function decodeStoredLibrary(value: unknown): StoredLibrary { return preserve(StoredLibrarySchema,value); }
export function encodeStoredLibrary(library: StoredLibrary): string { return JSON.stringify(library); }

export const decodeLegacyStoredBoard = (value:unknown):LegacyBoard => preserve(LegacyBoardSchema,value);
