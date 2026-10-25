// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// The shared host upload uses fetch, which does not expose upload progress.
// Use the same local host and session credentials with XMLHttpRequest for recordings.
export function uploadRecording(host, file, progress) {
  return new Promise((resolve, reject) => {
    const saved = JSON.parse(sessionStorage.getItem('aegis:host') || 'null');
    if (!saved?.token || host.base !== `http://127.0.0.1:${saved.port}`) {
      reject(new Error('Reconnect to the local host before saving media')); return;
    }
    const request = new XMLHttpRequest();
    request.open('POST', host.base + '/assets'); request.responseType = 'json'; request.timeout = 120000;
    request.setRequestHeader('authorization', `Bearer ${saved.token}`);
    request.setRequestHeader('content-type', file.type);
    request.upload.onprogress = event => { if (event.lengthComputable && event.total) progress(Math.min(100, Math.round(event.loaded / event.total * 100))); };
    request.onload = () => {
      if (request.status < 200 || request.status >= 300 || !request.response?.url) reject(new Error(request.response?.error || `Upload failed (${request.status})`));
      else { progress(100); resolve(request.response); }
    };
    request.onerror = () => reject(new Error('The media upload connection failed'));
    request.ontimeout = () => reject(new Error('The media upload timed out'));
    request.onabort = () => reject(new Error('The media upload was cancelled'));
    progress(0); request.send(file);
  });
}
