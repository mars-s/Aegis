# Colours and media port

Inventory coverage: M1 to M10 and M12. M11 is a disabled transcription button with a tooltip because this host has no local transcription service.

- M1: swatches, the ported colour-name table, HSV wheel, brightness, hex shorthand, custom names and name/hex visibility.
- M2: Board colours panel, saved palette, colours in use, add, rename, recolour and remove. Saved entries also offer these actions in a right-click menu, with keyboard navigation. Palette edits update matching swatches. Removal keeps the cards.
- M3: per-board background, default reset, and separate light/dark app background, dots, panels and accent preferences in Settings. Text contrast follows custom panel/accent colours.
- M4: image picker, image paste/drop, original animation files up to 12 MB, still-image resizing, captions and existing mixed-media imports. Large PNG/SVG encodings fall back to JPEG at the six-million-character data URL threshold.
- M5: local pixel sampling produces up to five distinct swatches. Extracted swatches display main, second, accent, shadow and pop as their initial names and retain the extraction role in props.role. Custom names can replace those labels.
- M6: a full-image crop editor, four corner handles, movement, reset, cancel, Escape and Enter. Only props.crop and display height change.
- M7: editable links, title/description/image/favicon previews, URL drop, existing URL paste and host opening. A loading status is visible until the preview finishes. Failed previews retain the link and offer retry. Escape removes an empty, untitled link card and retains a typed draft.
- M8: Spotify URL/URI detection, saved preview metadata and the Spotify player. Select a card before interacting with the iframe.
- M9: real MediaRecorder audio, countdown, waveform, pause/resume/stop, asset upload, playback, scrubbing and replacement.
- M10: poster capture for recordings and imported videos, measured upload percentages, shared board picker/drop/paste import handling, camera preview, countdown, wide/phone shape, mirroring, pause/resume/stop, imported-file fallback, 60-second idle camera release and 15-minute recording limit. Portrait framing is written into the video when canvas capture is available. Native video controls provide seeking, playback and mute.
- M12: remembered microphone/camera choices, named device listing after permission, device-change refresh and retry with system defaults when a saved device fails. Changing either device restarts an active camera preview and stops the old tracks.

Recording uploads use upload.js with XMLHttpRequest upload events against the existing authenticated /assets endpoint. Credentials come from the host connection in sessionStorage and must match host.base. Percentages measure bytes uploaded; the saving state remains until the host confirms success. Failed recordings remain available for retry. No audio, video, artwork, music or fonts were copied from the reference repository.

## Data

All card-specific fields are in props. Assets stay outside board JSON.

| Card | Fields |
| --- | --- |
| swatch | hex, label, autoName, hideName, hideHex, optional role |
| image | existing url; props.tagText and normalised props.crop {x,y,w,h} |
| link/spotify | url; props.preview {url,title,description,image,favicon}, previewFor, previewError; optional edited title/description |
| audio | props.src asset reference, duration in seconds, wave amplitude samples |
| video | existing url; props.duration, wave, shape, mirror, poster (JPEG data URL), videoWidth, videoHeight |
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

Required checks from the repository root:

```
npm run check
PLAYWRIGHT=/Users/avi/.npm/_npx/6301df25ace19226/node_modules/playwright/index.mjs AEGIS_CHECK_OUT=/tmp/aegis-check-media node checks/ui/run.mjs media docs
```

The browser script uses a throwaway host with AEGIS_FAKE_MODEL=1, temporary AEGIS_DATA and Vite port 5183. The script snapshots all UI source files first so other feature ports cannot trigger HMR during the run. Chromium provides test camera/microphone streams. It records real MediaRecorder files and verifies playback, saved board JSON, palette/background isolation, crop persistence, device persistence, file fallback and a real preview of https://ogp.me/. Physical devices and the packaged macOS app still need a native smoke test.

Screenshots and saved board evidence are under /tmp/aegis-check-media/. Unrelated feature work can temporarily stop the full application from loading while its imported files are still being written.

## Capture tray integration needed in features/editing

`prepareImage(file)` is exported from `features/media/images.js`. It returns
`{ file, width, height, flattened }`, with no upload or board mutation. Board
imports already use it. The capture tray still needs this hook outside media:

1. Accept image files in the tray's `dragover` and `drop` handlers. Prevent the
   default drop and stop propagation so the board does not also import them.
2. Capture the destination board id before awaiting. For each image call
   `prepareImage(file)`, then `ctx.host.upload(prepared.file)`.
3. In `features/editing/main.js`, append an image card through the existing
   `board_set` command's `tray` field. Give it `id: uid()`, `type: 'image'`,
   `url: saved.url`, `text` from the filename, `x: 0`, `y: 0`, `w: 320`,
   `h: Math.max(60, 320 * prepared.height / prepared.width)` and `color: 'plain'`.
   Keep writes on the captured board if it changes.
4. Show the existing still-image message when `flattened` is true, and report
   decoding or upload errors. Do not request camera or microphone access.

## Audit regression checks

`checks/ui/media.mjs` asserts all palette context actions, five visible extraction
roles, PNG fallback and transparency, animation retention, link loading/failure/
retry and empty cancellation, preview stream replacement for both device choices,
video upload percentage and decodable recorded/imported posters. Chromium uses
fake devices only. `agent/checks/media.test.mjs` also checks measured upload events
and host-confirmed completion.
