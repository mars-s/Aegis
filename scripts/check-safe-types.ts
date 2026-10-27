import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod/v4";
import { builtinModules } from "node:module";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync, Visitor } from "oxc-parser";

export type Rule =
  | "parse"
  | "explicit-any"
  | "type-assertion"
  | "non-null"
  | "suppression"
  | "node-import"
  | "effect-owner"
  | "package-owner"
  | "relative-owner"
  | "private-import"
  | "dynamic-import"
  | "frame-owner";

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: Rule;
  readonly message: string;
}

type Owner = "domain" | "protocol" | "scene" | "host-client" | "agent" | "app" | "tooling";

function owner(file: string): Owner {
  for (const name of ["domain", "protocol", "scene", "host-client"] as const) {
    if (file.startsWith(`packages/${name}/`)) return name;
  }
  if (file.startsWith("agent/")) return "agent";
  if (file.startsWith("app/src/")) return "app";
  return "tooling";
}

const packageIs = (source: string, name: string): boolean => source === name || source.startsWith(`${name}/`);
const nodeImport = (source: string): boolean => source.startsWith("node:") || builtinModules.includes(source);
const effectImport = (source: string): boolean => packageIs(source, "effect") || source.startsWith("@effect/");

export function inspectSource(file: string, source: string): readonly Finding[] {
  const findings: Finding[] = [];
  const location = file.replaceAll("\\", "/");
  const sourceOwner = owner(location);
  const governed = sourceOwner !== "tooling";
  const hotPath = sourceOwner === "scene" || location.startsWith("app/src/canvas/");
  const frameOwner = location === "packages/scene/src/engine.ts";
  const add = (rule: Rule, message: string, start = 0): void => {
    const preceding = source.slice(0, start);
    findings.push({
      file: location,
      line: preceding.split("\n").length,
      column: preceding.length - preceding.lastIndexOf("\n"),
      rule,
      message,
    });
  };

  const imported = (name: string, typeOnly: boolean, start: number): void => {
    if (effectImport(name) && sourceOwner !== "agent" && sourceOwner !== "host-client") {
      add("effect-owner", "Effect belongs only in agent and host-client.", start);
    }
    if (nodeImport(name)) {
      if (["domain", "protocol", "scene", "app"].includes(sourceOwner)) {
        add("node-import", "Node imports cannot enter browser or pure packages.", start);
      }
      return;
    }
    if (!governed) return;
    if (name.startsWith("/")) {
      add("relative-owner", "Use local relative imports or public package exports.", start);
      return;
    }
    if (name.startsWith(".")) {
      const target = posix.normalize(posix.join(posix.dirname(location), name));
      if (owner(target) !== sourceOwner) {
        add("relative-owner", "Cross-owner imports must use public package exports.", start);
      }
      return;
    }
    if (name.startsWith("@aegis/") && /\/(?:src|dist)(?:\/|$)/.test(name)) {
      add("private-import", "Import a public package export, never src or dist.", start);
    }
    switch (sourceOwner) {
      case "domain":
        if (!packageIs(name, "zod")) add("package-owner", "Domain may import Zod only.", start);
        break;
      case "protocol":
        if (!packageIs(name, "zod") && !packageIs(name, "@aegis/domain")) {
          add("package-owner", "Protocol may import domain and Zod only.", start);
        }
        break;
      case "scene":
        if (packageIs(name, "@aegis/domain")) {
          if (!typeOnly) add("package-owner", "Scene imports domain types only.", start);
        } else if (!packageIs(name, "rbush")) {
          add("package-owner", "Scene may import domain types and RBush only.", start);
        }
        break;
      case "host-client":
        if (!packageIs(name, "@aegis/domain") && !packageIs(name, "@aegis/protocol") && !packageIs(name, "effect")) {
          add("package-owner", "Host-client may import domain, protocol and Effect only.", start);
        }
        break;
      case "agent":
        if (["@aegis/app", "@aegis/scene", "react", "react-dom"].some(pkg => packageIs(name, pkg))) {
          add("package-owner", "Agent cannot import the app, scene or React.", start);
        }
        break;
      case "app":
        if (packageIs(name, "@aegis/agent")) add("package-owner", "App cannot import the agent implementation.", start);
        break;
      default: {
        const exhaustive: never = sourceOwner;
        return exhaustive;
      }
    }
  };

  const parsed = parseSync(location, source, { sourceType: "module" });
  for (const error of parsed.errors) add("parse", error.message, error.labels[0]?.start ?? 0);
  for (const comment of parsed.comments) {
    for (const match of comment.value.matchAll(/@ts-(?:ignore|expect-error|nocheck)\b/g)) {
      add("suppression", "TypeScript suppression directives are forbidden.", comment.start + 2 + match.index);
    }
  }
  const visitor = new Visitor({
    TSAnyKeyword: node => add("explicit-any", "Parse unknown boundary data into a schema-derived type.", node.start),
    TSAsExpression(node) {
      const annotation = node.typeAnnotation;
      const constant = annotation.type === "TSTypeReference" && annotation.typeName.type === "Identifier" && annotation.typeName.name === "const";
      if (!constant) add("type-assertion", "Only as const is allowed. Validate and narrow instead.", node.start);
    },
    TSTypeAssertion: node => add("type-assertion", "Angle-bracket type assertions are forbidden.", node.start),
    TSNonNullExpression: node => add("non-null", "Handle the missing case instead of asserting it away.", node.start),
    VariableDeclarator(node) {
      if (node.definite) add("non-null", "Definite assignment assertions are forbidden.", node.start);
    },
    PropertyDefinition(node) {
      if (node.definite) add("non-null", "Definite assignment assertions are forbidden.", node.start);
    },
    ImportDeclaration(node) {
      const typeOnly = node.importKind === "type" || node.specifiers.length > 0 && node.specifiers.every(specifier => specifier.type === "ImportSpecifier" && specifier.importKind === "type");
      imported(node.source.value, typeOnly, node.start);
    },
    ExportNamedDeclaration(node) {
      if (node.source) {
        const typeOnly = node.exportKind === "type" || node.specifiers.length > 0 && node.specifiers.every(specifier => specifier.exportKind === "type");
        imported(node.source.value, typeOnly, node.start);
      }
    },
    ExportAllDeclaration(node) {
      imported(node.source.value, node.exportKind === "type", node.start);
    },
    ImportExpression(node) {
      if (node.source.type === "Literal" && typeof node.source.value === "string") imported(node.source.value, false, node.start);
      else if (governed) add("dynamic-import", "Import targets must be static so ownership can be checked.", node.start);
    },
    TSImportType(node) {
      if (node.argument.type === "TSLiteralType" && node.argument.literal.type === "Literal" && typeof node.argument.literal.value === "string") imported(node.argument.literal.value, true, node.start);
      else if (governed) add("dynamic-import", "Type import targets must be static.", node.start);
    },
    TSImportEqualsDeclaration(node) {
      if (node.moduleReference.type === "TSExternalModuleReference") imported(node.moduleReference.expression.value, node.importKind === "type", node.start);
    },
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || node.callee.name !== "require") return;
      const argument = node.arguments[0];
      if (argument?.type === "Literal" && typeof argument.value === "string") imported(argument.value, false, node.start);
      else if (governed) add("dynamic-import", "Require targets must be static.", node.start);
    },
    Identifier(node) {
      if (hotPath && !frameOwner && node.name === "requestAnimationFrame") add("frame-owner", "Only scene/src/engine.ts may own scene animation frames.", node.start);
    },
    MemberExpression(node) {
      if (hotPath && !frameOwner && node.computed && node.property.type === "Literal" && node.property.value === "requestAnimationFrame") {
        add("frame-owner", "Only scene/src/engine.ts may own scene animation frames.", node.start);
      }
    },
  });
  visitor.visit(parsed.program);
  return findings;
}

