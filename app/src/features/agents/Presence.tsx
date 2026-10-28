import { useEffect, useState } from 'react';
import type { CardId } from '@aegis/domain/schema';
import './presence.css';

export interface PresenceActivity {
  readonly name: string;
  readonly ids: readonly CardId[];
  readonly at: number;
}

const HOLD_MS = 20_000;
const FRESH_MS = 4_000;

/** A lasting cue that a connected agent changed the board, because a single quick batch is easy to miss. */
export function Presence({ activity, onShow }: { readonly activity: PresenceActivity | null; readonly onShow: (ids: readonly CardId[]) => void }) {
  const [visible, setVisible] = useState(false);
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    if (!activity) { setVisible(false); return; }
    setVisible(true); setFresh(true);
    const stale = setTimeout(() => setFresh(false), FRESH_MS);
    const hide = setTimeout(() => setVisible(false), HOLD_MS);
    return () => { clearTimeout(stale); clearTimeout(hide); };
  }, [activity]);
  if (!activity || !visible) return null;
  const count = activity.ids.length === 1 ? 'changed 1 card' : `changed ${activity.ids.length} cards`;
  return <button type="button" className="mcp-presence" data-fresh={fresh ? 'true' : 'false'} title="Show what changed" onClick={() => onShow(activity.ids)}>
    <span className="mcp-presence-dot" aria-hidden="true" />
    <span className="mcp-presence-name">{activity.name}</span>
    <span className="mcp-presence-count">{count}</span>
  </button>;
}
