import { z } from "zod";
export const actualSetSchema = z.object({
  weightKg: z.number().min(0).max(2000).nullable(),
  dumbbellCount: z.union([z.literal(1), z.literal(2)]).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  completed: z.boolean(),
  side: z.enum(["unspecified", "both", "left", "right"]),
  kind: z.enum(["working", "warmup"]),
  actualRir: z.number().int().min(0).max(10).nullable(),
}).strict().refine(s => !s.completed || (s.weightKg !== null && s.reps !== null), "수행 완료에는 중량과 반복이 필요합니다.").refine(s => s.completed || s.actualRir === null, "실제 RIR은 수행 완료한 세트에 기록하세요.");
export const cardioRecordSchema = z.object({
  activity: z.string().trim().min(1).max(80),
  durationMinutes: z.number().min(0).max(1440).nullable(),
  distanceKm: z.number().min(0).max(1000).nullable(),
  intensity: z.string().max(300),
  notes: z.string().max(1000),
  completed: z.boolean(),
}).strict().refine(s => !s.completed || s.durationMinutes !== null, "수행한 유산소의 시간을 입력하세요.");
export type CardioRecordInput = z.infer<typeof cardioRecordSchema>;
export const actualInputSchema = z.object({
  version: z.number().int().positive(),
  intent: z.enum(["save", "complete"]).default("save"),
  actualNotes: z.string().max(5000).optional(),
  cardio: z.array(cardioRecordSchema).max(20).optional(),
  exercises: z.array(z.object({ id: z.string().min(1).optional(), exerciseId: z.string().min(1), sets: z.array(actualSetSchema).max(30) }).strict()).max(40),
}).strict();
export type ActualInput = z.infer<typeof actualInputSchema>;
export type ActualSet = z.infer<typeof actualSetSchema>;
