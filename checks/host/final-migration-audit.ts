import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { parseSync, Visitor } from 'oxc-parser';

const base = '200a207774d1720856a3ccecdb1d41c610dc5059';
interface Assertion { readonly method: string; readonly expected: string }
function inspect(file: string, source: string) {
  const ast = parseSync(file, source, { sourceType: 'module' });
  assert.deepEqual(ast.errors, [], file);
  const names: string[] = [], assertions: Assertion[] = [];
  new Visitor({ CallExpression(node) {
    if (node.callee.type === 'Identifier' && node.callee.name === 'test') {
      const name = node.arguments[0]; assert.ok(name);
      names.push(source.slice(name.start, name.end));
    }
    if (node.callee.type !== 'MemberExpression' || node.callee.object.type !== 'Identifier') return;
    const property = node.callee.property;
    if (node.callee.object.name === 'test' && property.type === 'Identifier') assert.ok(!['skip', 'todo'].includes(property.name), file);
    if (node.callee.object.name !== 'assert') return;
    const expected = node.arguments[1];
    assertions.push({ method: source.slice(property.start, property.end), expected: expected ? source.slice(expected.start, expected.end) : '' });
  } }).visit(ast.program);
  return { names, assertions };
}
let assertionCount = 0, declarationCount = 0;
const markupChanges: { file: string; before: string; after: string }[] = [];
const suites = readdirSync('checks/host').filter(file => file.endsWith('.test.ts')).sort();
for (const suite of suites) {
  const file = `checks/host/${suite}`;
  const before = inspect(file, execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }));
  const after = inspect(file, readFileSync(file, 'utf8'));
  assert.deepEqual(after.names, before.names, `${file}: case declarations changed`);
  assert.equal(after.assertions.length, before.assertions.length, `${file}: assertion count changed`);
  for (const [index, previous] of before.assertions.entries()) {
    const next = after.assertions[index]; assert.ok(next);
    assert.equal(next.method, previous.method, `${file}: assertion method changed`);
    if (previous.expected !== next.expected) {
      assert.equal(file, 'checks/host/deck.test.ts');
      assert.equal(previous.expected, '/contenteditable="plaintext-only"/');
      assert.equal(next.expected, '/contentEditable="plaintext-only"/');
      markupChanges.push({ file, before: previous.expected, after: next.expected });
    }
  }
  declarationCount += after.names.length; assertionCount += after.assertions.length;
}
process.stdout.write(JSON.stringify({ base, suites: suites.length, declarations: declarationCount, assertions: assertionCount, markupChanges }, null, 2) + '\n');
