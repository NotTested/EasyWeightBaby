import { rm } from "node:fs/promises";
import path from "node:path";

export async function resetDevTestOutput() {
  // Each test app changes its Origin and authentication secret. Do not reuse
  // another app's Turbopack/HMR output. Test app processes must run serially.
  await rm(path.resolve(".next/dev"), { recursive: true, force: true });
}
