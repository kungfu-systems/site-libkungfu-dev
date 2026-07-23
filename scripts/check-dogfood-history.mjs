#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { snapshotIdFor } from "./lib/dogfood-evidence.mjs";

const repoRoot = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, "src", "fixtures", "dogfood-history-bootstrap.json"), "utf8"));
assert.equal(config.schema, "kungfu.dogfood-history-bootstrap/v1");
assert.deepEqual(
  config.snapshots.map((entry) => entry.observedAt),
  [
    "2026-07-06T03:17:00.000Z",
    "2026-07-13T03:17:00.000Z",
    "2026-07-20T03:17:00.000Z",
  ],
);
assert.equal(config.legacy.snapshotId, "kungfu-systems-2026-07-21T08:34:30.931Z");
assert.equal(config.legacy.sha256, "db60fce21c0b1e6e262ec21b54309bbb137fb9c18e7d3fdf8214595cc4405ca6");
assert.equal(config.legacy.offCadence, true);
assert.equal(config.legacy.previousSnapshotId, snapshotIdFor(config.snapshots.at(-1).observedAt));
for (const snapshot of config.snapshots) {
  assert.match(snapshot.kungfuCommit, /^[a-f0-9]{40}$/);
  assert.equal(
    snapshot.github.repositories.reduce((total, repository) => total + repository.mergedPublicPullRequests, 0),
    snapshot.github.mergedPublicPullRequests,
    `${snapshot.observedAt} repository counts must sum to the organization total`,
  );
  assert.equal(snapshot.projectCuts.valid, snapshot.projectCuts.retained);
  assert.equal(snapshot.projectCuts.nonEmpty + snapshot.projectCuts.empty, snapshot.projectCuts.retained);
}

const dirIndex = process.argv.indexOf("--backfill-dir");
if (dirIndex !== -1) {
  const outputDir = path.resolve(process.argv[dirIndex + 1]);
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, "backfill-manifest.json"), "utf8"));
  assert.equal(manifest.contract, "kungfu-site-dogfood-immutable-backfill/v1");
  assert.equal(manifest.publication.immutables.length, config.snapshots.length);
  for (const [index, immutable] of manifest.publication.immutables.entries()) {
    const file = path.join(outputDir, immutable.source);
    const bytes = fs.readFileSync(file);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), immutable.sha256);
    const result = spawnSync(process.execPath, ["scripts/check-dogfood-evidence.mjs", "--file", file], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const evidence = JSON.parse(bytes);
    assert.equal(evidence.snapshotId, snapshotIdFor(config.snapshots[index].observedAt));
    assert.equal(evidence.history.entries.length, index);
  }
  const seed = JSON.parse(fs.readFileSync(path.join(outputDir, "history-seed.json"), "utf8"));
  assert.equal(seed.entries.length, config.snapshots.length + 1);
  assert.equal(seed.entries.at(-1).snapshotId, config.legacy.snapshotId);
}

console.log(`dogfood history valid${dirIndex === -1 ? "" : " (generated backfills matched)"}`);
