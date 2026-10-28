import { randomBytes } from "node:crypto";

// Isolate test runs without disabling the app's database-backed rate limiter.
export function testClientIP() {
  const bytes = randomBytes(2);
  return `198.18.${bytes[0]}.${bytes[1]}`;
}
