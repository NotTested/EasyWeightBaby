import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, chownSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { chromium } from "playwright-core";

async function main() {
 const root = process.cwd(), temporary = mkdtempSync(join(tmpdir(), "member-docker-smoke-"));
 const project = "member-e1-" + randomUUID().slice(0, 8), volume = project + "_member_db";
 const appImage = process.env.E1_APP_IMAGE ?? "member-app:e1", toolsImage = process.env.E1_TOOLS_IMAGE ?? "member-app-tools:e1";
 const env: NodeJS.ProcessEnv = { ...process.env, BUILDX_CONFIG: process.env.BUILDX_CONFIG ?? "/workspace/.cache/member-buildx" };
 for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete env[key];
 const sensitive: string[] = [];
 const redact = (value: string) => sensitive.reduce((text, secret) => text.split(secret).join("[redacted]"), value);
 function docker(args: string[], input?: string) {
  try { return execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], { cwd: root, env, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], timeout: 90000 }); }
  catch (error) { const details = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : ""; throw new Error(`Docker smoke failed (${args[0]} ${args[1] ?? ""}): ${redact(details).slice(-3000)}`); }
 }
 const server = createServer(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
 const address = server.address(); assert.ok(address && typeof address !== "string"); const port = address.port;
 await new Promise<void>(resolve => server.close(() => resolve()));
 const base = `http://localhost:${port}`, uid = process.getuid!() || 1000, gid = process.getgid!() || 1000;
 const dbPassword = "p@:#?/%" + randomBytes(24).toString("hex"), auth = randomBytes(48).toString("hex");
 sensitive.push(dbPassword, encodeURIComponent(dbPassword), auth);
 const dbPath = join(temporary, "db-password"), authPath = join(temporary, "auth-secret");
 for (const [path, value] of [[dbPath, dbPassword], [authPath, auth]]) { writeFileSync(path, value + "\n", { mode: 0o600 }); if (process.getuid!() === 0) chownSync(path, uid, gid); }
 const configPath = join(temporary, "stack.env");
 writeFileSync(configPath, [`APP_IMAGE=${appImage}`, `TOOLS_IMAGE=${toolsImage}`, `APP_URL=${base}`, `APP_PORT=${port}`, `APP_UID=${uid}`, `APP_GID=${gid}`, `DB_PASSWORD_PATH=${dbPath}`, `AUTH_SECRET_PATH=${authPath}`].join("\n"), { mode: 0o600 });
 const composeArgs = ["compose", "--env-file", configPath, "-f", "compose.prod.yaml", "-p", project];
 const compose = (args: string[], input?: string) => docker([...composeArgs, ...args], input);
 let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
 try {
  console.log("Docker smoke: validate image and private DB configuration");
  const config = JSON.parse(compose(["config", "--format", "json"]));
  assert.ok(!config.services.db.ports?.length); assert.equal(config.networks.backend.internal, true);
  assert.equal(config.services.app.user, `${uid}:${gid}`);
  const image = JSON.parse(docker(["image", "inspect", appImage]))[0]; assert.equal(image.Architecture, "amd64");
  assert.ok(!image.Config.Env.some((v: string) => /^(DATABASE_URL|BETTER_AUTH_SECRET|HTTP_PROXY|HTTPS_PROXY)=/.test(v)));
  docker(["run", "--rm", "--entrypoint", "node", appImage, "-e", "const fs=require('fs');if(process.getuid()===0||fs.existsSync('/app/.env')||fs.existsSync('/app/node_modules/prisma')||!fs.existsSync('/app/public/sw.js'))process.exit(1)"]);
  docker(["run", "--rm", "--user", "1026:1026", "--entrypoint", "node", appImage, "-e", "const fs=require('fs');fs.accessSync('/app/server.js',fs.constants.R_OK);fs.accessSync('/app/docker/entrypoint.mjs',fs.constants.R_OK);require('next/package.json')"]);
  console.log("Docker smoke: start isolated DB, migrate, and wait for application health");
  compose(["up", "-d", "--wait", "--wait-timeout", "60"]);
  assert.equal((await fetch(base + "/api/health")).status, 200);
  const operations = JSON.parse(execFileSync("python3", ["scripts/check-operations.py", "--env-file", configPath,
   "--project", project, "--disk-path", root, "--expect-app-image", appImage], { env, encoding: "utf8", timeout: 30000 }));
  assert.equal(operations.status, "runtime-ok");
  assert.equal(operations.services.length, 3);
  assert.equal(operations.backup.status, "not-checked");

  assert.equal((await fetch(base + "/api/me")).status, 401);
  const tools = (code: string, input?: string) => compose(["run", "--rm", "-T", "tools", "exec", "--import", "tsx", "-e", code], input);
  const fixturePassword = randomBytes(20).toString("hex"), email = `${project}@example.invalid`;
  sensitive.push(fixturePassword);
  tools("const fs=require('node:fs');const {randomUUID}=require('node:crypto');const {hashPassword}=require('better-auth/crypto');const {createPrismaClient}=require('./src/lib/prisma-client.ts');(async()=>{const value=JSON.parse(fs.readFileSync(0,'utf8'));const db=createPrismaClient(process.env.DATABASE_URL);try{const id=randomUUID();await db.user.create({data:{id,email:value.email,name:'Docker smoke',accounts:{create:{id:randomUUID(),accountId:id,providerId:'credential',password:await hashPassword(value.password)}}}})}finally{await db.$disconnect()}})().catch(()=>process.exit(1))", JSON.stringify({ email, password: fixturePassword }));
  console.log("Docker smoke: browser hydration, login, manifest and worker");
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(base + "/login"); await page.getByLabel("이메일", { exact: true }).fill(email); await page.getByLabel("비밀번호", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click(); await page.waitForURL(base + "/");
  await page.getByRole("heading", { name: "반가워요, Docker smoke님.", exact: true }).waitFor();
  assert.equal((await context.request.get(base + "/api/me")).status(), 200);
  assert.equal((await context.request.get(base + "/manifest.webmanifest")).status(), 200);
  const worker = await context.request.get(base + "/sw.js"); assert.equal(worker.status(), 200); assert.match(worker.headers()["cache-control"], /no-store/);
  console.log("Docker smoke: migration re-run and stop/recreate preserve the volume and login");
  compose(["run", "--rm", "-T", "migrate"]);
  compose(["down"]); compose(["up", "-d", "--wait", "--wait-timeout", "60"]);
  assert.equal((await context.request.get(base + "/api/me")).status(), 200);
  console.log("Docker smoke: runtime authentication secret rotation invalidates the old cookie");
  writeFileSync(authPath, randomBytes(48).toString("hex") + "\n", { mode: 0o600 });
  compose(["up", "-d", "--force-recreate", "--no-deps", "--wait", "--wait-timeout", "60", "app"]);
  assert.equal((await context.request.get(base + "/api/me")).status(), 401);
  console.log("Docker smoke passed: non-root, file secrets, private DB, migrations, browser and persistence");
 } catch (error) {
  try { console.error(redact(compose(["logs", "--no-color", "--tail", "25"]))); } catch { /* Original error remains authoritative. */ }
  throw error;
 } finally {
  await browser?.close();
  try { compose(["down", "--remove-orphans"]); } finally {
   // Only this test's freshly created UUID-scoped synthetic volume is removed.
   const volumes = docker(["volume", "ls", "--format", "{{.Name}}", "--filter", `name=^${volume}$`]).trim();
   if (volumes === volume) docker(["volume", "rm", volume]);
   rmSync(temporary, { recursive: true, force: true });
  }
 }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Docker smoke failed"); process.exitCode = 1; });
