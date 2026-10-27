# Creative React slice

`creativeCards` exports the 16 drawing, swatch, wireframe and media bodies for the shared composition. Mount `CreativeProvider` once around the board runtime. Pass the workspace and the semantic operations in `CreativeServices`. The provider retains capture sessions when a body lease changes. Bodies use workspace content sources; camera changes never enter React state.

The feature folders export `DrawingInspector`, `WireframePanel`, `BoardColours`, `AppearanceColours`, `DevicesPanel`, `ImportButton`, `ImportProgressView` and `createImporter`. Both inspectors expose typed placement/tool requests. Their continuous pointer adapters await the scene input/preview contract. They do not add another canvas loop. `textOutlineStyle` is available for the basic title owner. `createAssetImage` supplies document editors with stable imported asset references.

The retained JavaScript entry points support the default legacy app and unchanged Node suites. Shared pure implementations now live in safe TypeScript. Remaining legacy pointer/render/UI code must be removed together with its consumers after the default switch. Only the integration owner changes the legacy gate manifest.

Run the slice's strict check with `npx tsc --noEmit -p app/src/cards/creative/tsconfig.check.json`. The development-only `proof.html` and `mountProof` allow the external browser driver to exercise the actual workspace, scene and bodies before the application composition is connected. They provide no production host transport and do not replace the standard parity suites.

Detailed evidence and integration requests are under `~/.codex/orchestrate/aegis-react/evidence/creative/`. Standard React acceptance is still partial until the integration, chrome, scene and editor dependencies land.
