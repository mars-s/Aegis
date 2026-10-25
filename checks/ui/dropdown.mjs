// Exercise the visible picker, including custom menus portalled into a modal dialog.
export async function choose(locator, value) {
  if (await locator.evaluate(el => el.tagName === 'SELECT')) return locator.selectOption(value);
  await locator.click();
  const id = await locator.getAttribute('aria-controls'), menu = locator.page().locator(`[id="${id}"]`);
  const option = typeof value === 'object' && 'index' in value ? menu.getByRole('option').nth(value.index) : menu.locator(`[data-value=${JSON.stringify(String(value))}]`);
  await option.click();
}
