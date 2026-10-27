export type DeviceKind = 'microphone' | 'camera';
export const chosenDevice = (kind: DeviceKind): string => localStorage.getItem(`aegis:media:${kind}`) || '';
export function chooseDevice(kind: DeviceKind, id: string) { if (id) localStorage.setItem(`aegis:media:${kind}`, id); else localStorage.removeItem(`aegis:media:${kind}`); window.dispatchEvent(new Event('aegis-media-devices')); }
export async function openDevices(video: boolean, shape: 'wide' | 'phone' = 'wide'): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Recording is unavailable here. Use an HTTPS page or import a file.');
  const constraints = (): MediaStreamConstraints => ({ audio: chosenDevice('microphone') ? { deviceId: { exact: chosenDevice('microphone') } } : true, video: video ? { ...(chosenDevice('camera') ? { deviceId: { exact: chosenDevice('camera') } } : {}), aspectRatio: { ideal: shape === 'phone' ? 9 / 16 : 16 / 9 } } : false });
  try { return await navigator.mediaDevices.getUserMedia(constraints()); } catch (error) {
    if ((error instanceof Error || error instanceof DOMException) && ['NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes(error.name) && (chosenDevice('microphone') || video && chosenDevice('camera'))) { chooseDevice('microphone', ''); if (video) chooseDevice('camera', ''); return navigator.mediaDevices.getUserMedia(constraints()); }
    throw new Error(`Could not access ${video ? 'the camera and microphone' : 'the microphone'}. Check your browser and system privacy settings. ${error instanceof Error || error instanceof DOMException ? error.message : String(error)}`);
  }
}
