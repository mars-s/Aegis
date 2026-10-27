import './react.css';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { BoardId, Command } from '@aegis/domain';
import { installAppearance } from '../colours/appearance.js';
import { installBoardBackground } from '../colours/board-background.js';
import { createRecordingStore } from './recording-store.js';
import type { RecordingSession } from './recording-store.js';
import type { FeatureWorkspace } from '../../composition.js';
import type { CardId } from '@aegis/domain';
import type { ImportHost } from '../imports/types.js';

export interface LinkPreview { readonly title?: string; readonly description?: string; readonly image?: string; readonly favicon?: string }
// The composition root supplies semantic host operations. Feature code never receives credentials or a generic HTTP client.
export interface CreativeServices extends ImportHost {
  readonly linkPreview: (url: string, signal: AbortSignal) => Promise<LinkPreview>;
  readonly commitToBoard: (boardId: BoardId, commands: readonly Command[]) => Promise<void>;
  readonly openUrl: (url: string) => Promise<void>;
  readonly notify: (message: string) => void;
  readonly importCSV: (file: File, boardId: BoardId, at: { x: number; y: number }) => Promise<void>;
}
const Services = createContext<CreativeServices | null>(null);
const Recordings = createContext<ReturnType<typeof createRecordingStore> | null>(null);
export function CreativeProvider({ services, workspace, children }: { readonly services: CreativeServices; readonly workspace: FeatureWorkspace; readonly children: ReactNode }) { useEffect(() => installBoardBackground(workspace), [workspace]); useEffect(installAppearance, []); const [recordings] = useState(() => createRecordingStore(services)); useEffect(() => () => recordings.dispose(), [recordings]); return <Services.Provider value={services}><Recordings.Provider value={recordings}><div className="creative-root">{children}</div></Recordings.Provider></Services.Provider>; }
export function useCreativeServices(): CreativeServices {
  const services = useContext(Services);
  if (!services) throw new Error('CreativeProvider must receive the host services from the composition root.');
  return services;
}

export function useRecordingSession(workspace: FeatureWorkspace, cardId: CardId, video: boolean, shape: 'wide' | 'phone', mirror: boolean): RecordingSession {
 const store = useContext(Recordings); if (!store) throw new Error('CreativeProvider must own recording sessions.');
 const session = store.session(workspace, cardId, video, shape, mirror);
 useEffect(() => { session.configure(shape, mirror); }, [session, shape, mirror]);
 return session;
}

export function useRecordingStore() { const store = useContext(Recordings); if (!store) throw new Error('CreativeProvider must own recording sessions.'); return store; }
