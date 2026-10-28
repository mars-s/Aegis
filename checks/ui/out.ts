// Screenshots, downloads and logs from UI checks go to AEGIS_CHECK_OUT (default: a temp folder).
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = process.env.AEGIS_CHECK_OUT || join(tmpdir(), 'aegis-check');
mkdirSync(dir, { recursive: true });
export const out = (name: string) => join(dir, name);
