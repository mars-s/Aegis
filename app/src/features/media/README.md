# Colours and media primitives

The former placement tools are removed. Existing media cards, their editors, imports and Settings device preferences remain available. Inventory coverage: M1 to M10 and M12. M11 is a disabled transcription button with a tooltip because this host has no local transcription service.

- M1: swatches, the ported colour-name table, HSV wheel, brightness, hex shorthand, custom names and name/hex visibility.
- M2: Board colours panel, saved palette, colours in use, add, rename, recolour and remove. Saved entries also offer these actions in a right-click menu, with keyboard navigation. Palette edits update matching swatches. Removal keeps the cards.
- M3: per-board background, default reset, and separate light/dark app background, dots, panels and accent preferences in Settings. Text contrast follows custom panel/accent colours.
- M4: image picker, image paste/drop, original animation files up to 12 MB, still-image resizing, captions and existing mixed-media imports. Large PNG/SVG encodings fall back to JPEG at the six-million-character data URL threshold.
- M5: local pixel sampling produces up to five distinct swatches. Extracted swatches display main, second, accent, shadow and pop as their initial names and retain the extraction role in props.role. Custom names can replace those labels.
- M6: a full-image crop editor with a named crop area, four named corner handles, and shared X, Y, Width and Height steppers. Arrow keys move or resize by one original-image pixel, or ten with Shift. Controls have 2px focus outlines, unclipped 28px handle targets and live geometry announcements. Tab visits the area, corners, fields, Reset, Cancel and Done. Enter applies from the area, corners or fields; action buttons keep their named action. Escape cancels. Crops stay within the image with a minimum of 8% per dimension, rounded up to a whole pixel. Only props.crop and display height change, and one-pixel crops are retained.
- M7: editable links, title/description/image/favicon previews, URL drop, existing URL paste and host opening. A loading status is visible until the preview finishes. Failed previews retain the link and offer retry. Escape removes an empty, untitled link card and retains a typed draft.
- M8: Spotify URL/URI detection, saved preview metadata and the Spotify player. Select a card before interacting with the iframe.
- M9: real MediaRecorder audio, countdown, waveform, pause/resume/stop, asset upload, playback, scrubbing and replacement.
- M10: poster capture for recordings and imported videos, measured upload percentages, shared board picker/drop/paste import handling, camera preview, countdown, wide/phone shape, mirroring, pause/resume/stop, imported-file fallback, 60-second idle camera release and 15-minute recording limit. Portrait framing is written into the video when canvas capture is available. Native video controls provide seeking, playback and mute.
- M12: remembered microphone/camera choices, named device listing after permission, device-change refresh and retry with system defaults when a saved device fails. Changing either device restarts an active camera preview and stops the old tracks.

Recording uploads use the host client's `upload` with XMLHttpRequest upload events against the existing authenticated /assets endpoint. Credentials come from the host connection in sessionStorage and must match host.base. Percentages measure bytes uploaded; the saving state remains until the host confirms success. Failed recordings remain available for retry. No audio, video, artwork, music or fonts were copied from the reference repository.

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

## Verification

Run `npm run check` and `node checks/ui/run.mjs imports docs crop-a11y`.
The removed `media.mjs` suite exercised the shipped placement tools; imports,
cropping and card editing retain their own checks with disposable host data.

`node checks/ui/run.mjs crop-a11y` builds the production UI and checks keyboard-only cropping in Chromium and WebKit, in both themes at 1440×900 and 1586×992. It verifies pixel steps, numeric entry, Tab order, focus restoration, bounds, live geometry, saved board data, reload, cancellation and pointer/stepper synchronisation. Screenshots, build output and `crop-a11y.json` go to `AEGIS_CHECK_OUT`.

Screenshots and saved board evidence are under /tmp/aegis-check-media/.

`prepareImage(file)` in `image-utils.ts` returns `{ file, width, height, flattened }`, with no upload or board mutation. Board imports in `features/imports/react.tsx` use it.
