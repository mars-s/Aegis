import { ValuePicker } from "../../chrome/controls.js";
import { useEffect, useRef, useState } from 'react';

export function MediaDevices() {
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[]>([]);
  const [microphone, setMicrophone] = useState(() => localStorage.getItem('aegis:media:microphone') ?? '');
  const [camera, setCamera] = useState(() => localStorage.getItem('aegis:media:camera') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    mounted.current = true;
    const media = navigator.mediaDevices;
    let request = 0;
    async function load(): Promise<void> {
      const mine = ++request;
      try {
        const list = await media?.enumerateDevices() ?? [];
        if (!mounted.current || mine !== request) return;
        setDevices(list);
        for (const kind of ['microphone', 'camera'] as const) {
          const key = `aegis:media:${kind}`, selected = localStorage.getItem(key);
          if (selected && !list.some(device => device.kind === (kind === 'microphone' ? 'audioinput' : 'videoinput') && device.deviceId === selected)) {
            localStorage.removeItem(key); if (kind === 'microphone') setMicrophone(''); else setCamera(''); window.dispatchEvent(new Event('aegis-media-devices'));
          }
        }
      } catch (cause) { if (mounted.current && mine === request) setError(cause instanceof Error ? cause.message : 'Could not list media devices.'); }
    }
    refresh.current = load; void load();
    media?.addEventListener('devicechange', load); window.addEventListener('aegis-media-devices', load);
    return () => { mounted.current = false; generation.current++; request++; media?.removeEventListener('devicechange', load); window.removeEventListener('aegis-media-devices', load); };
  }, []);
  function choose(kind: 'microphone' | 'camera', value: string): void {
    if (value) localStorage.setItem(`aegis:media:${kind}`, value); else localStorage.removeItem(`aegis:media:${kind}`);
    if (kind === 'microphone') setMicrophone(value); else setCamera(value);
    window.dispatchEvent(new Event('aegis-media-devices'));
  }
  async function allow(): Promise<void> {
    const mine = ++generation.current; setBusy(true); setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Recording is unavailable here. Use an HTTPS page or import a file.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      for (const track of stream.getTracks()) track.stop();
      if (mounted.current && generation.current === mine) await refresh.current();
    } catch (cause) { if (mounted.current && generation.current === mine) setError(cause instanceof Error ? cause.message : 'Check your browser and system privacy settings.'); }
    finally { if (mounted.current && generation.current === mine) setBusy(false); }
  }
  return <section className="sheet-sec"><h3>Media devices</h3>
    {(['microphone', 'camera'] as const).map(kind => {
      const label = kind === 'microphone' ? 'Microphone' : 'Camera';
      return <label key={kind}>{label}<ValuePicker label={label} value={kind === 'microphone' ? microphone : camera} options={[["", "System default"], ...devices.filter(device => device.kind === (kind === 'camera' ? 'videoinput' : 'audioinput')).map((device, i) => [device.deviceId, device.label || `${kind === 'camera' ? 'Camera' : 'Microphone'} ${i + 1}`] as const)]} onChange={value => choose(kind, value)} /></label>;
    })}
    <button type="button" disabled={busy} onClick={() => { void allow(); }}>Allow access to show device names</button>
    <p className="muted">Device choices are remembered on this computer. A missing device falls back to the system default.</p>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
