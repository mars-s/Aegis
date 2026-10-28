import { ConfigSchema } from './schemas.ts';

export function browserConfig() {
  const element = document.getElementById('native-config');
  if (!element?.textContent) throw new Error('Missing native measurement configuration');
  const value: unknown = JSON.parse(element.textContent);
  return ConfigSchema.parse(value);
}

export function present<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error('Missing native measurement value');
  return value;
}
