import '../../features/colours/legacy-menu.js';
// Development-only fixture. The browser driver supplies the real workspace and semantic host adapter.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mountDropdowns } from '../../lib/ui/dropdown.js';
import { createRoot } from 'react-dom/client';
import type { CanvasEngine } from '@aegis/scene';
import type { Workspace } from '../../workspace/index.js';
import type { FeatureContext } from '../../composition.js';
import { defineComposition } from '../../composition.js';
import { NoteBody } from '../basic/Note.js';
import { Canvas } from '../../canvas/Canvas.js';
import { CreativeProvider, useCreativeServices, useRecordingStore } from '../../features/media/services.js';
import type { CreativeServices } from '../../features/media/services.js';
import { DrawingInspector } from '../../features/draw/Inspector.js';
import type { DrawTarget } from '../../features/draw/Inspector.js';
import { AppearanceColours } from '../../features/colours/AppearanceColours.js';
import { BoardColours } from '../../features/colours/BoardColours.js';
import { DevicesPanel } from '../../features/media/DevicesPanel.js';
import { WireframePanel } from '../../features/wireframe/WireframePanel.js';
import { pieceCommands, screenCommand, wireCard } from '../../features/wireframe/commands.js';
import { createImporter, ImportProgressView } from '../../features/imports/react.js';
import type { ImportProgress } from '../../features/imports/react.js';
import { creativeCards } from './index.js';
import '@fontsource-variable/inter/opsz.css';
import '../../styles/tokens.css';
import '../../styles/react.css';
const composition = defineComposition({ cards: [{ kind: 'note', Body: NoteBody }, ...creativeCards], tools: [], menus: [], editors: [], panels: [] });
interface Ready { readonly context: FeatureContext; readonly importer: ReturnType<typeof createImporter>; readonly inspect: (target: DrawTarget | null) => void }
function Proof({ workspace, ready }: { readonly workspace: Workspace; readonly ready: (value: Ready) => void }) {
  const services = useCreativeServices(), recordings = useRecordingStore(), engine = useRef<CanvasEngine | null>(null);
  const [drawTarget, setDrawTarget] = useState<DrawTarget | null>(null);
  const [panel, setPanel] = useState<'colours' | 'appearance' | 'devices' | 'wireframe' | null>(null), [progress, setProgress] = useState<ImportProgress | null>(null);
  const context = useMemo<FeatureContext>(() => ({ workspace, engine: () => engine.current, openEditor: () => { throw new Error('Editors are outside this creative fixture.'); }, closeEditor: () => true }), [workspace]);
  const [importer] = useState(() => createImporter(context, services, setProgress, recordings));
  const attached = useCallback((instance: CanvasEngine | null) => { engine.current = instance; if (instance) ready({ context, importer, inspect: setDrawTarget }); }, [context, importer, ready]);
  const cameraChanged = useCallback(() => {}, []);
  useEffect(() => { const stage = document.getElementById('stage'); return stage ? importer.install(stage) : undefined; }, [importer]);
  return <main className="react-app"><Canvas workspace={workspace} composition={composition} attached={attached} cameraChanged={cameraChanged} /><nav className="react-tools" aria-label="Creative verification controls"><button onClick={() => setPanel('colours')}>Board colours</button><button onClick={() => setPanel('appearance')}>Appearance colours</button><button onClick={() => setPanel('devices')}>Media devices</button><button onClick={() => setPanel('wireframe')}>Wireframe</button><button onClick={importer.choose}>Import</button></nav>
    {panel === 'colours' && <aside style={{ position: 'absolute', top: 20, right: 20, width: 280, zIndex: 20, background: 'var(--card)' }}><button onClick={() => setPanel(null)}>Close palette</button><BoardColours context={context} /></aside>}
    {panel === 'appearance' && <aside style={{ position: 'absolute', top: 20, right: 20, width: 320, zIndex: 20, background: 'var(--card)' }}><button onClick={() => setPanel(null)}>Close appearance</button><AppearanceColours mode="dark" board={workspace.scene.snapshot} invalidate={() => engine.current?.invalidate()} /></aside>}
    {panel === 'devices' && <aside style={{ position: 'absolute', top: 20, right: 20, width: 280, zIndex: 20, background: 'var(--card)' }}><button onClick={() => setPanel(null)}>Close devices</button><DevicesPanel /></aside>}
    {panel === 'wireframe' && <WireframePanel context={context} onClose={() => setPanel(null)} onPlace={request => { const at = { x: 800, y: 80 }; const commands = request.kind === 'piece' ? pieceCommands(request.name, at, workspace.scene.snapshot().cards) : request.kind === 'screen' ? [screenCommand(request.device, at)] : [wireCard({ type: request.kind, ...(request.kind === 'icon' ? { name: request.name } : {}) }, at.x, at.y)]; workspace.submit(commands); }} />}
    {drawTarget && <DrawingInspector context={context} target={drawTarget} onSettings={() => {}} onArm={request => { if (request.kind === 'edit-points') throw new Error('Continuous input is outside this fixture.'); setDrawTarget({ kind: 'tool', tool: request.kind }); }} onFinish={() => setDrawTarget(null)} />}
    <ImportProgressView value={progress} />
  </main>;
}
export function mountProof(target: HTMLElement, workspace: Workspace, services: CreativeServices, ready: (value: Ready) => void) {
  if (!import.meta.env.DEV) throw new Error('This fixture is only available in development.');
  mountDropdowns();
  document.documentElement.dataset.theme = 'dark';
  const root = createRoot(target); root.render(<CreativeProvider services={services} workspace={workspace}><Proof workspace={workspace} ready={ready} /></CreativeProvider>);
  return () => root.unmount();
}

export { createWorkspace } from '../../workspace/index.js';
export { createHostClient, connectWorkspace } from '@aegis/host-client';
