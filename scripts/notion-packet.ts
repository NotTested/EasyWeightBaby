import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildImportPacket, renderImportPacket, renderPacketSummary } from "../src/lib/import-packet";
async function read(path: string, max: number) { if ((await stat(path)).size > max) throw new Error("Input size limit exceeded"); return readFile(path, "utf8"); }
async function main() {
 const [stagingPath, reviewPath, targetPath, output] = process.argv.slice(2);
 if (!stagingPath || !reviewPath || !targetPath || !output) throw new Error("Usage: notion:packet STAGING REVIEW TARGET NEW_OUTPUT_DIRECTORY");
 const staging = await read(stagingPath, 64 * 1024 * 1024), review = JSON.parse(await read(reviewPath, 8 * 1024 * 1024)), target = JSON.parse(await read(targetPath, 8 * 1024 * 1024));
 const packet = buildImportPacket(staging, review, target);
 // Exclusive new directory: no accidental overwrite of private review work.
 await mkdir(output, { mode: 0o700 });
 await writeFile(join(output, "review-packet.json"), JSON.stringify(packet, null, 2) + "\n", { flag: "wx", mode: 0o600 });
 await writeFile(join(output, "검토자료.md"), renderImportPacket(packet), { flag: "wx", mode: 0o600 });
 await writeFile(join(output, "검토요약.md"), renderPacketSummary(packet), { flag: "wx", mode: 0o600 });
 console.log(JSON.stringify({ ...packet.summary, canApply: false, output }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Packet failed"); process.exitCode = 1; });