export function inspectRepository(root: string): readonly Finding[] {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  return [...new Set(files.split("\0"))].filter(file => /\.(?:[cm]?ts|tsx)$/.test(file) && existsSync(resolve(root, file))).sort().flatMap(file => inspectSource(file, readFileSync(resolve(root, file), "utf8")));
}

const RuleSchema = z.enum([
  "parse", "explicit-any", "type-assertion", "non-null", "suppression", "node-import",
  "effect-owner", "package-owner", "relative-owner", "private-import", "dynamic-import", "frame-owner",
]);
const LegacyManifestSchema = z.record(z.string(), z.partialRecord(RuleSchema, z.int().positive()));
export type LegacyManifest = z.output<typeof LegacyManifestSchema>;

export function checkLegacyLimits(
  findings: readonly Finding[],
  manifest: LegacyManifest,
  previous: LegacyManifest = manifest,
): readonly string[] {
  const errors: string[] = [];
  const actual = new Map<string, Map<Rule, number>>();
  for (const finding of findings) {
    const counts = actual.get(finding.file) ?? new Map<Rule, number>();
    counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
    actual.set(finding.file, counts);
  }
  for (const [file, counts] of actual) {
    for (const [rule, count] of counts) {
      const limit = manifest[file]?.[rule] ?? 0;
      if (count > limit) errors.push(`${file} [${rule}]: ${count} findings exceeds legacy limit ${limit}.`);
    }
  }
  for (const [file, counts] of Object.entries(manifest)) {
    if (!actual.has(file)) errors.push(`${file}: remove the legacy entry for this deleted or clean file.`);
    if (Object.keys(counts).length === 0) errors.push(`${file}: empty legacy entries must be removed.`);
    for (const [rule, limit] of Object.entries(counts)) {
      const prior = previous[file]?.[RuleSchema.parse(rule)] ?? 0;
      if (limit > prior) errors.push(`${file} [${rule}]: legacy limit cannot rise from ${prior} to ${limit}.`);
    }
  }
  return errors;
}

function readCommittedManifest(root: string): LegacyManifest {
  const path = "scripts/safe-types-legacy.json";
  const present = execFileSync("git", ["ls-tree", "HEAD", "--", path], { cwd: root, encoding: "utf8" });
  // The first manifest is seeded once from the recorded foundation blocker.
  if (!present.trim()) {
    const baseline: unknown = JSON.parse(readFileSync(resolve(root, "react-port-gate-blocker.json"), "utf8"));
    const recorded = z.object({ findings: z.array(z.object({ file: z.string(), rule: z.string() })) }).parse(baseline);
    const seeded: Record<string, Record<string, number>> = {};
    for (const finding of recorded.findings) {
      const counts = seeded[finding.file] ?? {};
      counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
      seeded[finding.file] = counts;
    }
    return LegacyManifestSchema.parse(seeded);
  }
  const source = execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: "utf8" });
  const parsed: unknown = JSON.parse(source);
  return LegacyManifestSchema.parse(parsed);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const findings = inspectRepository(root);
  const raw: unknown = JSON.parse(readFileSync(resolve(root, "scripts/safe-types-legacy.json"), "utf8"));
  const manifest = LegacyManifestSchema.parse(raw);
  const errors = checkLegacyLimits(findings, manifest, readCommittedManifest(root));
  for (const error of errors) process.stderr.write(`${error}\n`);
  if (errors.length) {
    for (const finding of findings) process.stderr.write(`${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`Safe-type and import ownership gates passed. ${findings.length} recorded legacy findings.\n`);
}
