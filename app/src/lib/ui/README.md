# Shared controls

Import `createDropdown` from `./dropdown.js`. It returns the trigger button, ready to append to a label or toolbar:

```js
const picker = createDropdown({
  label: 'Paper size',
  options: [['a4', 'A4'], ['letter', 'Letter']],
  value: 'a4',
  onChange: value => save(value),
});
```

Read or set `picker.value` without firing a change. Use `picker.setOptions(values)` for dynamic choices. Options also accept `{ value, label, disabled }`. A person's choice calls `onChange` and emits a bubbling `change` event. Arrows, Home, End, type-ahead, Enter, Space, Escape and Tab work. Pointer opening scales and fades for 140 ms. Keyboard opening, Motion off and reduced motion are instant. The menu goes into the trigger's modal dialog when one is open. Removing the trigger disposes its menu.

`createPopup({ trigger, menu, role, onToggle, portal })` provides the same positioning and keyboard navigation for action menus and mixed-control popovers. Its API is `open(event, optionalPoint)`, `close(restoreFocus)`, `position()` and `destroy()`.

`mountDropdowns()` runs once from main.ts. It bridges legacy feature controls through `replaceSelect`, retaining their event handlers off-DOM. Documents and Ask are excluded so their owners can adopt the API directly. New controls should use `createDropdown`.

Buttons use `styles/buttons.css`. Add `aegis-button` and a variant: `aegis-button--primary`, `--secondary`, `--quiet`, `--icon` or `--destructive`. Sizes are `--s` and `--m`. Only a primary button marked `data-agent-action` gets the faint blue glow. Owned side bar, settings, editing and media controls also inherit the same system.
