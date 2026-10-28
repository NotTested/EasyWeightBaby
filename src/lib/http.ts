import { auth } from "./auth";
import { appUrl } from "./config";
import { isAdmin } from "./access";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function currentUser(request: Request, admin = false) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, "로그인이 필요합니다.");
  if (admin && !isAdmin(session.user)) throw new HttpError(403, "관리자만 사용할 수 있습니다.");
  return session.user;
}
export function verifyOrigin(request: Request) {
  if (request.headers.get("origin") !== appUrl()) throw new HttpError(403, "허용되지 않은 요청입니다.");
}
export async function readJson(request: Request, maxBytes = 16384) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "JSON 요청이 필요합니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "입력값이 필요합니다.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "입력값이 너무 큽니다."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpError(400, "입력 형식이 올바르지 않습니다."); }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export function route(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try { return await fn(request); }
    catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError) return json({ error: "입력값을 확인하세요.", fields: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, 400);
      // 자격증명·요청 본문·DB 연결 문자열은 로그에 남기지 않습니다.
      console.error("API operation failed", error instanceof Error ? error.name : "UnknownError");
      return json({ error: "처리하지 못했습니다. 잠시 후 다시 시도하세요." }, 500);
    }
  };
}
