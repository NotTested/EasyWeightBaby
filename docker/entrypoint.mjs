import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
async function secret(name) {
 const path = process.env[`${name}_FILE`];
 if (!path) throw new Error(`${name}_FILE is required`);
 const value = (await readFile(path, "utf8")).replace(/\r?\n$/, "");
 if (!value || value.startsWith("replace-") || /[\r\n\0]/.test(value)) throw new Error(`${name} secret file is invalid`);
 return value;
}
async function main() {
 if (process.getuid?.() === 0) throw new Error("Application/tools must run as a non-root user");
 const password = await secret("DB_PASSWORD");
 const host = process.env.DB_HOST ?? "db", port = process.env.DB_PORT ?? "5432";
 const url = new URL("postgresql://localhost");
 url.hostname = host; url.port = port; url.username = encodeURIComponent(process.env.DB_USER ?? "member"); url.password = encodeURIComponent(password);
 url.pathname = "/" + (process.env.DB_NAME ?? "member"); url.searchParams.set("schema", "public");
 process.env.DATABASE_URL = url.toString();
 const mode = process.argv[2] ?? "serve";
 if (mode === "serve") {
  process.env.BETTER_AUTH_SECRET = await secret("AUTH_SECRET");
  if (process.env.BETTER_AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET must have at least 32 characters");
  // Validate the public origin before serving even an anonymous health request.
  const app = new URL(process.env.APP_URL ?? "");
  if ((app.protocol !== "https:" && !(app.protocol === "http:" && ["localhost", "127.0.0.1"].includes(app.hostname))) || app.pathname !== "/" || app.search || app.hash || app.username || app.password) throw new Error("APP_URL must be an HTTPS origin");
  process.env.HOSTNAME = process.env.APP_HOST ?? "0.0.0.0";
  await import("../server.js"); return;
 }
 const commands = {
  migrate: [fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)), "migrate", "deploy"],
  admin: ["--import", "tsx", fileURLToPath(new URL("../scripts/create-admin.ts", import.meta.url))],
 };
 const args = mode === "exec" ? process.argv.slice(3) : commands[mode];
 if (!args?.length) throw new Error("Supported modes: serve, migrate, admin, exec NODE_ARGUMENTS");
 const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
 for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
 child.on("error", () => { console.error("Container tool failed to start"); process.exitCode = 1; });
 child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
main().catch(error => {
 // Never log the environment, secret contents, URLs or raw filesystem errors.
 console.error("Container startup failed:", error?.code ? "configuration file unavailable" : "check configuration and secret files");
 process.exitCode = 1;
});
