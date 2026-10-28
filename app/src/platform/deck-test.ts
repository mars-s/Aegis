import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeckChartSchema } from '@aegis/domain/schema';
import { ValueChart } from '../editors/deck/ValueChart.js';

/** Browser probe: the slide chart markup the deck editor ships, at its presentation size. */
export function lineChart(chart: unknown): string {
  return renderToStaticMarkup(createElement(ValueChart, { chart: DeckChartSchema.parse(chart), width: 520, height: 210, presentationHeight: 540 }));
}
