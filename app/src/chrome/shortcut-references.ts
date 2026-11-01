import { z } from 'zod/v4';
import { SHORTCUTS } from '../lib/shortcuts.js';
import type { ShortcutReference } from './ShortcutDialog.js';

const CatalogueSchema = z.record(z.string(), z.object({ label: z.string(), display: z.string() }));
export const shortcutReferences: readonly ShortcutReference[] = Object.entries(CatalogueSchema.parse(SHORTCUTS)).map(([id, item]) => ({ id, label: item.label, text: item.display }));
