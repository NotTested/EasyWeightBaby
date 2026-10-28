import { z } from "zod";
export const emailSchema = z.email().max(254).transform(v => v.toLowerCase());
export const registrationSchema = z.object({
  name: z.string().trim().min(1).max(40),
  email: emailSchema,
  password: z.string().min(12).max(128),
  token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const invitationSchema = z.object({
  email: emailSchema.optional(),
  days: z.number().int().min(1).max(30).default(7),
}).strict();
