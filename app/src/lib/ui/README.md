# Aegis UI

Typed DOM primitives for menus, value pickers, popovers, dialogs, confirmations and tooltips. React chrome wraps them in `chrome/controls.tsx` (`MenuButton`, `PopupButton`, `ValuePicker`, `Stepper`, `Disclosure`) and imports the modules directly, for example `lib/ui/menu.js`. Feature code owns content and layout. This library owns material, input, focus, positioning and motion.

Inter is self-hosted through `@fontsource-variable/inter`, SIL OFL 1.1. Zephium-derived tokens retain their MPL-2.0 attribution in `styles/tokens.css`.

## Visual contract

The black canvas and flat windows stay quiet. Floating chrome has a neutral surface, a hairline border and one inner top highlight. No floating control gets a heavy drop shadow. Blue means data, agents, selection or keyboard focus. Destructive text uses a contrast-safe red.

`styles/tokens.css` defines spacing at 4, 8, 12, 16, 20 and 24 px, radii at 4, 6, 10 and 14 px, type at 11, 12, 13, 15 and 22 px, 32 px controls, 34 px desktop menu rows and 44 px settings rows. Touch rows remain at least 44 px. `styles/app.css` maps semantic material tokens for both themes. Use `--ui-surface`, `--ui-edge`, `--ui-highlight`, `--ui-shadow`, `--ui-danger` and `--focus`. Avoid feature-specific menu material rules.

`dropdown.css` owns menu, listbox and non-modal popover appearance. `surface.css` owns native dialogs, tabs, switches and tooltips. `ribbon.css` owns the shared office ribbon. `styles/buttons.css` owns buttons. Feature CSS may set widths or content layout without redefining those materials.

## Menus and selects

```ts
import { createMenu } from './lib/ui/menu.js';
import { createDropdown } from './lib/ui/dropdown.js';
const actions = createMenu({
  trigger: moreButton,
  label: 'Window actions',
  heading: 'Research notes',
  items: () => [
    { title: 'Duplicate', shortcut: '⌘D', run: duplicate },
    { title: 'Show details', checked: showDetails, checkType: 'checkbox', run: toggleDetails },
    { title: 'Delete', section: 'Danger', destructive: true, run: remove },
  ],
});
const size = createDropdown({
  label: 'Paper size', options: [['a4', 'A4'], ['letter', 'Letter']],
  value: 'a4', onChange: saveSize,
});
container.append(size);
```

`createMenu` accepts a live `items` factory or array. `checked` defaults to a radio state; `checkType: 'checkbox'` gives an independent checked action. Separators come from section changes. Shortcut chips remain outside accessible item names. Items may supply nested `items` for a submenu. Right and Left open and leave submenus; Escape returns to their trigger. Card context menus choose one platform-specific shortcut representation. Titles and headings are text, never HTML.

Menus expose `open(event, point)`, `close(restoreFocus)`, `setTrigger`, `setItems` and `destroy`. `createCombobox` provides an editable input with a filtered listbox, active-descendant arrow navigation, custom values and the same portal lifecycle. The document font field uses it instead of a native datalist. `bindDisclosure` gives existing live `<details>` content the shared popup lifecycle. More tools uses `placement: right`, with coordinates relative to its transformed rail.

Select buttons expose `.value`, `.setOptions` and `.dropdown`. Programmatic `.value` updates do not emit change. A selection calls `onChange` and emits one bubbling `change` event. Options accept `{ value, label, disabled, group, groupDescription, description }`.

`createPopup({ trigger, menu, role: 'dialog', portal: true })` handles mixed controls such as font, colour, tilt and selection popovers. Menus and listboxes have arrows, Home, End, type-ahead, Enter and Space. Mixed controls keep native Tab order and input arrow behaviour. Escape closes only the active popup and restores its trigger. Outside pointer presses dismiss without moving focus away from the clicked control. Closing popups become inert immediately. Positioning flips, clamps and scrolls within the viewport, follows trigger resize and ancestor scrolling, and sets the transform origin at the trigger. Portals enter the current modal's top layer.

