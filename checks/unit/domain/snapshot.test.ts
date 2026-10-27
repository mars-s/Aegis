import { expect, test } from 'vitest';
import { reportedSnapshot, sandboxDocument } from '@aegis/protocol/sandbox';

const state = JSON.stringify({ version: 1, controls: [], text: [], custom: { count: 42 } });
const source = {}, channel = 'view-channel', requestId = 'attempt-one';
const reply = { type: 'aegis:html-snapshot-result', channel, requestId, kind: 'ok', state };
const event = { source, origin: 'null', data: reply };

test('snapshot acknowledgement requires the exact opaque view and request', () => {
  expect(reportedSnapshot(event, source, channel, requestId)?.kind).toBe('ok');
  for (const invalid of [
    { ...event, source: {} }, { ...event, origin: 'https://foreign.invalid' },
    { ...event, data: { ...reply, channel: 'old-view' } },
    { ...event, data: { ...reply, requestId: 'previous-attempt' } },
    { ...event, data: { ...reply, extra: true } },
    { ...event, data: { ...reply, state: '{}' } },
    { ...event, data: { ...reply, state: state.replace('42', '1e999') } },
    { ...event, data: { ...reply, state: JSON.stringify({ version: 1, controls: [], text: [], custom: 'x'.repeat(66000) }) } },
  ]) expect(reportedSnapshot(invalid, source, channel, requestId)).toBeNull();
  expect(reportedSnapshot(event, null, channel, requestId)).toBeNull();
});

test('sandbox refusal is explicit and cannot masquerade as saved state', () => {
  const data = { type: 'aegis:html-snapshot-result', channel, requestId, kind: 'refused', reason: 'invalid-state' };
  expect(reportedSnapshot({ ...event, data }, source, channel, requestId)?.kind).toBe('refused');
  expect(reportedSnapshot({ ...event, data: { ...data, state } }, source, channel, requestId)).toBeNull();
  const html = { html: '<button>Keep state</button>', css: '', js: '' };
  expect(sandboxDocument(html, channel, '', '', false)).not.toContain('aegis:html-snapshot-result');
  expect(sandboxDocument(html, channel, '', '', false, true)).toContain('aegis:html-snapshot-result');
});
