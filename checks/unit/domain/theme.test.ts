import { expect, test } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { sandboxDocument, THEME_KEYS } from '@aegis/protocol/sandbox';

test('generated UI receives the complete canonical theme and live colour scheme and motion changes', () => {
  const css = readFileSync(new URL('../../../app/src/styles/tokens.css', import.meta.url), 'utf8');
  const canonical = [...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))];
  expect(new Set(THEME_KEYS)).toEqual(new Set(canonical));
  const html = sandboxDocument({ html: '<button>Continue</button>', css: '', js: '', parentOrigin: 'https://aegis.invalid' }, 'theme-view', '', '');
  const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!bootstrap) throw new Error('Missing sandbox bootstrap');
  const applied = new Map<string, string>();
  const classes = new Map<string, boolean>();
  const parent = { postMessage() {} };
  let receive: ((event: { source: object; origin: string; data: unknown }) => void) | undefined;
  const style = { visibility: '', colorScheme: '', setProperty(key: string, value: string) { applied.set(key, value); } };
  runInNewContext(bootstrap, {
    parent, window: {}, TextEncoder,
    document: { documentElement: { style, classList: { toggle(key: string, on: boolean) { classes.set(key, on); } } } },
    addEventListener(type: string, listener: (event: { source: object; origin: string; data: unknown }) => void) { if (type === 'message') receive = listener; },
  });
  const theme = Object.fromEntries(THEME_KEYS.map(key => [key, `light ${key}`]));
  receive?.({ source: parent, origin: 'https://aegis.invalid', data: { type: 'aegis:html-preferences', channel: 'theme-view', theme, scheme: 'light', motionOff: false } });
  expect(applied.get('--glass-bg')).toBe('light --glass-bg');
  expect(applied.get('--text-3')).toBe('light --text-3');
  expect(style.colorScheme).toBe('light');
  expect(classes.get('motion-off')).toBe(false);
  const dark = Object.fromEntries(THEME_KEYS.map(key => [key, `dark ${key}`]));
  receive?.({ source: parent, origin: 'https://aegis.invalid', data: { type: 'aegis:html-preferences', channel: 'theme-view', theme: dark, scheme: 'dark', motionOff: true } });
  expect([...applied]).toEqual(Object.entries(dark));
  expect(style.colorScheme).toBe('dark');
  expect(classes.get('motion-off')).toBe(true);
  // Incomplete preferences cannot leave generated UI with mixed light and dark tokens.
  const incomplete = Object.fromEntries(Object.entries(theme).filter(([key]) => key !== '--accent'));
  receive?.({ source: parent, origin: 'https://aegis.invalid', data: { type: 'aegis:html-preferences', channel: 'theme-view', theme: incomplete, scheme: 'light', motionOff: false } });
  expect([...applied]).toEqual(Object.entries(dark));
  expect(style.colorScheme).toBe('dark');
});
