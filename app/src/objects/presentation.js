import { OBJECT_KINDS } from '../lib/board/objects.js';

export const OBJECT_NAMES = { reply: 'Reply', plot: 'Plot', sheet: 'Sheet', diagram: 'Diagram', plan: 'Plan', list: 'List', code: 'Code', stats: 'Stats', timeline: 'Timeline', kanban: 'Kanban', table: 'Table', progress: 'Progress', compare: 'Comparison', gallery: 'Gallery', stages: 'Stages', callout: 'Callout', form: 'Form', html: 'Custom UI' };
export const canOpenObject = kind => OBJECT_KINDS.includes(kind);
// Sheets keep their cell editor. Every other supported kind benefits from a reading or working view.
export const expandsObject = card => card?.type === 'object' && card.kind !== 'sheet' && canOpenObject(card.kind);
