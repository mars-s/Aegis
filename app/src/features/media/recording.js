import { createDropdown } from '../../lib/ui/dropdown.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { node, button, field } from './dom.js';
import { mediaContext, report } from './context.js';
import { openDevices, deviceChoices } from './devices.js';
import { uploadRecording } from './upload.js';
import { videoInfo } from './video.js';
const sessions = new Map(), cleanup = new WeakMap();
const time = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const sessionKey = (boardId, id) => `${boardId}:${id}`;
function mimeType(video) {
  const types = video ? ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4','video/webm'] : ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'];
  return types.find(t => MediaRecorder.isTypeSupported(t));
}
function wave(canvas, samples, progress = 0) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height; g.clearRect(0, 0, w, h);
  const points = samples?.length ? samples : Array(80).fill(.025), step = w / points.length;
  points.forEach((v, i) => { g.fillStyle = i / points.length <= progress ? '#537ce5' : '#9399a6'; const height = Math.max(2, v * h * .9); g.fillRect(i * step, (h - height) / 2, Math.max(1, step * .65), height); });
}
async function persist(c, api, boardId, saved) {
  const ctx = mediaContext(), command = { op: 'update', id: c.id, set: saved };
  if (ctx.canvas.board.id === boardId) {
    if (!ctx.canvas.board.cards.some(v => v.id === c.id)) return;
    ctx.apply([command]);
  } else {
    const result = await ctx.host.post(`/boards/${boardId}/batch`, { commands: [command] });
    if (!result.ok) throw new Error(result.errors?.[0]?.reason || 'Could not save the recording');
  }
}
function release(s) {
  clearTimeout(s.countdown); clearTimeout(s.limit); clearTimeout(s.idle); clearInterval(s.tick);
  cancelAnimationFrame(s.captureFrame); s.capture?.getTracks().forEach(t => t.stop()); s.capture = null;
  s.captureVideo?.pause(); if (s.captureVideo) s.captureVideo.srcObject = null; s.captureVideo = null;
  s.stream?.getTracks().forEach(t => t.stop()); s.stream = null;
  s.audioContext?.close().catch(() => {}); s.audioContext = null;
}
async function saveRecording(s) {
  s.phase = 'saving'; s.percent = 0; s.error = ''; s.notify?.();
  try {
    const type = s.blob.type.split(';')[0], file = new File([s.blob], s.video ? 'Camera recording' : 'Voice memo', { type });
    const info = s.video ? await videoInfo(s.blob) : null;
    const { url } = await uploadRecording(mediaContext().host, file, percent => { s.percent = percent; s.notify?.(); });
    const wave = s.samples.filter((_, i) => i % Math.max(1, Math.ceil(s.samples.length / 160)) === 0).slice(0, 160);
    sessions.delete(s.key);
    await persist(s.card, s.api, s.boardId, { ...(s.video ? { url } : {}), ...(s.imported && info?.width && info?.height ? { h: Math.max(120, s.card.w * info.height / info.width + 72) } : {}), props: { ...(s.video ? {} : { src: url }), duration: info?.duration || s.duration, ...(info ? { poster: info.poster, videoWidth: info.width, videoHeight: info.height } : {}), wave, shape: s.shape, mirror: s.video && s.captureApplied ? false : s.mirror, ready: false, replacing: null } });
    s.phase = 'saved'; sessions.delete(s.key); s.notify?.();
  } catch (error) { sessions.set(s.key, s); s.phase = 'save-error'; s.error = `Could not save the recording. ${error.message}`; s.notify?.(); report(error); }
}
async function start(s) {
  if (s.phase === 'starting' || s.phase === 'countdown' || s.phase === 'recording' || s.phase === 'paused') return;
  try {
    if (typeof MediaRecorder === 'undefined') throw new Error('Recording is unavailable in this browser. Import a file instead.');
    const generation = (s.generation || 0) + 1; s.generation = generation;
    s.previewing = false; s.phase = 'starting'; s.error = ''; s.notify?.();
    if (!s.stream) {
      const stream = await openDevices(s.video, s.shape);
      if (s.generation !== generation) { stream.getTracks().forEach(t => t.stop()); return; }
      s.stream = stream;
    }
    if (s.cancelled) { release(s); return; }
    // Draw portrait framing into the recorded file, so it survives export and playback elsewhere.
    let recordingStream = s.stream;
    if (s.video && (s.shape === 'phone' || s.mirror) && HTMLCanvasElement.prototype.captureStream) {
      const input = node('video'); input.muted = true; input.playsInline = true; input.srcObject = s.stream; s.captureVideo = input; await input.play();
      if (s.cancelled) { release(s); return; }
      const cv = node('canvas'); cv.width = s.shape === 'phone' ? 720 : 1280; cv.height = s.shape === 'phone' ? 1280 : 720;
      const g = cv.getContext('2d');
      const draw = () => {
        if (!s.stream) return;
        const ratio = cv.width / cv.height, width = input.videoWidth, height = input.videoHeight;
        if (width && height) {
          const sw = Math.min(width, height * ratio), sh = sw / ratio;
          g.save(); if (s.mirror) { g.translate(cv.width, 0); g.scale(-1, 1); }
          g.drawImage(input, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, cv.width, cv.height); g.restore();
        }
        s.captureFrame = requestAnimationFrame(draw);
      };
      draw(); s.captureApplied = true; s.capture = cv.captureStream(30);
      s.stream.getAudioTracks().forEach(track => s.capture.addTrack(track)); recordingStream = s.capture;
    }
    s.phase = 'countdown'; s.count = 3; s.notify?.();
    const count = () => {
      if (s.cancelled) return;
      if (s.count > 1) { s.count--; s.notify?.(); s.countdown = setTimeout(count, 1000); return; }
      try {
        const mime = mimeType(s.video); s.recorder = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined); s.chunks = []; s.samples = []; s.duration = 0;
        s.recorder.ondataavailable = e => { if (e.data.size) s.chunks.push(e.data); };
        s.recorder.onerror = () => { s.error = 'The recording was interrupted. Any captured media will be saved.'; stop(s); };
        s.recorder.onstop = () => {
          s.duration = s.elapsed / 1000; s.blob = new Blob(s.chunks, { type: s.recorder.mimeType || mime }); release(s);
          if (!s.blob.size) { s.phase = 'idle'; s.error = 'No media was captured. Try recording again or import a file.'; s.notify?.(); return; }
          saveRecording(s);
        };
        try {
          s.audioContext = new AudioContext(); s.analyser = s.audioContext.createAnalyser(); s.analyser.fftSize = 256;
          s.audioContext.createMediaStreamSource(s.stream).connect(s.analyser); s.audioContext.resume().catch(() => {});
        } catch { s.analyser = null; }
        s.elapsed = 0; let last = performance.now();
        s.tick = setInterval(() => {
          const now = performance.now(); if (s.phase === 'recording') {
            s.elapsed += now - last;
            if (s.analyser) { const data = new Uint8Array(s.analyser.fftSize); s.analyser.getByteTimeDomainData(data); s.samples.push(Math.max(...data.map(v => Math.abs(v - 128))) / 128); }
            else s.samples.push(.025);
            if (s.samples.length > 10000) s.samples = s.samples.filter((_, i) => i % 2 === 0);
          }
          last = now; s.notify?.();
        }, 100);
        s.recorder.start(1000); s.phase = 'recording'; s.limit = setTimeout(() => stop(s), 15 * 60 * 1000); s.notify?.();
      } catch (e) { release(s); s.phase = 'idle'; s.error = e.message; s.notify?.(); }
    };
    clearTimeout(s.idle); s.countdown = setTimeout(count, 1000);
  } catch (error) { release(s); s.phase = 'idle'; s.error = error.message; s.notify?.(); report(error); }
}
function stop(s) {
  s.generation = (s.generation || 0) + 1;
  if (s.recorder && s.recorder.state !== 'inactive') { s.recorder.stop(); s.phase = 'saving'; s.notify?.(); }
  else { s.cancelled = true; release(s); s.phase = 'idle'; s.notify?.(); }
}
export function renderRecording(el, c, api) {
  const video = c.type === 'video', boardId = api.board.id, key = sessionKey(boardId, c.id), props = c.props || {}, src = video ? c.url : props.src;
  const head = node('div', 'media-head'), title = node('input', 'media-title'); title.value = c.text || (video ? 'Camera recording' : 'Voice memo'); title.setAttribute('aria-label', video ? 'Video title' : 'Voice memo title');
  title.onchange = () => api.apply([{ op: 'update', id: c.id, set: { text: title.value } }]); head.append(title); el.append(head);
  const waveform = node('canvas', 'media-wave'); waveform.width = 640; waveform.height = 64;
  const controls = node('div', 'media-actions'), status = node('div', 'media-status'); status.setAttribute('role', 'status');
  const transcription = () => { const wrap = node('span'); wrap.title = 'Local transcription is not installed. Recording and playback are available.'; const b = button('Transcribe', () => {}, wrap); b.disabled = true; b.title = wrap.title; controls.append(wrap); };
  const existing = sessions.get(key);
  if (src && !existing) {
    const player = node(video ? 'video' : 'audio', 'media-player'); player.controls = true; player.addEventListener('keydown', e => e.stopPropagation()); player.preload = 'metadata'; player.src = api.resolveUrl(src); if (video) { player.playsInline = true; if (props.poster) player.poster = api.resolveUrl(props.poster); player.muted = !!props.muted; player.style.transform = props.mirror ? 'scaleX(-1)' : ''; }
    el.append(player); if (!video) { el.append(waveform); wave(waveform, props.wave); waveform.setAttribute('aria-label', 'Recording waveform. Click to seek.'); waveform.onclick = e => { if (Number.isFinite(player.duration)) player.currentTime = (e.clientX - waveform.getBoundingClientRect().left) / waveform.getBoundingClientRect().width * player.duration; }; player.ontimeupdate = () => wave(waveform, props.wave, player.currentTime / (player.duration || props.duration || 1)); }
    button('Replace', () => api.setProps(c.id, { replacing: true }), controls); transcription(); el.append(controls); if (props.duration) el.append(node('small', 'muted', time(props.duration)));
    if (!props.replacing) { cleanup.set(el, () => player.pause()); return; }
    player.pause(); el.replaceChildren(head);
  }
  const s = existing || { key, card: c, boardId, api, video, phase: 'idle', samples: [], elapsed: 0, shape: props.shape || 'wide', mirror: !!props.mirror };
  sessions.set(key, s); s.card = c;
  const preview = video ? node('video', 'camera-preview') : null;
  if (preview) { preview.muted = true; preview.autoplay = true; preview.playsInline = true; el.append(preview); }
  else el.append(waveform);
  const choices = node('div', 'recorder-choices'); el.append(choices);
  const cleanChoices = deviceChoices(choices, video);
  let shape, flip;
  if (video) {
    const label = node('label', 'media-field', 'Shape'); shape = createDropdown({ label: 'Video shape', options: [['wide', 'Wide'], ['phone', 'Phone']] });
    shape.value = s.shape; label.append(shape); choices.append(label);
    shape.onchange = () => { s.shape = shape.value; release(s); s.phase = 'idle'; api.apply([{ op: 'update', id: c.id, set: { props: { shape: s.shape }, w: s.shape === 'phone' ? 300 : 440, h: s.shape === 'phone' ? 720 : 470 } }]); };
    flip = field('Mirror', 'checkbox', '', choices); flip.checked = s.mirror; flip.onchange = () => { s.mirror = flip.checked; api.setProps(c.id, { mirror: s.mirror }); };
  }
  controls.replaceChildren();
  const startButton = button('Start recording', () => { s.cancelled = false; start(s); }, controls);
  const pauseButton = button('Pause', () => { if (s.phase === 'recording') { s.recorder.pause(); s.phase = 'paused'; } else if (s.phase === 'paused') { s.recorder.resume(); s.phase = 'recording'; } s.notify(); }, controls);
  const stopButton = button('Stop', () => stop(s), controls);
  const retry = button('Retry saving', () => saveRecording(s), controls);
  const previewCamera = async () => {
    const generation = (s.generation || 0) + 1; s.generation = generation;
    release(s); s.previewing = true; s.cancelled = false; s.phase = 'starting'; s.error = ''; s.notify();
    try {
      const stream = await openDevices(true, s.shape);
      if (s.generation !== generation || s.cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      s.stream = stream; s.phase = 'preview';
      s.idle = setTimeout(() => { release(s); s.phase = 'idle'; s.notify?.(); }, 60000); s.notify();
    } catch (error) { if (s.generation === generation) { s.phase = 'idle'; s.error = error.message; s.notify(); } }
  };
  const previewButton = video ? button('Preview camera', previewCamera, controls) : null;
  const file = node('input'); file.type = 'file'; file.accept = video ? 'video/*' : 'audio/*'; file.hidden = true; el.append(file);
  const importButton = button(video ? 'Use a video file' : 'Use an audio file', () => file.click(), controls);
  file.onchange = async () => {
    const selected = file.files?.[0]; if (!selected) return;
    try { if (selected.size > 1024 ** 3) throw new Error('Choose a file smaller than 1 GB'); s.blob = selected; s.duration = 0; s.samples = []; release(s); await saveRecording(s); } catch (e) { report(e); }
  };
  const cancelReplacement = src && props.replacing ? button('Cancel replacement', () => { stop(s); sessions.delete(key); api.setProps(c.id, { replacing: null }); }, controls) : null;
  transcription(); el.append(status, controls);
  s.notify = () => {
    if (!el.isConnected) return;
    const busy = ['starting','countdown','recording','paused','saving'].includes(s.phase), active = ['recording','paused'].includes(s.phase);
    if (cancelReplacement) cancelReplacement.disabled = busy;
    startButton.hidden = busy || s.phase === 'save-error'; pauseButton.hidden = !active; stopButton.hidden = !active && !['starting','countdown'].includes(s.phase); retry.hidden = s.phase !== 'save-error';
    pauseButton.textContent = s.phase === 'paused' ? 'Resume' : 'Pause'; importButton.disabled = busy; if (previewButton) previewButton.hidden = busy || s.phase === 'preview';
    choices.querySelectorAll('.aegis-dropdown,input').forEach(e => e.disabled = busy);
    if (shape) shape.disabled = busy;
    status.textContent = s.error || ({ idle: 'Ready to record', starting: 'Connecting…', countdown: `Starting in ${s.count}`, recording: `Recording ${time(s.elapsed / 1000)}`, paused: `Paused ${time(s.elapsed / 1000)}`, saving: `Saving recording… ${s.percent || 0}%`, preview: 'Camera ready', saved: 'Saved' }[s.phase] || '');
    if (preview) { if (preview.srcObject !== s.stream) preview.srcObject = s.stream; preview.style.transform = s.mirror ? 'scaleX(-1)' : ''; preview.style.aspectRatio = s.shape === 'phone' ? '9 / 16' : '16 / 9'; preview.style.objectFit = 'cover'; }
    else wave(waveform, s.samples.slice(-100));
  };
  const deviceChange = () => {
    if (s.phase === 'preview' || s.phase === 'starting' && s.previewing) void previewCamera();
    else if (s.phase === 'idle') { release(s); s.notify(); }
  };
  window.addEventListener('aegis-media-devices', deviceChange);
  cleanup.set(el, () => {
    cleanChoices(); window.removeEventListener('aegis-media-devices', deviceChange);
    queueMicrotask(() => {
      const stillMounted = document.querySelector(`[data-id="${c.id}"]`);
      if (stillMounted) return;
      if (['recording','paused'].includes(s.phase)) stop(s); else if (s.phase !== 'saving' && s.phase !== 'save-error') { s.cancelled = true; release(s); sessions.delete(key); }
    });
  });
  requestAnimationFrame(() => s.notify());
}
export function dropRecording(el) { cleanup.get(el)?.(); cleanup.delete(el); }
export function createRecording(ctx, video, at = ctx.canvas.centre()) {
  ctx.apply([{ op: 'create', type: video ? 'video' : 'audio', text: video ? 'Camera recording' : 'Voice memo', x: at.x, y: at.y, w: video ? 440 : 360, h: video ? 470 : 300, props: { ready: true, shape: 'wide' } }]);
}

export async function importVideo(ctx, file, at = ctx.canvas.centre()) {
  if (file.size > 1024 ** 3) { report(new Error('Choose a file smaller than 1 GB')); return; }
  const boardId = ctx.canvas.board.id;
  let card;
  ctx.apply([{ op: 'create', type: 'video', text: file.name.replace(/\.[^.]+$/, ''), x: at.x, y: at.y, w: 440, h: 320, props: { ready: true }, ref: 'video' }], ids => { card = ctx.canvas.board.cards.find(c => c.id === ids.video); });
  if (!card) return;
  const key = sessionKey(boardId, card.id), session = { key, card, boardId, api: ctx, video: true, imported: true, phase: 'saving', samples: [], elapsed: 0, duration: 0, shape: 'wide', mirror: false, blob: file };
  sessions.set(key, session); await saveRecording(session);
}
