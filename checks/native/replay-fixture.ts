import { BoardSchema } from '@aegis/domain';
export const BOARD_ID = 'native-perf';

// Owned synthetic content only. No remote media, sandbox or provider requests.
export function mixedBoard() {
  const cards = Array.from({ length: 300 }, (_, index) => {
    const base = {
      id: `native${index.toString().padStart(4, '0')}`, type: 'note', color: 'plain',
      x: index % 20 * 280, y: Math.floor(index / 20) * 210, w: 260, h: 190,
      text: `Native window ${index}`, props: { fixedHeight: true },
    };
    switch (index % 6) {
      case 0: return { ...base, text: `Note ${index}\nA short synthetic note for the native canvas replay.` };
      case 1: return { ...base, type: 'todo', items: [{ text: 'Measure pan', done: true }, { text: 'Measure zoom', done: false }] };
      case 2: return { ...base, type: 'doc', props: { ...base.props, docTitleMigrated: true, body: '## Native measurement\n\nSynthetic document content.\n\n- Pan the board\n- Zoom at real world sizes' } };
      case 3: return { ...base, type: 'object', kind: 'sheet', data: {
        columns: [{ label: 'Run', kind: 'text' }, { label: 'Frames', kind: 'number' }],
        rows: [{ cells: ['Pan', '240'] }, { cells: ['Zoom out', '180'] }, { cells: ['Zoom in', '180'] }], note: 'Synthetic measurement data',
      } };
      case 4: return { ...base, type: 'object', kind: 'plot', data: {
        style: 'bar', x: { kind: 'category' }, y: { format: 'number' },
        series: [{ name: 'Frames', points: [{ x: 'A', y: 12 }, { x: 'B', y: 24 }, { x: 'C', y: 18 }] }],
        basis: 'Synthetic measurement data',
      } };
      case 5: return { ...base, type: 'object', kind: 'stats', data: {
        tiles: [{ label: 'Windows', value: '300' }, { label: 'Target Hz', value: '120', sparkline: [90, 110, 100, 120] }], note: 'Synthetic measurement data',
      } };
      default: throw new Error('Unknown fixture kind');
    }
  });
  return BoardSchema.parse({ id: BOARD_ID, name: 'Disposable native React replay', rev: 0, cards, links: [], view: { x: -60, y: 25, z: 0.28 } });
}

export interface ReplayStep { readonly phase: "pan" | "zoom-out" | "zoom-in"; readonly dx: number; readonly dy: number; readonly zoom: boolean }

export function replayPlan(): readonly ReplayStep[] {
  const pan = Array.from({ length: 240 }, (_, index): ReplayStep => ({ phase: 'pan', dx: 3 * Math.cos(2 * Math.PI * index / 240), dy: 2 * Math.sin(2 * Math.PI * index / 240), zoom: false }));
  const zoom = (phase: "zoom-out" | "zoom-in", from: number, to: number) => Array.from({ length: 180 }, (): ReplayStep => ({ phase, dx: 0, dy: -Math.log(to / from) / 1.8, zoom: true }));
  return [...pan, ...zoom('zoom-out', 0.28, 0.18), ...zoom('zoom-in', 0.18, 0.42)];
}
