import { OBJECT_SIZE } from '@aegis/domain/objects';
import './drafts.css';

// Skeleton windows for what an agent is still writing. The host streams each create command as the model emits it;
// these previews are never saved and disappear the moment the real batch lands, or when the run stops or fails.
const SIZE = { doc: [560, 520], deck: [660, 420], note: [240, 120], todo: [260, 180], title: [360, 56], image: [320, 220], link: [260, 76] };
const LABEL = { doc: 'Document', deck: 'Slides', note: 'Note', todo: 'Checklist', title: 'Title', sheet: 'Sheet', plot: 'Chart', diagram: 'Diagram', stats: 'Stats', table: 'Table', kanban: 'Board', timeline: 'Timeline', progress: 'Progress', compare: 'Comparison', stages: 'Stages', callout: 'Callout', form: 'Form', html: 'Custom UI', list: 'List', code: 'Code', plan: 'Plan', reply: 'Reply', gallery: 'Gallery' };
const sizeOf = d => (d.type === 'object' ? OBJECT_SIZE[d.kind] : SIZE[d.type]) ?? [420, 280];
const SCALE = 0.5, GAP = 16, COLUMN = 2;

function body(kind) {
  // A quiet hint of the content's shape: lines for prose, a grid for tables, a thin line for charts.
  if (['sheet', 'table'].includes(kind)) return '<div class="draft-grid">' + '<i></i>'.repeat(12) + '</div>';
  if (kind === 'plot') return '<svg class="draft-plot" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30 C 15 26 22 12 35 16 S 58 34 70 20 S 90 8 100 12"/></svg>';
  if (['diagram', 'stages', 'kanban'].includes(kind)) return '<div class="draft-row">' + '<i></i>'.repeat(4) + '</div>';
  return '<div class="draft-lines"><i></i><i></i><i></i></div>';
}

export function mountAgentDrafts({ canvas, layer, anchor }) {
  const live = new Map(); // agent id -> Map(draft id -> element)
  function sync(agent) {
    const drafts = agent.running && agent.boardId === canvas.board?.id ? agent.drafts ?? [] : [];
    let mine = live.get(agent.id);
    if (!drafts.length) { if (mine) { for (const el of mine.values()) leave(el); live.delete(agent.id); } return; }
    if (!mine) live.set(agent.id, mine = new Map());
    const seen = new Set();
    drafts.forEach((d, i) => {
      seen.add(d.id);
      let el = mine.get(d.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'agent-draft'; el.setAttribute('aria-hidden', 'true');
        el.innerHTML = '<div class="draft-strip"><span class="draft-title"></span><span class="draft-kind"></span></div><div class="draft-body"></div>';
        el.querySelector('.draft-body').innerHTML = body(d.kind ?? d.type);
        layer.append(el); mine.set(d.id, el);
      }
      const [w, h] = sizeOf(d), kind = LABEL[d.kind ?? d.type] ?? 'Window';
      el.querySelector('.draft-title').textContent = d.title || `New ${kind.toLowerCase()}`;
      el.querySelector('.draft-kind').textContent = ` · ${kind}`;
      el.classList.toggle('writing', !d.done);
      Object.assign(el.dataset, { w, h, index: i, agent: agent.id });
    });
    for (const [id, el] of mine) if (!seen.has(id)) { leave(el); mine.delete(id); }
    paint();
  }
  function leave(el) {
    el.classList.add('leaving');
    const gone = () => el.remove();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-off')) gone();
    else { el.addEventListener('transitionend', gone, { once: true }); setTimeout(gone, 300); }
  }
  function paint() {
    const z = canvas.view.z;
    for (const [id, mine] of live) {
      const origin = anchor(id); if (!origin) continue;
      // Two columns of half-scale skeletons beside the agent, in the order the model writes them.
      const heights = [0, 0], shown = [...mine.values()].filter(el => !el.classList.contains('leaving'));
      const column = Math.max(...shown.map(el => Number(el.dataset.w) * SCALE)) + GAP;
      for (const el of shown) {
        const col = Number(el.dataset.index) % COLUMN, w = Number(el.dataset.w) * SCALE, h = Number(el.dataset.h) * SCALE;
        const x = origin.x + col * column, y = origin.y + heights[col];
        heights[col] += h + GAP;
        const p = canvas.worldToScreen(x, y);
        el.style.width = `${w}px`; el.style.height = `${h}px`;
        el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${z})`;
      }
    }
  }
  return { sync, paint, clear(id) { const mine = live.get(id); if (mine) { for (const el of mine.values()) leave(el); live.delete(id); } } };
}
