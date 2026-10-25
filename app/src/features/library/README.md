# Library and navigation

Ports L1 to L6 and L13. No character art, branded helper copy or external assets are used.

- Home opens a full-window project, folder and board overview. Tiles use card geometry previews. Back climbs the library and Escape returns to the board.
- The library shows nested folders and child boards, reveals the current board's ancestors and scopes new items to the selected location. Names can be edited by double-click or through row menus. Escape cancels editing.
- Row menus rename, move, duplicate and delete. Move offers folders, projects, root locations and other boards. Dragging a board onto another board nests it as a canvas. Folder and board cycles are refused.
- Copies recursively create new folder, board, card, group and connector IDs, including child canvases. Confirmed deletion removes descendants, unhooks canvas cards and chooses another board. Deleting the final board creates a fresh one.
- Canvas creates a child board and a preview card. Double-click the preview to enter it. Its title edits the child board's name. Top-bar breadcrumbs climb the board parents.
- Templates add seven frameworks or create one of three starter boards. Collections use editable `template-group` cards with notes linked by `card.parent`. Dragging a group carries its notes. Notes can be dragged between groups or out. Moodboard swatches use the media/colours feature's shared `swatch` type.
- Panels drag between side bars. Settings controls visibility and Reset layout. New feature panels are picked up automatically. Order, sides, folds, sizes and visibility use localStorage key `aegis:panels`.

## Host contract

- `POST /boards {name, parent?, boardParent?, at?}` creates a board. `parent` is a library project/folder. `boardParent` creates a child board, inherits its parent's library placement and adds a canvas card at `at`.
- `GET /library` returns each board's library location as `parent`, and its parent board as `boardParent`. Board JSON uses `parent` for the parent board.
- `POST /library {op:'move', id, parent?, boardParent?}` moves a board or library node. Child boards carry their descendants' library placement.
- `POST /library/duplicate {id}` recursively copies any board, folder or project.
- `POST /boards/:id/delete` deletes a board and its children.
- `POST /library {op:'delete', id, recursive:true}` deletes a folder/project and its contents after UI confirmation. The older operation without `recursive:true` still refuses non-empty nodes.
- Library mutations are serialised. Existing board locks protect their snapshots from overlapping board batches. Files are written individually; this is not a multi-file crash-atomic transaction.

Shared integration edits are the library feature import, shared card-type import, host adapters/endpoints and the empty `#boardCrumbs` nav in App.svelte. No controller or canvas-engine changes are required by this feature.

## Verification

Host/board cases live in `agent/checks/library.test.mjs`. The disposable browser exercise is `/tmp/aegis-check/library-smoke.mjs`, using Vite port 5185 and temporary host data. It checks the saved JSON as well as the UI and writes screenshots under `/tmp/aegis-check/library-*.png`.
