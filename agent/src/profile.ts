import { join } from 'node:path';
import { ProfileSchema, ProfileFieldsSchema } from '@aegis/domain/profile';
import { atomicJson, readJson } from './files.js';

export function createProfile(data: string) {
  const path = join(data, 'profile.json');
  let chain: Promise<unknown> = Promise.resolve();
  const read = async () => ProfileSchema.parse(await readJson(path, { version: 1, updatedAt: 0 }));
  function write(input: unknown, merge: boolean) {
    const fields = ProfileFieldsSchema.parse(input);
    const task = chain.then(async () => {
      const profile = ProfileSchema.parse({ ...(merge ? await read() : {}), ...fields, version: 1, updatedAt: Date.now() });
      await atomicJson(path, profile); return profile;
    });
    chain = task.catch(() => {}); return task;
  }
  return { read, replace: (input: unknown) => {
    const parsed = ProfileSchema.partial({ version: true, updatedAt: true }).parse(input);
    const { version: _version, updatedAt: _updatedAt, ...fields } = parsed;
    return write(fields, false);
  }, update: (input: unknown) => write(input, true), reset: () => write({}, false) };
}
export type ProfileStore = ReturnType<typeof createProfile>;
