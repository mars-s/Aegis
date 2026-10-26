import { mount, unmount } from 'svelte';
import DeckChart from './DeckChart.svelte';

export function mountDeckCharts(root, { deckId, onChartSource } = {}) {
  const components = [], observers = [];
  for (const target of root.querySelectorAll('[data-chart-model]')) {
    const model = JSON.parse(target.dataset.chartModel);
    const miniature = !!target.closest('.deck-thumb, .deck-film-item, .semantic-deck');
    const fit = target.closest('.deck-fit');
    const art = target.closest('.s-art');
    const slide = art.closest('.deck-slide');
    // Keep screen-pixel chart rendering aligned with the slide's flowing composition.
    const place = () => {
      const scale = Math.min(fit.clientWidth / slide.clientWidth, fit.clientHeight / slide.clientHeight);
      Object.assign(target.style, {
        left: `${(fit.clientWidth - slide.clientWidth * scale) / 2 + art.offsetLeft * scale}px`,
        top: `${(fit.clientHeight - slide.clientHeight * scale) / 2 + art.offsetTop * scale}px`,
        width: `${art.clientWidth * scale}px`, height: `${art.clientHeight * scale}px`,
      });
    };
    fit.append(target);
    const observer = new ResizeObserver(place);
    observer.observe(art); observer.observe(fit); observers.push(observer);
    place();
    components.push(mount(DeckChart, { target, props: { ...model, deckId, miniature,
      onchoose: !miniature && onChartSource ? id => onChartSource(model.slideId, id) : undefined } }));
  }
  return () => { observers.forEach(observer => observer.disconnect()); components.forEach(component => { void unmount(component); }); };
}
