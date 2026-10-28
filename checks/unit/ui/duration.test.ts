import { expect, test } from 'vitest';
import { cssMilliseconds } from '../../../app/src/lib/ui/duration.js';

test('production seconds and development milliseconds keep the same menu and dialog durations', () => {
  expect(cssMilliseconds('140ms', 500)).toBe(140);
  expect(cssMilliseconds('.14s', 500)).toBe(140);
  expect(cssMilliseconds('.18s', 500)).toBe(180);
  expect(cssMilliseconds(' 1.25s ', 500)).toBe(1250);
  expect(cssMilliseconds('1e-3s', 500)).toBe(1);
});
test('zero duration stays instant and invalid CSS retains the declared fallback', () => {
  expect(cssMilliseconds('0ms', 140)).toBe(0);
  expect(cssMilliseconds('0s', 140)).toBe(0);
  for (const value of ['', '-2s', '140', '0x10s', 'Infinitys', 'calc(1s + 2s)']) expect(cssMilliseconds(value, 180)).toBe(180);
});
