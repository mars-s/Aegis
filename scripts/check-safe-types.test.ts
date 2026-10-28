import { describe, expect, it } from "vitest";
import { inspectRepository, inspectSource } from "./check-safe-types.js";
import type { Rule } from "./check-safe-types.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Fixture {
  readonly name: string;
  readonly file: string;
  readonly source: string;
  readonly rule: Rule;
}

const fixtures: readonly Fixture[] = [
  { name: "authored JavaScript", file: "app/src/input.js", source: "export const value = 1;", rule: "authored-javascript" },
  { name: "authored module JavaScript", file: "checks/ui/input.mjs", source: "export const value = 1;", rule: "authored-javascript" },
  { name: "explicit any", file: "scripts/input.ts", source: "let value: any;", rule: "explicit-any" },
  { name: "nested any", file: "scripts/input.ts", source: "type X = Promise<Array<any>>;", rule: "explicit-any" },
  { name: "as cast", file: "scripts/input.ts", source: "const x = value as string;", rule: "type-assertion" },
  { name: "double cast", file: "scripts/input.ts", source: "const x = value as unknown as string;", rule: "type-assertion" },
  { name: "angle cast", file: "scripts/input.ts", source: "const x = <string>value;", rule: "type-assertion" },
  { name: "non-null", file: "scripts/input.ts", source: "value!.run();", rule: "non-null" },
  { name: "definite property", file: "scripts/input.ts", source: "class X { value!: string; }", rule: "non-null" },
  { name: "definite variable", file: "scripts/input.ts", source: "let value!: string;", rule: "non-null" },
  { name: "ignore directive", file: "scripts/input.ts", source: "// @ts-ignore\nvalue();", rule: "suppression" },
  { name: "expect-error directive", file: "scripts/input.ts", source: "// @ts-expect-error reason\nvalue();", rule: "suppression" },
  { name: "nocheck directive", file: "scripts/input.ts", source: "// @ts-nocheck\nvalue();", rule: "suppression" },
  { name: "block directive", file: "scripts/input.ts", source: "/* @ts-ignore */\nvalue();", rule: "suppression" },
  { name: "declaration shim", file: "app/src/input.d.ts", source: "declare const value: any;", rule: "explicit-any" },
  { name: "TSX cast", file: "app/src/Input.tsx", source: "const x = value as HTMLElement;", rule: "type-assertion" },
  { name: "unsupported syntax", file: "scripts/input.ts", source: "const = ;", rule: "parse" },
  { name: "browser Node builtin", file: "app/src/input.ts", source: 'import fs from "node:fs";', rule: "node-import" },
  { name: "bare Node builtin", file: "app/src/input.ts", source: 'import fs from "fs/promises";', rule: "node-import" },
  { name: "domain Node type", file: "packages/domain/src/input.ts", source: 'import type { Buffer } from "node:buffer";', rule: "node-import" },
  { name: "domain React", file: "packages/domain/src/input.ts", source: 'import React from "react";', rule: "package-owner" },
  { name: "protocol scene", file: "packages/protocol/src/input.ts", source: 'export * from "@aegis/scene";', rule: "package-owner" },
  { name: "scene Zod", file: "packages/scene/src/input.ts", source: 'import { z } from "zod/v4";', rule: "package-owner" },
  { name: "scene React", file: "packages/scene/src/input.ts", source: 'import React from "react";', rule: "package-owner" },
  { name: "scene runtime domain", file: "packages/scene/src/input.ts", source: 'import { CardSchema } from "@aegis/domain";', rule: "package-owner" },
  { name: "host-client React", file: "packages/host-client/src/input.ts", source: 'import React from "react";', rule: "package-owner" },
  { name: "app Effect", file: "app/src/Input.tsx", source: 'import { Effect } from "effect";', rule: "effect-owner" },
  { name: "canvas Effect", file: "app/src/canvas/input.ts", source: 'import type { Effect } from "effect";', rule: "effect-owner" },
  { name: "Effect platform escape", file: "packages/scene/src/input.ts", source: 'import * as Node from "@effect/platform-node";', rule: "effect-owner" },
  { name: "agent app package", file: "agent/src/input.ts", source: 'import App from "@aegis/app";', rule: "package-owner" },
  { name: "agent scene package", file: "agent/src/input.ts", source: 'import { createCanvas } from "@aegis/scene";', rule: "package-owner" },
  { name: "agent app relative", file: "agent/src/input.ts", source: 'import App from "../../app/src/App.js";', rule: "relative-owner" },
  { name: "app agent package", file: "app/src/input.ts", source: 'import { start } from "@aegis/agent";', rule: "package-owner" },
  { name: "relative package escape", file: "packages/domain/src/input.ts", source: 'import { decode } from "../../protocol/src/http.js";', rule: "relative-owner" },
  { name: "absolute path escape", file: "app/src/input.ts", source: 'import fs from "/tmp/library.js";', rule: "relative-owner" },
  { name: "private package path", file: "packages/protocol/src/input.ts", source: 'import { x } from "@aegis/domain/src/private.js";', rule: "private-import" },
  { name: "dynamic Node import", file: "app/src/input.ts", source: 'import("node:fs");', rule: "node-import" },
  { name: "type import escape", file: "packages/scene/src/input.ts", source: 'type X = import("react").X;', rule: "package-owner" },
  { name: "require import escape", file: "app/src/input.ts", source: 'import fs = require("node:fs");', rule: "node-import" },
  { name: "require call escape", file: "app/src/input.ts", source: 'const fs = require("node:fs");', rule: "node-import" },
  { name: "computed import", file: "app/src/input.ts", source: "import(name);", rule: "dynamic-import" },
  { name: "computed require", file: "app/src/input.ts", source: "require(name);", rule: "dynamic-import" },
  { name: "foreign frame owner", file: "packages/scene/src/draw.ts", source: "requestAnimationFrame(paint);", rule: "frame-owner" },
  { name: "canvas frame owner", file: "app/src/canvas/input.ts", source: "window.requestAnimationFrame(paint);", rule: "frame-owner" },
  { name: "computed frame owner", file: "packages/scene/src/draw.ts", source: 'window["requestAnimationFrame"](paint);', rule: "frame-owner" },
];

