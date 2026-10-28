import { z } from "zod";

export const equipmentLabels = { dumbbell: "덤벨", dumbbell_bench: "덤벨·벤치", bodyweight: "맨몸", ab_wheel: "AB 휠", barbell: "바벨", machine: "머신", other: "기타" };
export const categoryLabels = { chest: "가슴", back: "등", shoulders: "어깨", arms: "팔", legs: "하체", core: "코어", cardio: "유산소", other: "기타" };
export const executionLabels = { bilateral: "양측 동시", alternating: "좌우 교대", bodyweight: "맨몸" };
export const measurementLabels = { reps: "반복", duration: "시간", distance: "거리" };
export function normalizeExerciseName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase(); }

export const exerciseFields = z.object({
  name: z.string().trim().min(1).max(80),
  aliases: z.array(z.string().trim().min(1).max(80).refine(value => !value.includes(","), "별칭에 구분용 쉼표를 포함할 수 없습니다.")).max(12).refine(
    values => new Set(values.map(normalizeExerciseName)).size === values.length, "같은 별칭을 중복 입력하지 마세요."),
  equipment: z.enum(Object.keys(equipmentLabels) as [keyof typeof equipmentLabels, ...Array<keyof typeof equipmentLabels>]),
  category: z.enum(Object.keys(categoryLabels) as [keyof typeof categoryLabels, ...Array<keyof typeof categoryLabels>]),
  execution: z.enum(Object.keys(executionLabels) as [keyof typeof executionLabels, ...Array<keyof typeof executionLabels>]),
  measurement: z.enum(Object.keys(measurementLabels) as [keyof typeof measurementLabels, ...Array<keyof typeof measurementLabels>]),
  benchAngle: z.string().trim().max(40),
  notes: z.string().trim().max(2000),
  active: z.boolean(),
}).strict();
export const createExerciseSchema = exerciseFields.extend({ scope: z.enum(["private", "shared"]) }).strict();
export const updateExerciseSchema = exerciseFields.extend({ version: z.number().int().min(1) }).strict();
export type ExerciseFields = z.infer<typeof exerciseFields>;
export type ExerciseItem = ExerciseFields & { id: string; version: number; scope: "private" | "shared"; canEdit: boolean };
