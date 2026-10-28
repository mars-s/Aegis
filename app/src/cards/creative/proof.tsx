// Development-only fixture. The browser driver supplies the real workspace and semantic host adapter.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mountDropdowns } from '../../lib/ui/dropdown.js';
import { createRoot } from 'react-dom/client';
import type { LinkId } from '@aegis/domain';
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
import { placementTool } from '../../features/wireframe/tool.js';
import { drawingTool } from '../../features/draw/tool.js';
import { beginPointEdit } from '../../features/draw/point-editor.js';
import { readPreferences } from '../../features/draw/preferences.js';
import type { DrawSettings } from '../../features/draw/Inspector.js';
import { CreativeConnections } from '../../features/draw/Connections.js';
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
  const settings = useRef<DrawSettings>({ ...readPreferences(), shape: 'rect', fill: '#aed3ff', stroke: 'ink', sw: 2.5, sdash: 'solid', dl: 8, dg: 6, emoji: '⭐' });
  const [panel, setPanel] = useState<'colours' | 'appearance' | 'devices' | 'wireframe' | null>(null), [progress, setProgress] = useState<ImportProgress | null>(null);
  const context = useMemo<FeatureContext>(() => ({ workspace, engine: () => engine.current, openEditor: () => { throw new Error('Editors are outside this creative fixture.'); }, closeEditor: () => true }), [workspace]);
  const [importer] = useState(() => createImporter(context, services, setProgress, recordings));
  const attached = useCallback((instance: CanvasEngine | null) => { engine.current = instance; if (instance) ready({ context, importer, inspect: setDrawTarget }); }, [context, importer, ready]);
  const cameraChanged = useCallback(() => {}, []);
  const connectionSelected = useCallback((id: LinkId | null) => { if (id) setDrawTarget(null); }, []);
  useEffect(() => { const stage = document.getElementById('stage'); return stage ? importer.install(stage) : undefined; }, [importer]);
  return <main className="react-app"><Canvas workspace={workspace} composition={composition} attached={attached} cameraChanged={cameraChanged} /><nav className="react-tools" aria-label="Creative verification controls"><button onClick={() => setPanel('colours')}>Board colours</button><button onClick={() => setPanel('appearance')}>Appearance colours</button><button onClick={() => setPanel('devices')}>Media devices</button><button onClick={() => setPanel('wireframe')}>Wireframe</button><button onClick={importer.choose}>Import</button></nav>
    {panel === 'colours' && <aside style={{ position: 'absolute', top: 20, right: 20, width: 280, zIndex: 20, background: 'var(--card)' }}><button onClick={() => setPanel(null)}>Close palette</button><BoardColours context={context} /></aside>}
    {panel === 'appearance' && <aside style={{ position: 'absolute', top: 20, right: 20, width: 320, zIndex: 20, background: 'var(--card)' }}><button onClick={() => setPanel(null)}>Close appearance</button><AppearanceColours mode="dark" board={workspace.scene.snapshot} invalidate={() => engine.current?.invalidate()} /></aside>}
    {panel === 'devices' && <aside style={{ position: 'absolute', top: 20, right: 20, width: 280, zIndex: 20, background: 'var(--card)' }}><button onClick={() => setPanel(null)}>Close devices</button><DevicesPanel /></aside>}
    {panel === 'wireframe' && <WireframePanel context={context} onClose={() => setPanel(null)} onPlace={request => { const scene = engine.current; if (scene) scene.tool(placementTool(scene, workspace, request)); }} />}
    {drawTarget && <DrawingInspector context={context} target={drawTarget} onSettings={next => { settings.current = next; }} onArm={(request, next) => { settings.current = next; const scene = engine.current; if (!scene) return; if (request.kind === 'edit-points') { beginPointEdit(workspace, scene, request.id); return; } setDrawTarget({ kind: 'tool', tool: request.kind }); scene.tool(drawingTool(scene, workspace, request.kind, () => settings.current, () => setDrawTarget(null))); }} onFinish={() => { engine.current?.tool(null); setDrawTarget(null); }} />}
    <CreativeConnections context={context} onSelectionChange={connectionSelected} />
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
export { drawingTool } from '../../features/draw/tool.js';
export { placementTool } from '../../features/wireframe/tool.js';
export { mediaPlacementTool } from '../../features/media/placement-tool.js';
export { readPreferences } from '../../features/draw/preferences.js';
export { startCreativeConnection } from '../../features/draw/Connections.js';
