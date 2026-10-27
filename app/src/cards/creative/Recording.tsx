import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { useCreativeServices, useRecordingSession } from '../../features/media/services.js';
import { DeviceChoices } from '../../features/media/DevicesPanel.js';
import { MediaProps } from './props.js';
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function paintWave(canvas: HTMLCanvasElement | null, samples: readonly number[], progress = 0) {
  const context = canvas?.getContext('2d'); if (!canvas || !context) return;
  const points = samples.length ? samples : Array.from({ length: 80 }, () => .025), step = canvas.width / points.length;
  context.clearRect(0, 0, canvas.width, canvas.height);
  points.forEach((value, i) => { context.fillStyle = i / points.length <= progress ? '#537ce5' : '#9399a6'; const height = Math.max(2, value * canvas.height * .9); context.fillRect(i * step, (canvas.height - height) / 2, Math.max(1, step * .65), height); });
}
export function RecordingBody({ cardId, workspace, engine }: CardBodyProps) {
  const services = useCreativeServices(), card = useCard(workspace, cardId), props = MediaProps.parse(card?.props ?? {}), video = card?.type === 'video';
  const session = useRecordingSession(workspace, cardId, video, props.shape, props.mirror), state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const title = useRef<HTMLInputElement>(null), player = useRef<HTMLMediaElement | null>(null), preview = useRef<HTMLVideoElement>(null), waveform = useRef<HTMLCanvasElement>(null), picker = useRef<HTMLInputElement>(null);
  const source = video ? card?.url : props.src, capture = state.kind === 'preview' || state.kind === 'countdown' || state.kind === 'recording' || state.kind === 'paused' ? state.stream : null;
  const active = state.kind === 'recording' || state.kind === 'paused', busy = ['starting', 'countdown', 'recording', 'paused', 'saving'].includes(state.kind), saved = !!source && !props.replacing && (state.kind === 'idle' || state.kind === 'saved');
  useEffect(() => { const element = title.current; if (element && document.activeElement !== element) element.value = card?.text || (video ? 'Camera recording' : 'Voice memo'); }, [card?.text, video]);
  useEffect(() => { engine.pin(cardId, 'media', busy || state.kind === 'preview' || state.kind === 'save-error'); }, [busy, cardId, engine, state.kind]);
  useEffect(() => { if (preview.current) preview.current.srcObject = capture; }, [capture]);
  useEffect(() => { paintWave(waveform.current, active ? state.samples : props.wave); }, [active, state, props.wave]);
  useEffect(() => {
    const changed = () => { if (session.getSnapshot().kind === 'preview') void session.preview(); };
    window.addEventListener('aegis-media-devices', changed);
    return () => { window.removeEventListener('aegis-media-devices', changed); player.current?.pause(); session.dispose(); engine.pin(cardId, 'media', false); };
  }, [cardId, engine, session]);
  if (!card) return null;
  const titleLabel = video ? 'Video title' : 'Voice memo title';
  const transcription = <span title="Local transcription is not installed. Recording and playback are available."><button disabled title="Local transcription is not installed. Recording and playback are available.">Transcribe</button></span>;
  const attachPlayer = (element: HTMLMediaElement | null) => { player.current = element; };
  const playerEvents = { onPlay: () => engine.pin(cardId, 'media', true), onPause: () => engine.pin(cardId, 'media', false), onEnded: () => engine.pin(cardId, 'media', false) };
  return <><div className="media-head"><input ref={title} className="media-title" aria-label={titleLabel} defaultValue={card.text || (video ? 'Camera recording' : 'Voice memo')} onBlur={event => { if (event.currentTarget.value !== card.text) workspace.submit([{ op: 'update', id: cardId, set: { text: event.currentTarget.value } }]); }} /></div>
    {saved ? <>{video ? <video ref={attachPlayer} className="media-player" controls playsInline preload="metadata" src={services.assetUrl(source)} poster={services.assetUrl(props.poster)} muted={props.muted} style={{ transform: props.mirror ? 'scaleX(-1)' : undefined }} {...playerEvents} /> : <audio ref={attachPlayer} className="media-player" controls preload="metadata" src={services.assetUrl(source)} {...playerEvents} onTimeUpdate={event => paintWave(waveform.current, props.wave, event.currentTarget.currentTime / (event.currentTarget.duration || props.duration || 1))} />}{!video && <canvas ref={waveform} className="media-wave" width={640} height={64} aria-label="Recording waveform. Click to seek." onClick={event => { const media = player.current; if (!media || !Number.isFinite(media.duration)) return; const bounds = event.currentTarget.getBoundingClientRect(); media.currentTime = (event.clientX - bounds.left) / bounds.width * media.duration; }} />}<div className="media-actions"><button onClick={() => workspace.submit([{ op: 'update', id: cardId, set: { props: { replacing: true } } }])}>Replace</button>{transcription}</div>{props.duration > 0 && <small className="muted">{time(props.duration)}</small>}</> : <>
      {video ? <video ref={preview} className="camera-preview" muted autoPlay playsInline style={{ transform: props.mirror ? 'scaleX(-1)' : undefined, aspectRatio: props.shape === 'phone' ? '9 / 16' : '16 / 9', objectFit: 'cover' }} /> : <canvas ref={waveform} className="media-wave" width={640} height={64} />}
      <div className="recorder-choices"><DeviceChoices video={video} disabled={busy} />{video && <><label className="media-field">Shape<select data-native-select="" aria-label="Video shape" value={props.shape} disabled={busy} onChange={event => { const shape = event.currentTarget.value === 'phone' ? 'phone' : 'wide'; workspace.submit([{ op: 'update', id: cardId, set: { props: { shape }, w: shape === 'phone' ? 300 : 440, h: shape === 'phone' ? 720 : 470 } }]); }}><option value="wide">Wide</option><option value="phone">Phone</option></select></label><label className="media-field"><input type="checkbox" aria-label="Mirror" checked={props.mirror} disabled={busy} onChange={event => workspace.submit([{ op: 'update', id: cardId, set: { props: { mirror: event.currentTarget.checked } } }])} />Mirror</label></>}</div>
      <div className="media-status" role="status">{state.kind === 'error' || state.kind === 'save-error' ? state.message : state.kind === 'countdown' ? `Starting in ${state.count}` : state.kind === 'recording' || state.kind === 'paused' ? `${state.kind === 'paused' ? 'Paused' : 'Recording'} ${time(state.elapsed / 1000)}` : state.kind === 'saving' ? `Saving recording… ${state.percent}%` : state.kind === 'starting' ? 'Connecting…' : state.kind === 'preview' ? 'Camera ready' : state.kind === 'saved' ? 'Saved' : 'Ready to record'}</div>
      <div className="media-actions">{!busy && state.kind !== 'save-error' && <button onClick={() => void session.start()}>Start recording</button>}{active && <button onClick={session.pause}>{state.kind === 'paused' ? 'Resume' : 'Pause'}</button>}{(active || state.kind === 'starting' || state.kind === 'countdown') && <button onClick={session.stop}>Stop</button>}{state.kind === 'save-error' && <button onClick={() => void session.retry()}>Retry saving</button>}{video && !busy && state.kind !== 'preview' && <button onClick={() => void session.preview()}>Preview camera</button>}<button disabled={busy} onClick={() => picker.current?.click()}>{video ? 'Use a video file' : 'Use an audio file'}</button>{source && props.replacing && <button disabled={busy} onClick={() => { session.stop(); workspace.submit([{ op: 'update', id: cardId, set: { props: { replacing: null } } }]); }}>Cancel replacement</button>}{transcription}</div>
      <input ref={picker} type="file" hidden accept={video ? 'video/*' : 'audio/*'} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void session.importFile(file); event.currentTarget.value = ''; }} />
    </>}
  </>;
}