describe("safe TypeScript and import ownership", () => {
  it.each(fixtures)("rejects $name", ({ file, source, rule }) => {
    expect(inspectSource(file, source).map(finding => finding.rule)).toContain(rule);
  });

  it.each([
    ["scripts/input.ts", 'const x = { kind: "ok" } as const;'],
    ["scripts/input.ts", 'const x = "any as string! // @ts-ignore";'],
    ["scripts/input.ts", "// Ordinary prose uses as and any without being TypeScript.\nconst x: unknown = null;"],
    ["packages/domain/src/input.ts", 'import { z } from "zod/v4";'],
    ["packages/domain/src/input.ts", 'import type { Card } from "./schema/cards.js";'],
    ["packages/protocol/src/input.ts", 'import { CardSchema } from "@aegis/domain";'],
    ["packages/scene/src/input.ts", 'import type { Card } from "@aegis/domain/contracts";'],
    ["packages/scene/src/input.ts", 'import { type Card } from "@aegis/domain";'],
    ["packages/scene/src/input.ts", 'export type { Card } from "@aegis/domain";'],
    ["packages/scene/src/input.ts", 'import RBush from "rbush";'],
    ["packages/host-client/src/input.ts", 'import { Effect } from "effect";'],
    ["agent/src/input.ts", 'import { Effect } from "effect"; import fs from "node:fs";'],
    ["app/src/canvas/Input.tsx", 'import { useEffect } from "react";'],
    ["packages/scene/src/engine.ts", "requestAnimationFrame(paint);"],
  ])("accepts safe syntax and allowed ownership in %s", (file, source) => {
    expect(inspectSource(file, source)).toEqual([]);
  });

  it("reports the source location of a violation", () => {
    expect(inspectSource("scripts/input.ts", "\nconst value: any = 1;")).toEqual([
      { file: "scripts/input.ts", line: 2, column: 14, rule: "explicit-any", message: "Parse unknown boundary data into a schema-derived type." },
    ]);
  });
});

describe("strict repository gate", () => {
  it("reports findings even when an old allowance file claims to permit them", () => {
    const root = mkdtempSync(join(tmpdir(), "aegis-strict-gate-"));
    try {
      execFileSync("git", ["init", "--quiet", root]);
      mkdirSync(join(root, "scripts"));
      writeFileSync(join(root, "scripts/input.ts"), "const value: any = 1;");
      writeFileSync(join(root, "scripts/safe-types-legacy.json"), JSON.stringify({ "scripts/input.ts": { "explicit-any": 100 } }));
      expect(inspectRepository(root).map(finding => finding.rule)).toEqual(["explicit-any"]);
      writeFileSync(join(root, "scripts/input.ts"), "const value: number = 1;");
      expect(inspectRepository(root)).toEqual([]);
      writeFileSync(join(root, "scripts/untyped.mjs"), "export const value = 1;");
      expect(inspectRepository(root).map(finding => finding.rule)).toEqual(["authored-javascript"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
