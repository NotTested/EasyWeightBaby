import { z } from "zod";
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "실제 존재하는 날짜를 지정해주세요.");
export const startSessionSchema = z.object({ requestId: z.uuid(), title: z.string().trim().min(1).max(100), localDate: localDateSchema,
  source: z.object({ routineId: z.string().min(1).max(100), version: z.number().int().min(1).max(2147483647), weekday: z.number().int().min(0).max(6) }).strict().nullable(),
}).strict();
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export function todayInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(name => parts.find(part => part.type === name)!.value).join("-");
}
