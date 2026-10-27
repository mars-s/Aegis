import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';

export async function atomicFile(path: string, contents: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, path);
}
export const atomicJson = (path: string, value: unknown): Promise<void> => atomicFile(path, JSON.stringify(value));
export async function readJson(path: string, fallback: unknown): Promise<unknown> {
  try { const value: unknown = JSON.parse(await readFile(path, 'utf8')); return value; }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return fallback; throw error; }
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function errorStatus(error: unknown): number { return z.object({ status: z.number().int().min(400).max(599) }).safeParse(error).data?.status ?? 400; }
