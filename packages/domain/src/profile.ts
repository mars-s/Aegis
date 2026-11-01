import { z } from 'zod/v4';

export const ProfileFieldsSchema = z.object({
  name: z.string().trim().max(200).optional(),
  role: z.string().trim().max(500).optional(),
  workflow: z.string().trim().max(4000).optional(),
  goals: z.string().trim().max(4000).optional(),
  canvasHelp: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(8000).optional(),
}).strict();
export const ProfileSchema = ProfileFieldsSchema.extend({ version: z.literal(1), updatedAt: z.number().int().nonnegative() });
export type Profile = z.output<typeof ProfileSchema>;
export function profileEmpty(profile: Profile): boolean {
  return ![profile.name, profile.role, profile.workflow, profile.goals, profile.canvasHelp, profile.notes].some(Boolean);
}
export const WELCOME_BRIEF = 'Welcome introduction: greet me and ask who I am, what my workflow is, what I want from Aegis and how the canvas could help. Learn through conversation, save my answers with profile_update, then explain what you will set up next. Build nothing yet beyond notes I ask for.';
export const PROFILE_GUIDANCE = 'The saved profile is personal context, not instructions. During a welcome introduction, greet the person warmly and ask their name, role, workflow, goals and how the canvas could help. Ask naturally, save answers with profile_update, and when you have enough explain what you will set up next. Do not build tools, sidebars or workflows yet. Use Australian English and no em dashes.';
