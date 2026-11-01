# Library and navigation

The React implementation lives in `LibraryView.tsx`, `library-model.ts` and `templates.ts` in this folder.

Ports L1 to L6 and L13. No character art, branded helper copy or external assets are used.

- Home opens a full-window project, folder and board overview. Tiles use card geometry previews. Project covers can use a chosen image, reduced to a JPEG at most 720 px wide, or the first board preview. Back climbs the library and Escape returns to the board.
- The library shows nested folders and child boards, reveals the current board's ancestors and scopes new items to the selected location. Its tree shows only the current project, or the outermost loose folder. Home's All projects shows everything. Names can be edited by double-click or through row menus. Escape cancels editing.
- Row menus rename, move, duplicate and delete. Move offers folders, projects, root locations and other boards. Dragging a board onto another board nests it as a canvas. Folder and board cycles are refused.
- Copies recursively create new folder, board, card, group and connector IDs, including child canvases. Confirmed deletion removes descendants, unhooks canvas cards and chooses another board. Deleting the final board creates a fresh one.
- Canvas creates a child board and a preview card. Double-click the preview to enter it and fit its content. Empty child boards open centred. Its title edits the child board's name. Top-bar breadcrumbs climb the board parents.
- Panels lift from their headers and show insertion slots in both side bars. Escape or pointer cancellation restores their position. Touch skips header dragging, and Library stays pinned at the top left. Settings controls visibility and Reset layout. New feature panels are picked up automatically. Order, sides, folds, sizes and visibility use localStorage key `aegis:panels`.

## Host contract

- `POST /boards {name, parent?, boardParent?, at?}` creates a board. `parent` is a library project/folder. `boardParent` creates a child board, inherits its parent's library placement and adds a canvas card at `at`.
- `GET /library` returns each board's library location as `parent`, and its parent board as `boardParent`. Board JSON uses `parent` for the parent board.
- `POST /library {op:'move', id, parent?, boardParent?}` moves a board or library node. Child boards carry their descendants' library placement.
- `POST /library {op:'cover', id, cover}` saves a project's JPEG data URL. A null cover restores its first board preview.
- `POST /library/duplicate {id}` recursively copies any board, folder or project.
- `POST /boards/:id/delete` deletes a board and its children.
- `POST /library {op:'delete', id, recursive:true}` deletes a folder/project and its contents after UI confirmation. The older operation without `recursive:true` still refuses non-empty nodes.
- Library mutations are serialised. Existing board locks protect their snapshots from overlapping board batches. Files are written individually; this is not a multi-file crash-atomic transaction.

## Verification

Host/board cases live in `agent/checks/library.test.mjs`. The disposable browser exercise is `checks/ui/library.mjs`, using Vite port 5185 and temporary host data. Run `PLAYWRIGHT=/Users/avi/.npm/_npx/6301df25ace19226/node_modules/playwright/index.mjs AEGIS_CHECK_OUT=/tmp/aegis-check-library node checks/ui/run.mjs library` from the repo root. It checks saved JSON as well as the UI and writes screenshots under `/tmp/aegis-check-library/`.

Home focuses its search field when opened. Search matches board names and the
first heading or document title, including boards inside folders. One New menu
creates a Board, Folder or Project. New folders and projects can be named in
place. A new board opens immediately.

Previews load only near the viewport, with four reads at a time and a bounded
cache keyed by board ID and revision. The host includes a content subtitle and
`editedAt` in the board list, so search needs no preview reads. Content batches,
renaming and library changes update that time. Camera changes do not. Older
boards without a timestamp say “Edit time unavailable” until their next edit.
