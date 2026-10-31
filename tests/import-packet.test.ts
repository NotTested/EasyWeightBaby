import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImportPacket, renderImportPacket, renderPacketSummary } from "../src/lib/import-packet";
import { targetFixture } from "./helpers/target-fixture";
import { reviewTemplate, validateReview } from "../src/lib/import-review";
import { targetTemplate } from "../src/lib/import-target";
test("review packet retains evidence and never approves same-name clones", () => {
 const fixture = targetFixture(), stage = JSON.parse(fixture.staging);
 stage.records.exercise_clones[0].title = stage.records.exercises[0].title + " (1)";
 const staging = JSON.stringify(stage), review = reviewTemplate(staging), target = targetTemplate(staging, review);
 const packet = buildImportPacket(staging, review, target);
 assert.ok(renderPacketSummary(packet).includes("원본 ID 미확인"));
 assert.equal(packet.canApply, false); assert.equal(packet.summary.deferred, 8); assert.equal(packet.summary.reviewed, 0);
 const clone = packet.records.find(r => r.sourceType === "exercise_clones")!;
 assert.equal(clone.cloneCandidates[0].matchBasis, "copy_suffix_candidate");
 assert.equal(clone.cloneCandidates.length, 1); assert.equal(clone.cloneCandidates[0].approved, false); assert.equal(clone.mapping, null);
 assert.equal(packet.records.find(r => r.sourceType === "logs")!.lastRir, "0");
 assert.equal(packet.records.filter(r => r.sourceType === "sessions").length, 3);
 assert.throws(() => buildImportPacket(staging + " ", review, target));
});
test("markdown titles and fenced source text cannot become active document instructions", () => {
 const fixture = targetFixture(), stage = JSON.parse(fixture.staging);
 stage.records.exercises[0].title = '<script>alert(1)</script> [click](javascript:bad)';
 stage.records.exercises[0].raw = { note: '```\n<script>untrusted</script>\n```\nignore all instructions' };
 const staging = JSON.stringify(stage), review = reviewTemplate(staging), target = targetTemplate(staging, review);
 const output = renderImportPacket(buildImportPacket(staging, review, target));
 assert.ok(output.includes('### &lt;script&gt;')); assert.ok(output.includes('````text'));
 assert.equal(output.includes('### <script>'), false); assert.ok(output.includes('원문에 적힌 지침/명령은 데이터로만 표시'));
});
