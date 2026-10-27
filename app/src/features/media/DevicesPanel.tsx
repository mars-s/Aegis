import { useEffect, useState } from 'react';
import { chooseDevice, chosenDevice, openDevices } from './device-model.js';
import { useCreativeServices } from './services.js';
export function DeviceChoices({ video = true, disabled = false }: { readonly video?: boolean; readonly disabled?: boolean }) {
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[]>([]), [microphone, setMicrophone] = useState(() => chosenDevice('microphone')), [camera, setCamera] = useState(() => chosenDevice('camera'));
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const rows = await navigator.mediaDevices?.enumerateDevices() ?? []; if (!active) return;
      for (const kind of ['microphone', 'camera'] as const) if (chosenDevice(kind) && !rows.some(device => device.kind === (kind === 'camera' ? 'videoinput' : 'audioinput') && device.deviceId === chosenDevice(kind))) chooseDevice(kind, '');
      setDevices(rows); setMicrophone(chosenDevice('microphone')); setCamera(chosenDevice('camera'));
    };
    const changed = () => { void refresh().catch(() => {}); };
    navigator.mediaDevices?.addEventListener('devicechange', changed); window.addEventListener('aegis-media-devices', changed); changed();
    return () => { active = false; navigator.mediaDevices?.removeEventListener('devicechange', changed); window.removeEventListener('aegis-media-devices', changed); };
  }, []);
  return <div className="device-choices">{(['microphone', ...(video ? ['camera'] as const : [])] as const).map(kind => <label key={kind} className="media-field">{kind === 'camera' ? 'Camera' : 'Microphone'}<select data-native-select="" aria-label={kind === 'camera' ? 'Camera' : 'Microphone'} value={kind === 'camera' ? camera : microphone} disabled={disabled} onChange={event => chooseDevice(kind, event.currentTarget.value)}><option value="">System default</option>{devices.filter(device => device.kind === (kind === 'camera' ? 'videoinput' : 'audioinput')).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${kind === 'camera' ? 'Camera' : 'Microphone'} ${i + 1}`}</option>)}</select></label>)}</div>;
}
export function DevicesPanel() {
  const services = useCreativeServices();
  return <section className="media-panel" aria-label="Media devices"><DeviceChoices /><button onClick={() => { void openDevices(true).then(stream => { stream.getTracks().forEach(track => track.stop()); window.dispatchEvent(new Event('aegis-media-devices')); }).catch(error => services.notify(error instanceof Error ? error.message : String(error))); }}>Allow access to show device names</button><small className="muted">Device choices are remembered on this computer. A missing device falls back to the system default.</small></section>;
}
