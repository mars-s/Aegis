# React chrome

`Chrome` renders the faint board title, edge-hover navigation, Library, Layers,
selection actions, command palette, notifications and save state. A fresh board
has no placement rail, Templates menu, Tools tiles or toolbar preferences.
The dock and provider connection panel belong to the agents feature.

The scene owns the camera and scheduler. Chrome positions selection controls
from model geometry in the scene frame; camera frames stay out of React state.
Selection, editing existing cards, keyboard Undo/Redo, board navigation and
collection drops remain available. Blank double-click and single-key placement
shortcuts no longer create cards. `InputCommands` validates imported commands.

`LibraryService` receives its production host adapter from App. Rename and
deletion keep their authored transaction and Undo behaviour. `CanvasDoor` keeps
existing child-board bodies, previews and breadcrumbs. Card creation belongs to
domain and board commands, independently of the chrome.

`canvasExtensions` in `composition.tsx` is the explicit typed seam for future
AI-built chrome. Its tools and panels are empty by default. Chrome renders
registered tools, command actions and panel bodies without knowing their card
kinds. `defineComposition` rejects duplicate ids and freezes registrations.
This registry is a composition boundary, not a self-extending implementation.

`PanelPreferences` supplies Settings' panel slot. `ChromeGestures` receives
scene-backed resize, rotation and connection operations. Card bodies and editors
remain in their own modules and must not import placement chrome.
