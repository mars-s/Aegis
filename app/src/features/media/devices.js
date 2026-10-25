import { createDropdown } from '../../lib/ui/dropdown.js';
import { node, button } from './dom.js';
import { setMediaContext, report } from './context.js';
const key = kind => `aegis:media:${kind}`;
export function chosenDevice(kind) { return localStorage.getItem(key(kind)) || ''; }
export function chooseDevice(kind, id) {
  if (id) localStorage.setItem(key(kind), id); else localStorage.removeItem(key(kind));
  window.dispatchEvent(new Event('aegis-media-devices'));
}
export async function openDevices(video, shape = 'wide') {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Recording is unavailable here. Use an HTTPS page or import a file.');
  const constraints = () => ({ audio: chosenDevice('microphone') ? { deviceId: { exact: chosenDevice('microphone') } } : true,
    video: video ? { ...(chosenDevice('camera') ? { deviceId: { exact: chosenDevice('camera') } } : {}), aspectRatio: { ideal: shape === 'phone' ? 9 / 16 : 16 / 9 } } : false });
  try { return await navigator.mediaDevices.getUserMedia(constraints()); }
  catch (error) {
    if (['NotFoundError','OverconstrainedError','NotReadableError'].includes(error.name) && (chosenDevice('microphone') || video && chosenDevice('camera'))) {
      chooseDevice('microphone', ''); if (video) chooseDevice('camera', '');
      return navigator.mediaDevices.getUserMedia(constraints());
    }
    throw new Error(`Could not access ${video ? 'the camera and microphone' : 'the microphone'}. Check your browser and system privacy settings. ${error.message}`);
  }
}
export function deviceChoices(parent, video = true) {
  const root = node('div', 'device-choices'); parent.append(root);
  const refresh = async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices() || [];
      if (!root.isConnected) return;
      root.replaceChildren();
      for (const [kind, deviceKind, label] of [['microphone','audioinput','Microphone'], ...(video ? [['camera','videoinput','Camera']] : [])]) {
        const wrap = node('label', 'media-field', label);
        let selected = chosenDevice(kind);
        if (selected && !devices.some(d => d.kind === deviceKind && d.deviceId === selected)) { chooseDevice(kind, ''); selected = ''; }
        const select = createDropdown({ label, options: [['', 'System default'], ...devices.filter(d => d.kind === deviceKind).map((d, i) => [d.deviceId, d.label || `${label} ${i + 1}`])], value: selected, onChange: value => chooseDevice(kind, value) });
        wrap.append(select); root.append(wrap);
      }
    } catch (e) { report(e); }
  };
  const onDevices = () => refresh(); navigator.mediaDevices?.addEventListener('devicechange', onDevices); window.addEventListener('aegis-media-devices', onDevices); queueMicrotask(refresh);
  return () => { navigator.mediaDevices?.removeEventListener('devicechange', onDevices); window.removeEventListener('aegis-media-devices', onDevices); };
}
export function mountMedia(el, ctx) {
  setMediaContext(ctx); el.classList.add('media-panel');
  const stopChoices = deviceChoices(el);
  button('Allow access to show device names', async () => {
    try { const stream = await openDevices(true); stream.getTracks().forEach(t => t.stop()); window.dispatchEvent(new Event('aegis-media-devices')); } catch (e) { report(e); }
  }, el);
  el.append(node('small', 'muted', 'Device choices are remembered on this computer. A missing device falls back to the system default.'));
  return stopChoices;
}
