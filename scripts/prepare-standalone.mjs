import { cp, readdir, rm, access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".next/standalone");
await access(path.join(output, "server.js"));
const buildId = (await readFile(path.join(root, ".next/BUILD_ID"), "utf8")).trim();
const template = await readFile(path.join(root, "scripts/sw-template.js"), "utf8");
await writeFile(path.join(root, "public/sw.js"), template.replace("__MEMBER_BUILD_ID__", JSON.stringify(buildId)));
// Next copies build-time dotenv files. Runtime secrets must be injected instead.
for (const name of await readdir(output)) {
  if (name === ".env" || name.startsWith(".env.")) await rm(path.join(output, name));
}
await cp(path.join(root, ".next/static"), path.join(output, ".next/static"), { recursive: true });
try { await access(path.join(root, "public")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const hasPublic = (await readdir(root)).includes("public");
if (hasPublic) await cp(path.join(root, "public"), path.join(output, "public"), { recursive: true });
console.log("Standalone prepared: static assets copied, dotenv files excluded.");
