import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { parseSync, Visitor } from 'oxc-parser';
import { CaseRecordSchema } from './migration-reporter.ts';
import { required } from './required.ts';

const base = 'bb7f647b1dfe5212c847a5d5711cf9ba5a05f3d8';
const beforeLog = required(process.argv[2], 'Supply the baseline JSONL reporter output');
const afterLog = required(process.argv[3], 'Supply the converted JSONL reporter output');
const readCases = (file: string) => readFileSync(file, 'utf8').trim().split('\n').map(line => {
  const raw: unknown = JSON.parse(line);
  return CaseRecordSchema.parse(raw);
});
const before = readCases(beforeLog), after = readCases(afterLog);
const suiteOf = (file: string) => basename(file).replace(/\.test\.(?:mjs|ts)$/, '');
const keyOf = (row: typeof before[number]) => `${suiteOf(row.file)}\t${row.name}`;
assert.equal(before.length, 242);
assert.ok(after.length >= 242);
assert.ok(before.every(row => row.status === 'pass'));
assert.ok(after.every(row => row.status === 'pass'));
assert.equal(new Set(before.map(keyOf)).size, before.length, 'Baseline cases must be distinct');
assert.deepEqual([...before.map(keyOf)].sort(), [...after.map(keyOf)].sort(), 'Every original case name must survive');
assert.equal(readdirSync('agent/checks').filter(file => file.endsWith('.test.mjs')).length, 0);

function inspect(file: string, source: string) {
  const parsed = parseSync(file, source, { sourceType: 'module' });
  assert.deepEqual(parsed.errors, [], file);
  const declarations: { name: string; assertions: number }[] = [];
  let assertions = 0;
  const countAssertions = (text: string) => {
    let count = 0;
    new Visitor({ CallExpression(node) {
      if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && node.callee.object.name === 'assert') count++;
    } }).visit(parseSync(file, text, { sourceType: 'module' }).program);
    return count;
  };
  new Visitor({ CallExpression(node) {
    if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && node.callee.object.name === 'assert') assertions++;
    if (node.callee.type !== 'Identifier' || node.callee.name !== 'test') return;
    const name = node.arguments[0], callback = node.arguments[1];
    assert.ok(name && callback);
    const text = name.type === 'Literal' && typeof name.value === 'string' ? name.value : source.slice(name.start, name.end);
    declarations.push({ name: text, assertions: countAssertions(source.slice(callback.start, callback.end)) });
  } }).visit(parsed.program);
  return { assertions, declarations };
}

const suites = [...new Set(before.map(row => suiteOf(row.file)))].sort();
const assertionRows = ['suite\tbefore_file\tafter_file\tbefore_assertions\tafter_assertions\tdeclarations\tconverted_cases'];
const counts = new Map<string, { before: number; after: number }>();
let convertedCases = 0;
for (const suite of suites) {
  const oldFile = `agent/checks/${suite}.test.mjs`, newFile = `checks/host/${suite}.test.ts`;
  const launcher = execFileSync('git', ['show', `${base}:${oldFile}`], { encoding: 'utf8' });
  const moved = !launcher.startsWith("import '../../checks/host/");
  const beforeFile = moved ? oldFile : newFile;
  const oldSource = moved ? launcher : execFileSync('git', ['show', `${base}:${beforeFile}`], { encoding: 'utf8' });
  const old = inspect(beforeFile, oldSource), next = inspect(newFile, readFileSync(newFile, 'utf8'));
  assert.deepEqual(next.declarations.map(row => row.name), old.declarations.map(row => row.name), `${suite}: test declarations and names`);
  assert.ok(next.assertions >= old.assertions, `${suite}: assertion total fell`);
  for (const [index, row] of old.declarations.entries()) {
    assert.ok(required(next.declarations[index]).assertions >= row.assertions, `${suite}: ${row.name} lost assertions`);
  }
  const cases = before.filter(row => suiteOf(row.file) === suite).length;
  if (moved) convertedCases += cases;
  assertionRows.push([suite, beforeFile, newFile, old.assertions, next.assertions, old.declarations.length, moved ? cases : 0].join('\t'));
  counts.set(suite, { before: old.assertions, after: next.assertions });
}
assert.equal(convertedCases, 115);
const afterByKey = new Map(after.map(row => [keyOf(row), row]));
const rows = ['suite\tbefore_file\tbefore_case\tafter_file\tafter_case\tbefore_suite_assertions\tafter_suite_assertions'];
for (const row of before) {
  const next = required(afterByKey.get(keyOf(row))), suite = suiteOf(row.file), count = required(counts.get(suite));
  rows.push([suite, row.file, row.name, next.file, next.name, count.before, count.after].join('\t'));
}
writeFileSync('checks/host/migration-cases.tsv', `${rows.join('\n')}\n`);
writeFileSync('checks/host/migration-assertions.tsv', `${assertionRows.join('\n')}\n`);
process.stdout.write(`${before.length} -> ${after.length} cases, ${convertedCases} converted. Names and per-case assertion counts preserved. Zero .test.mjs files.\n`);
