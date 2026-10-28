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
export const actualInputSchema = z.object({
  version: z.number().int().positive(),
  exercises: z.array(z.object({ id: z.string().min(1).optional(), exerciseId: z.string().min(1), sets: z.array(actualSetSchema).max(30) }).strict()).max(40),
}).strict();
export type ActualInput = z.infer<typeof actualInputSchema>;
export type ActualSet = z.infer<typeof actualSetSchema>;
