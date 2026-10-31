import { z } from "zod";
import { localDateSchema } from "./session-input";
const date = z.preprocess(value => value === "" ? undefined : value, localDateSchema.optional());
const fields = z.object({ from: date, to: date, status: z.enum(["all", "in_progress", "completed"]).default("all"), after: z.string().min(1).max(100).optional() }).strict()
 .refine(value => !value.from || !value.to || value.from <= value.to, "시작일은 종료일보다 늦을 수 없습니다.");
export const historyQuerySchema = z.custom<Record<string, unknown>>(value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => ["from", "to", "status", "after"].includes(key)), "지원하지 않는 조회 조건입니다.").pipe(fields);
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export function historyHref(query: HistoryQuery, after?: string) {
 const params = new URLSearchParams();
 if (query.from) params.set("from", query.from); if (query.to) params.set("to", query.to);
 if (query.status !== "all") params.set("status", query.status); if (after) params.set("after", after);
 return "/history" + (params.size ? "?" + params.toString() : "");
}
