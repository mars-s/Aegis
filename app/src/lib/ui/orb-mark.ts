import '../../features/agents/orb.css';
import './orb-mark.css';

// Inline actions use the same folded ribbons as the app orb, still until busy.
export const OrbMark = (): string => '<span class="orb-mark orb-inline" aria-hidden="true"><span class="orb-colours"></span><span class="orb-light"></span></span>';
