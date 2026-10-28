import type { CardId } from '@aegis/domain/schema';
import type { FeatureWorkspace } from '../../composition.js';
import type { CreativeServices } from './services.js';
import { openDevices } from './device-model.js';
import { videoInfo } from './video-info.js';
export type RecordingState = { readonly kind: 'idle' | 'starting' | 'saved' } | { readonly kind: 'preview'; readonly stream: MediaStream } | { readonly kind: 'countdown'; readonly stream: MediaStream; readonly count: number } | { readonly kind: 'recording' | 'paused'; readonly stream: MediaStream; readonly elapsed: number; readonly samples: readonly number[] } | { readonly kind: 'saving'; readonly percent: number } | { readonly kind: 'error' | 'save-error'; readonly message: string };
export function createRecordingSession({ services, workspace, cardId, video, shape, mirror }: { readonly services: CreativeServices; readonly workspace: FeatureWorkspace; readonly cardId: CardId; readonly video: boolean; readonly shape: 'wide' | 'phone'; readonly mirror: boolean }) {
  const boardId = workspace.metadata.getSnapshot().id, listeners = new Set<() => void>();
  let imported = false;
  const originalWidth = workspace.record(cardId).getSnapshot()?.w ?? 440;
  let state: RecordingState = { kind: 'idle' }, stream: MediaStream | null = null, capture: MediaStream | null = null, input: HTMLVideoElement | null = null, audio: AudioContext | null = null, recorder: MediaRecorder | null = null, blob: Blob | null = null, samples: number[] = [], elapsed = 0, generation = 0, framed = false;
  let tick: ReturnType<typeof setInterval> | undefined, countdown: ReturnType<typeof setTimeout> | undefined, limit: ReturnType<typeof setTimeout> | undefined, fallbackFrame: ReturnType<typeof setTimeout> | undefined, videoFrame: number | undefined;
  const publish = (next: RecordingState) => { state = next; listeners.forEach(listener => listener()); };
  function release() {
    clearTimeout(countdown); clearTimeout(limit); clearInterval(tick); clearTimeout(fallbackFrame);
    if (input && videoFrame !== undefined) input.cancelVideoFrameCallback(videoFrame);
    capture?.getTracks().forEach(track => track.stop()); capture = null;
    if (input) { input.pause(); input.srcObject = null; input = null; }
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    void audio?.close().catch(() => {}); audio = null;
  }
  async function persist() {
    if (!blob) return; const media = blob;
    publish({ kind: 'saving', percent: 0 });
    try {
      const type = media.type.split(';')[0] || 'application/octet-stream', file = new File([media], video ? 'Camera recording' : 'Voice memo', { type }), info = video ? await videoInfo(media) : null;
      const saved = await services.upload(file, percent => publish({ kind: 'saving', percent })); publish({ kind: 'saving', percent: 100 });
      const wave = samples.filter((_, i) => i % Math.max(1, Math.ceil(samples.length / 160)) === 0).slice(0, 160);
      const command = { op: 'update', id: cardId, set: { ...(video ? { url: saved.url } : {}), ...(imported && info?.width && info.height ? { h: Math.max(120, originalWidth * info.height / info.width + 72) } : {}), props: { ...(video ? {} : { src: saved.url }), duration: info?.duration || elapsed / 1000, ...(info ? { poster: info.poster, videoWidth: info.width, videoHeight: info.height } : {}), wave, shape, mirror: video && framed ? false : mirror, ready: false, replacing: null } } } as const;
      if (workspace.metadata.getSnapshot().id === boardId) { if (workspace.card(cardId).getSnapshot()) { const result = workspace.submit([command]); if (result.kind === 'rejected') throw new Error(result.errors[0]?.reason || 'Could not save the recording'); } }
      else await services.commitToBoard(boardId, [command]);
      blob = null; publish({ kind: 'saved' });
    } catch (error) { publish({ kind: 'save-error', message: `Could not save the recording. ${error instanceof Error ? error.message : String(error)}` }); }
  }
  async function preview() {
    const epoch = ++generation; release(); publish({ kind: 'starting' });
    try { const next = await openDevices(video, shape); if (epoch !== generation) { next.getTracks().forEach(track => track.stop()); return; } stream = next; publish({ kind: 'preview', stream: next }); limit = setTimeout(() => { release(); publish({ kind: 'idle' }); }, 60000); } catch (error) { if (epoch === generation) { release(); publish({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); } }
  }
  async function start() {
    if (['starting', 'countdown', 'recording', 'paused', 'saving'].includes(state.kind)) return;
    const epoch = ++generation; clearTimeout(limit); publish({ kind: 'starting' });
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('Recording is unavailable in this browser. Import a file instead.');
      const next = stream ?? await openDevices(video, shape); if (epoch !== generation) { next.getTracks().forEach(track => track.stop()); return; } stream = next;
      let recordingStream = next; framed = false;
      if (video && (shape === 'phone' || mirror) && typeof HTMLCanvasElement.prototype.captureStream === 'function') {
        const source = document.createElement('video'); source.muted = true; source.playsInline = true; source.srcObject = next; input = source; await source.play();
        if (epoch !== generation) { release(); return; }
        const canvas = document.createElement('canvas'); canvas.width = shape === 'phone' ? 720 : 1280; canvas.height = shape === 'phone' ? 1280 : 720;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare the camera recording');
        const draw = () => {
          if (input !== source || !stream) return;
          const width = source.videoWidth, height = source.videoHeight, ratio = canvas.width / canvas.height;
          if (width && height) { const sw = Math.min(width, height * ratio), sh = sw / ratio; context.save(); if (mirror) { context.translate(canvas.width, 0); context.scale(-1, 1); } context.drawImage(source, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height); context.restore(); }
          if (typeof source.requestVideoFrameCallback === 'function') videoFrame = source.requestVideoFrameCallback(draw); else fallbackFrame = setTimeout(draw, 33);
        };
        draw(); capture = canvas.captureStream(30); next.getAudioTracks().forEach(track => capture?.addTrack(track)); recordingStream = capture; framed = true;
      }
      let count = 3;
      const countDown = () => {
        if (epoch !== generation || !stream) return;
        if (count > 0) { publish({ kind: 'countdown', stream, count }); count--; countdown = setTimeout(countDown, 1000); return; }
        try {
          const types = video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
          const mime = types.find(type => MediaRecorder.isTypeSupported(type)), current = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined), chunks: Blob[] = [];
          recorder = current; samples = []; elapsed = 0;
          current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          current.onstop = () => { blob = new Blob(chunks, { type: current.mimeType || mime || '' }); release(); if (!blob.size) { publish({ kind: 'error', message: 'No media was captured. Try recording again or import a file.' }); return; } void persist(); };
          current.onerror = () => stop();
          let analyser: AnalyserNode | null = null;
          try { audio = new AudioContext(); analyser = audio.createAnalyser(); analyser.fftSize = 256; audio.createMediaStreamSource(stream).connect(analyser); void audio.resume().catch(() => {}); } catch { analyser = null; }
          let last = performance.now();
          tick = setInterval(() => {
            const now = performance.now();
            if (state.kind === 'recording' && stream) { elapsed += now - last; if (analyser) { const data = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data); samples.push(Math.max(...data.map(value => Math.abs(value - 128))) / 128); } else samples.push(.025); if (samples.length > 10000) samples = samples.filter((_, i) => i % 2 === 0); publish({ kind: 'recording', stream, elapsed, samples: samples.slice(-100) }); }
            last = now;
          }, 100);
          current.start(1000); publish({ kind: 'recording', stream, elapsed: 0, samples: [] }); limit = setTimeout(stop, 15 * 60 * 1000);
        } catch (error) { release(); publish({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); }
      };
      countDown();
    } catch (error) { if (epoch === generation) { release(); publish({ kind: 'error', message: error instanceof Error ? error.message : String(error) }); } }
  }
  function stop() { generation++; if (recorder && recorder.state !== 'inactive') { recorder.stop(); publish({ kind: 'saving', percent: 0 }); } else { release(); publish({ kind: 'idle' }); } }
  function pause() { if (state.kind === 'recording' && recorder) { recorder.pause(); publish({ ...state, kind: 'paused' }); } else if (state.kind === 'paused' && recorder) { recorder.resume(); publish({ ...state, kind: 'recording' }); } }
  async function importFile(file: File, resize = false) { if (file.size > 1024 ** 3) { publish({ kind: 'error', message: 'Choose a file smaller than 1 GB' }); return; } generation++; release(); imported = resize; blob = file; samples = []; elapsed = 0; await persist(); }
  function dispose() { if (state.kind === 'recording' || state.kind === 'paused') stop(); else if (state.kind !== 'saving' && state.kind !== 'save-error') { generation++; release(); } }
  function configure(nextShape: 'wide' | 'phone', nextMirror: boolean) { if (nextShape === shape && nextMirror === mirror) return; if (['starting', 'countdown', 'recording', 'paused', 'saving'].includes(state.kind)) return; generation++; release(); shape = nextShape; mirror = nextMirror; publish({ kind: 'idle' }); }
  return { boardId, cardId, configure, getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, start, preview, stop, pause, retry: persist, importFile, dispose };
}
export type RecordingSession = ReturnType<typeof createRecordingSession>;
export function createRecordingStore(services: CreativeServices) {
  const sessions = new Map<string, RecordingSession>();
  return { session(workspace: FeatureWorkspace, cardId: CardId, video: boolean, shape: 'wide' | 'phone', mirror: boolean) { const key = `${workspace.metadata.getSnapshot().id}:${cardId}`; let session = sessions.get(key); if (!session) { session = createRecordingSession({ services, workspace, cardId, video, shape, mirror }); sessions.set(key, session); } return session; }, dispose: () => { for (const session of sessions.values()) session.dispose(); sessions.clear(); } };
}
