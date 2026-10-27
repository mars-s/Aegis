export function videoInfo(blob: Blob): Promise<{ poster: string; width: number; height: number; duration: number }> {
  return new Promise(resolve => {
    const video = document.createElement('video'), source = URL.createObjectURL(blob); let done = false;
    const finish = (poster = '') => { if (done) return; done = true; clearTimeout(timer); const info = { poster, width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 }; video.onloadeddata = video.onseeked = video.onerror = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(source); resolve(info); };
    const timer = setTimeout(() => finish(), 8000);
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.onloadeddata = () => { try { video.currentTime = Number.isFinite(video.duration) ? Math.min(.3, video.duration / 10) : .1; } catch { finish(); } };
    video.onseeked = () => { try { const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = Math.max(1, Math.round(480 * video.videoHeight / (video.videoWidth || 1))); const context = canvas.getContext('2d'); if (!context) { finish(); return; } context.drawImage(video, 0, 0, canvas.width, canvas.height); finish(canvas.toDataURL('image/jpeg', .8)); } catch { finish(); } };
    video.onerror = () => finish(); video.src = source;
  });
}
