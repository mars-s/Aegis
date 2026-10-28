import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { parseSync, Visitor } from 'oxc-parser';

const base = '200a207774d1720856a3ccecdb1d41c610dc5059';
const uploadCase = 'recording uploads report measured progress and wait for host confirmation';
const historyCase = 'undo and redo restore saved card, link and tray state, branch history and reset on board switch';
interface Assertion { readonly caseName: string | null; readonly method: string; readonly actual: string; readonly expected: string }
interface Scope { readonly name: string; readonly start: number; readonly end: number }
function inspect(file: string, source: string) {
  const ast = parseSync(file, source, { sourceType: 'module' });
  assert.deepEqual(ast.errors, [], file);
  const names: string[] = [], assertions: Assertion[] = [], scopes: Scope[] = [];
  new Visitor({ CallExpression(node) {
    if (node.callee.type === 'Identifier' && node.callee.name === 'test') {
      const name = node.arguments[0], callback = node.arguments.at(-1); assert.ok(name && callback);
      const text = name.type === 'Literal' && typeof name.value === 'string' ? name.value : source.slice(name.start, name.end);
      names.push(text); scopes.push({ name: text, start: callback.start, end: callback.end });
    }
    if (node.callee.type !== 'MemberExpression' || node.callee.object.type !== 'Identifier') return;
    const property = node.callee.property;
    if (node.callee.object.name === 'test' && property.type === 'Identifier') assert.ok(!['skip', 'todo'].includes(property.name), file);
    if (node.callee.object.name !== 'assert') return;
    const actual = node.arguments[0], expected = node.arguments[1];
    assertions.push({ caseName: scopes.find(scope => scope.start <= node.start && scope.end >= node.end)?.name ?? null,
      method: source.slice(property.start, property.end), actual: actual ? source.slice(actual.start, actual.end) : '', expected: expected ? source.slice(expected.start, expected.end) : '' });
  } }).visit(ast.program);
  return { names, assertions };
}

// Exact integration rulings. Each listed change must occur once, in this case.
const authorisedChanges = [
  { file: 'checks/host/deck.test.ts', caseName: 'slide HTML escapes text and charts handle zero targets, constant and single values', method: 'match',
    actualBefore: 'html', actualAfter: 'html', before: '/contenteditable="plaintext-only"/', after: '/contentEditable="plaintext-only"/' },
  { file: 'checks/host/editing.test.ts', caseName: historyCase, method: 'equal',
    actualBefore: 'history.status.length', actualAfter: 'historyStateCount(workspace)', before: '80', after: '81' },
  { file: 'checks/host/media.test.ts', caseName: uploadCase, method: 'equal', actualBefore: '(await saving).url', actualAfter: '(await saving).url',
    before: "'asset:clip.webm'", after: "'asset:0123456789abcdef0123456789abcdef.webm'" },
  { file: 'checks/host/media.test.ts', caseName: uploadCase, method: 'rejects', actualBefore: "uploadRecording({ base: 'https://other.example' }, file, () => {})", actualAfter: 'uploadRecording(client, file, () => {})',
    before: '/Reconnect/', after: "{ message: 'The host request was cancelled' }" },
];
const authorisedAdditions = [
  { file: 'checks/host/editing.test.ts', caseName: historyCase, method: 'equal', actual: "separate.submit([{ op: 'create', type: 'note', newId: id, text: 'One' }]).kind", expected: "'applied'", count: 1 },
  { file: 'checks/host/editing.test.ts', caseName: historyCase, method: 'equal', actual: "separate.submit([{ op: 'update', id, set: { text: 'Two' } }]).kind", expected: "'applied'", count: 1 },
  { file: 'checks/host/editing.test.ts', caseName: historyCase, method: 'equal', actual: 'required(separate.scene.snapshot().cards[0]).text', expected: "'Two'", count: 1 },
  { file: 'checks/host/editing.test.ts', caseName: historyCase, method: 'equal', actual: 'separate.undo().kind', expected: "'applied'", count: 2 },
  { file: 'checks/host/editing.test.ts', caseName: historyCase, method: 'equal', actual: 'required(separate.scene.snapshot().cards[0]).text', expected: "'One'", count: 1 },
  { file: 'checks/host/editing.test.ts', caseName: historyCase, method: 'equal', actual: 'separate.scene.snapshot().cards.length', expected: '0', count: 1 },
  { file: 'checks/host/media.test.ts', caseName: uploadCase, method: 'equal', actual: 'requests.length', expected: 'requestsBeforeDisposal', count: 1 },
];
const changesSeen = new Map<number, number>(), additionsSeen = new Map<number, number>();
let assertionCount = 0, originalAssertions = 0, declarationCount = 0;
const changes: { file: string; caseName: string | null; before: string; after: string }[] = [];
const suites = readdirSync('checks/host').filter(file => file.endsWith('.test.ts')).sort();
for (const suite of suites) {
  const file = `checks/host/${suite}`;
  const before = inspect(file, execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }));
  const after = inspect(file, readFileSync(file, 'utf8'));
  assert.deepEqual(after.names, before.names, `${file}: case declarations changed`);
  const retained = after.assertions.filter(next => {
    const index = authorisedAdditions.findIndex(rule => rule.file === file && rule.caseName === next.caseName && rule.method === next.method && rule.actual === next.actual && rule.expected === next.expected);
    if (index < 0) return true;
    additionsSeen.set(index, (additionsSeen.get(index) ?? 0) + 1); return false;
  });
  assert.equal(retained.length, before.assertions.length, `${file}: original assertion count changed`);
  for (const [index, previous] of before.assertions.entries()) {
    const next = retained[index]; assert.ok(next);
    assert.equal(next.caseName, previous.caseName, `${file}: assertion moved to another case`);
    assert.equal(next.method, previous.method, `${file}: assertion method changed`);
    if (previous.expected !== next.expected) {
      const authorised = authorisedChanges.findIndex(rule => rule.file === file && rule.caseName === previous.caseName && rule.method === previous.method && rule.actualBefore === previous.actual && rule.actualAfter === next.actual && rule.before === previous.expected && rule.after === next.expected);
      assert.ok(authorised >= 0, `${file}: unauthorised expected argument change: ${previous.expected} -> ${next.expected}`);
      changesSeen.set(authorised, (changesSeen.get(authorised) ?? 0) + 1);
      changes.push({ file, caseName: next.caseName, before: previous.expected, after: next.expected });
    }
  }
  declarationCount += after.names.length; assertionCount += after.assertions.length; originalAssertions += before.assertions.length;
}
for (const [index, rule] of authorisedChanges.entries()) assert.equal(changesSeen.get(index), 1, `Missing authorised change in ${rule.file}`);
for (const [index, rule] of authorisedAdditions.entries()) assert.equal(additionsSeen.get(index), rule.count, `Missing or extra authorised assertion: ${rule.actual}`);
process.stdout.write(JSON.stringify({ base, suites: suites.length, declarations: declarationCount, originalAssertions, assertions: assertionCount,
  addedAssertions: assertionCount - originalAssertions, authorisedExpectedChanges: changes }, null, 2) + '\n');
