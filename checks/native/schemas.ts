import { z } from 'zod';

export const BuildMarkerSchema = z.object({ implementation: z.string(), facade: z.boolean() });
const UiIdentitySchema = z.object({ marker: BuildMarkerSchema, files: z.array(z.object({ path: z.string(), sha256: z.string() })), sha256: z.string() });
export const BuildManifestSchema = z.object({
  schema: z.literal(1), head: z.string().regex(/^[a-f0-9]{40}$/), branch: z.string(), trackedChanges: z.string(),
  command: z.literal('npm run build'), started: z.string(), finished: z.string(),
  switches: z.object({ AEGIS_UI_IMPL: z.literal('react'), AEGIS_TEST_FACADE: z.literal('1') }),
  app: z.string(), ui: z.string(), executableSha256: z.string(), uiIdentity: UiIdentitySchema,
});
export type BuildManifest = z.output<typeof BuildManifestSchema>;
export const ConfigSchema = z.object({ collector: z.url(), warmupMs: z.number().nonnegative(), frames: z.number().int().positive().optional() });
const stats = {
  frames: z.number(), fps: z.number(), p50: z.number(), p95: z.number(), max: z.number(),
  within12_5Ms: z.number(), within12_5MsPercent: z.number(), targetHz: z.number(), droppedFrames: z.number(), droppedPercent: z.number(),
};
const runtime = { hidden: z.boolean(), hostConnected: z.boolean(), tauri: z.boolean() };
export const FailureSchema = z.object({ error: z.string() });
export const ProbeReportSchema = z.object({ ...stats, ...runtime }).loose();
export type ProbeReport = z.output<typeof ProbeReportSchema>;
export const ReplayReportSchema = z.object({
  ...stats, ...runtime, kind: z.literal('react-scene-replay'), pass: z.boolean(), cards: z.number(),
  implementation: z.object({ marker: BuildMarkerSchema, rootManagedByReact: z.boolean(), bodies: z.record(z.string(), z.number()) }).loose(),
  samples: z.array(z.object({ interval: z.number(), cpu: z.number(), phase: z.enum(['pan', 'zoom-out', 'zoom-in']) }).loose()),
}).loose();
export type ReplayReport = z.output<typeof ReplayReportSchema>;
