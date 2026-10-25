# Colours and media port

Inventory coverage: M1 to M10 and M12. M11 is a disabled transcription button with a tooltip because this host has no local transcription service.

- M1: swatches, the ported colour-name table, HSV wheel, brightness, hex shorthand, custom names and name/hex visibility.
- M2: Board colours panel, saved palette, colours in use, add, rename, recolour and remove. Palette edits update matching swatches. Removal keeps the cards.
- M3: per-board background, default reset, and separate light/dark app background, dots, panels and accent preferences in Settings. Text contrast follows custom panel/accent colours.
- M4: image picker, image paste/drop, original animation files up to 12 MB, still-image resizing, captions and existing mixed-media imports.
- M5: local pixel sampling produces up to five distinct swatches. Swatches use automatic colour names and retain their extraction role in props.role.
- M6: a full-image crop editor, four corner handles, movement, reset, cancel, Escape and Enter. Only props.crop and display height change.
- M7: editable links, title/description/image/favicon previews, URL drop, existing URL paste and host opening. Failed previews retain the link and offer retry.
- M8: Spotify URL/URI detection, saved preview metadata and the Spotify player. Select a card before interacting with the iframe.
- M9: real MediaRecorder audio, countdown, waveform, pause/resume/stop, asset upload, playback, scrubbing and replacement.
- M10: camera preview, countdown, wide/phone shape, mirroring, pause/resume/stop, imported-file fallback, 60-second idle camera release and 15-minute recording limit. Portrait framing is written into the video when canvas capture is available. Native video controls provide seeking, playback and mute.
- M12: remembered microphone/camera choices, named device listing after permission, device-change refresh and retry with system defaults when a saved device fails.

The host upload contract provides a completed response rather than percentage progress. The card shows a saving state and retains a failed recording for retry. No audio, video, artwork, music or fonts were copied from the reference repository.

## Data

All card-specific fields are in props. Assets stay outside board JSON.

| Card | Fields |
| --- | --- |
| swatch | hex, label, autoName, hideName, hideHex, optional role |
| image | existing url; props.tagText and normalised props.crop {x,y,w,h} |
| link/spotify | url; props.preview {url,title,description,image,favicon}, previewFor, previewError; optional edited title/description |
| audio | props.src asset reference, duration in seconds, wave amplitude samples |
| video | existing url; props.duration, wave, shape, mirror |
| board | palette [{hex,name}], bg |

Recording sessions, streams, chunks and countdown state are transient. Switching boards stops capture and saves the result to the original board. Device choices use aegis:media:microphone and aegis:media:camera in localStorage. App colours use aegis:colour-settings.

## Shared changes from this feature

- features/index.ts imports media/index, which also loads colours. types/index.js imports media.js.
- commands.js validates board_set.palette and preserves a spotify card's url at creation. The existing board_set command stores palette/background.
- canvas/engine.js draws board.bg and resolves a double-click hit beneath pointer capture before opening a card.
- agent/server.mjs adds the authenticated GET /link-preview?url= endpoint and audio/APNG asset MIME types.
- The server-only link-preview.mjs validates all DNS answers, pins the connection to an approved address, checks every redirect, limits the response to 1 MB and times out after seven seconds. It accepts only HTTP/HTTPS and refuses credentials and private/loopback destinations.
- tauri.conf.json adds frame-src https://open.spotify.com and bundles the server preview helper. Its macOS configuration merges Info.plist usage text and Entitlements.plist camera/audio permissions.

## Verification

Required checks:

```
cd app && npx svelte-check --threshold error
npm --prefix agent run check
node /tmp/aegis-check/media-smoke.mjs
```

The browser script uses a throwaway host with AEGIS_FAKE_MODEL=1, temporary AEGIS_DATA and Vite port 5183. The script snapshots all UI source files first so other feature ports cannot trigger HMR during the run. Chromium provides test camera/microphone streams. It records real MediaRecorder files and verifies playback, saved board JSON, palette/background isolation, crop persistence, device persistence, file fallback and a real preview of https://ogp.me/. Physical devices and the packaged macOS app still need a native smoke test.

Evidence is under /tmp/aegis-check/media-*.png, media-saved-board.json, media-smoke.log and media-host-check.log. Unrelated feature work can temporarily stop the full application from loading while its imported files are still being written.
