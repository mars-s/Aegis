import type { CardContent } from '@aegis/domain';
import type { ObjectData, ObjectKind } from '@aegis/domain/objects';

export type ObjectContent = Extract<CardContent, { type: 'object' }>;
export type { ObjectData, ObjectKind };
export const objectNames = {
  reply: 'Reply', plot: 'Plot', sheet: 'Sheet', diagram: 'Diagram', plan: 'Plan', list: 'List', code: 'Code',
  stats: 'Stats', timeline: 'Timeline', kanban: 'Kanban', table: 'Table', progress: 'Progress', compare: 'Comparison',
  gallery: 'Gallery', stages: 'Stages', callout: 'Callout', form: 'Form', html: 'Custom UI',
} satisfies Record<ObjectKind, string>;
export const generatedKinds = new Set<ObjectKind>(['stats', 'timeline', 'kanban', 'table', 'progress', 'compare', 'gallery', 'stages', 'callout', 'form', 'html']);
