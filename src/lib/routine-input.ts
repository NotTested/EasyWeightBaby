import { z } from "zod";
export const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const item = z.object({ exerciseId: z.string().min(1).max(100), sets: z.number().int().min(1).max(20),
  minReps: z.number().int().min(1).max(1000), maxReps: z.number().int().min(1).max(1000),
  rir: z.number().int().min(0).max(10).nullable(), benchAngle: z.string().trim().max(40), notes: z.string().trim().max(200),
}).strict().refine(value => value.minReps <= value.maxReps, "최소 반복은 최대 반복보다 클 수 없습니다.");
const day = z.object({ weekday: z.number().int().min(0).max(6), rest: z.boolean(), items: z.array(item).max(20) }).strict()
  .refine(value => value.rest ? value.items.length === 0 : value.items.length > 0, "휴식일은 종목 없이, 운동일은 종목을 하나 이상 지정하세요.");
export const routineFields = z.object({ name: z.string().trim().min(1).max(80), days: z.array(day).length(7)
  .refine(values => new Set(values.map(value => value.weekday)).size === 7, "요일을 중복 없이 모두 지정하세요.") }).strict();
export const routineUpdate = routineFields.extend({ version: z.number().int().min(1).max(2147483646) }).strict();
export type RoutinePlan = z.infer<typeof routineFields>;
export type RoutineDetail = Omit<RoutinePlan, "days"> & { id: string; version: number; currentVersion: number;
  days: Array<Omit<RoutinePlan["days"][number], "items"> & { items: Array<RoutinePlan["days"][number]["items"][number] & { exerciseName: string }> }> };
export function blankRoutine(): RoutinePlan { return { name: "", days: weekdays.map((_, weekday) => ({ weekday, rest: true, items: [] })) }; }
