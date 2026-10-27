import { createElement } from 'react';
import type { CardRegistration, EditorRegistration } from '../../composition.js';
import { SheetBody } from '../../cards/data/Sheet.js';
import { PlotBody, PlotEditor } from '../../cards/data/Plot.js';
import { DatasetBody } from '../../cards/data/Dataset.js';
import { SheetEditor } from '../../editors/sheet/SheetEditor.js';
import { flushSheet } from '../../editors/sheet/session.js';
import { DatasetEditor } from '../../editors/dataset/DatasetEditor.js';
import type { DataServices } from './services.js';
export const dataCards: readonly CardRegistration[] = [
  { kind: 'object:sheet', Body: SheetBody },
  { kind: 'object:plot', Body: PlotBody },
  { kind: 'dataset', Body: DatasetBody },
];
export function dataEditors(services: Pick<DataServices, 'assetUrl'>): readonly EditorRegistration[] {
  return [
    { kind: 'object:sheet', Body: SheetEditor, flush: flushSheet },
    { kind: 'object:plot', Body: PlotEditor, flush: () => true },
    { kind: 'dataset', Body: props => createElement(DatasetEditor, { ...props, services }), flush: () => true },
  ];
}
