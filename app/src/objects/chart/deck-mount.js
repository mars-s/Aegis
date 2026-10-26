import { mount, unmount } from 'svelte';
import DeckChart from './DeckChart.svelte';

export function mountDeckCharts(root, { deckId, onChartSource } = {}) {
  const components = [];
  for (const target of root.querySelectorAll('[data-chart-model]')) {
    const model = JSON.parse(target.dataset.chartModel);
    const miniature = !!target.closest('.deck-thumb, .deck-film-item, .semantic-deck');
    const fit = target.closest('.deck-fit');
    fit.append(target);
    components.push(mount(DeckChart, { target, props: { ...model, deckId, miniature,
      onchoose: !miniature && onChartSource ? id => onChartSource(model.slideId, id) : undefined } }));
  }
  return () => components.forEach(component => { void unmount(component); });
}