Pointer menus animate for 140 to 160 ms with `--ease-out`. Dialogs take 180 ms. Keyboard entry and dismissal, Motion off and reduced motion are instant. No bounce. Call `destroy()` when unmounting a feature-owned popup. `mountDropdowns()` also disposes removed dropdown triggers and replaces any visible native select with the shared dropdown.

## Dialogs and settings controls

```ts
import { createDialog } from './lib/ui/dialog.js';
import { confirmAction } from './lib/ui/confirm.js';
const dialog = createDialog({ label: 'Edit link', className: 'media-dialog' });
dialog.append(content);
document.body.append(dialog);
dialog.showModal();
const confirmed = await confirmAction({ title: 'Delete this board?', body: 'This also removes its windows.' });
```

Native `<dialog>` provides the focus trap, inert background and top layer. `enhanceDialog` adds the shared skin, heading association, backdrop dismissal, keyboard-aware entry and focus restoration to existing nodes. The app installs this for existing dialogs once. `createDialog` installs it synchronously for new callers. Confirmations open inside an existing modal when necessary and initially focus Cancel.

Settings tabs, switches and steppers are React components. `Stepper` gives 32px decrement, value and increment targets in a 96px group, with touch targets expanded to 44px.

Settings uses a 620px shell at y=48px, with height `min(760px, 100dvh - 96px)`. Its header and tabs stay fixed while the active page scrolls. Raw colour settings live in the collapsed Appearance subsection of General.

## Verification

`checks/ui/controls-polish.mjs` checks the production bundle in Chromium and WebKit, in both themes. It measures Settings at 1440, 1586 and 390px widths, the dataset picker, portalled steppers, sidebar targets, menu press and focus states, Library and toast styling. It verifies colour persistence, column selection and first-Escape focus restoration followed by editor dismissal. Captures and measurements use `AEGIS_CHECK_OUT`.

`createTooltip(trigger, text)` supports focus and hover, a 450 ms initial delay, a 400 ms warm period for immediate adjacent tips, Escape dismissal, viewport clamping and reduced motion. Destroy it with its owner.

Shared consumers include canvas and library context menus, generated-window actions, the selection More and formatting popovers, island options and model choices, Settings, AI connections and zoom menus, all document/sheet/slide ribbon choices, media caption/crop/link dialogs, colour and icon pickers, project cover menus, confirmations and the introduction conversation. Quick capture inherits the common native dialog material without changing its feature code. Full-screen gallery inspection, presentation and mobile navigation retain their content layouts.

Run `npm run check`, `npm --workspace @aegis/app run build` and the production `checks/ui/design-system.mjs` journey. The journey uses temporary `AEGIS_DATA`, `AEGIS_UI=app/dist` and the fake model, opens real controls in both themes and records screenshots and a JSON inventory. Run the full UI suite with `AEGIS_PORT_OFFSET=2700` and `PLAYWRIGHT` pointing to the installed Playwright module. For the same production journey in WebKit, run `AEGIS_BROWSER=webkit node checks/ui/design-system.mjs` with the same Playwright and output environment variables. No verification reads real Aegis user data.

## Critic follow-up

The selection More menu keeps its first level short. Typography lives in Format, geometry in Arrange, metadata in Details and files in Export. Line height has one numeric stepper and a reset action. Feature controls have an Actions section for additions such as Connect.

Card context menus are assembled in `chrome/actions.tsx` with Open or Edit, Copy, Duplicate, Arrange, Lock and Delete in that order. Group requires multiple selected objects. Ungroup requires an existing group. Arrange owns stacking and extra feature actions.

The document ribbon uses one 40 px row for style, emphasis, lists, Insert, Rewrite and Format. Format contains font, colour, spacing, script and table controls. Normal writing starts at 18 px with a 28 px line height and the placeholder says “Start writing…”.
