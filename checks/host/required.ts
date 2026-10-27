import assert from 'node:assert/strict';
export function required<T>(value: T | undefined | null, message = 'Expected fixture value'): T {
  assert.ok(value !== undefined && value !== null, message);
  return value;
}
