#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  arg,
  createEvidence,
  historyEntry,
  projectCutCounts,
  readJson,
  serializeEvidence,
  sha256,
  snapshotIdFor,
  writeJson,
} from "./lib/dogfood-evidence.mjs";

const repoRoot = process.cwd();
const outputDir = path.resolve(arg("output-dir", ".buildchain/dogfood-history-backfill"));
const kungfuDir = path.resolve(arg("kungfu-dir", ".observed-evidence/source"));
const config = readJson(path.resolve(arg("config", "src/fixtures/dogfood-history-bootstrap.json")));
const fixture = readJson(path.join(repoRoot, "src", "fixtures", "dogfood-evidence.json"));
const generatedAt = new Date(arg("generated-at", new Date().toISOString())).toISOString();
const generatorCommit = arg("generator-commit", process.env.GITHUB_SHA || "local-uncommitted");
const entries = [];
const immutables = [];

for (const snapshot of config.snapshots) {
  const cuts = projectCutCounts(kungfuDir, snapshot.kungfuCommit);
  for (const key of ["retained", "valid", "nonEmpty", "empty"]) {
    if (cuts[key] !== snapshot.projectCuts[key]) {
      throw new Error(`${snapshot.observedAt} Project Cut ${key} drifted: expected ${snapshot.projectCuts[key]}, got ${cuts[key]}`);
    }
  }
  const evidence = createEvidence({
    fixture,
    observedAt: snapshot.observedAt,
    github: snapshot.github,
    cuts,
    generatedAt,
    generationKind: "backfill",
    backfill: true,
    queryCapturedAt: config.queryCapturedAt,
    generatorCommit,
    generatorCommand: "node scripts/generate-dogfood-history-backfill.mjs",
    sourceRef: config.sourceRef,
    workflow: {
      repository: process.env.GITHUB_REPOSITORY || "local/site-libkungfu-dev",
      runId: process.env.GITHUB_RUN_ID || "local",
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || "local",
      runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    },
    limitations: [
      "This is a retrospective observation generated after the historical boundary from exact public GitHub queries and the exact Kungfu Git tree at or before that boundary.",
      "A later GitHub visibility change can make a live replay differ; the immutable snapshot preserves the captured result and query contract.",
    ],
    priorEntries: entries,
  });
  const body = serializeEvidence(evidence);
  const digest = sha256(body);
  const relative = `snapshots/${evidence.snapshotId}.json`;
  const file = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  entries.push(historyEntry(evidence, digest));
  immutables.push({
    source: relative,
    key: `production/dogfood-evidence/snapshots/${evidence.snapshotId}.json`,
    sha256: digest,
    contentType: "application/json",
  });
}

writeJson(path.join(outputDir, "history-seed.json"), {
  schema: "kungfu.dogfood-history-seed/v1",
  semantics: "Append-only prior observation entries for the first v2 current snapshot.",
  entries: [...entries, config.legacy],
});
writeJson(path.join(outputDir, "backfill-manifest.json"), {
  schemaVersion: 1,
  contract: "kungfu-site-dogfood-immutable-backfill/v1",
  generatedAt,
  publication: { immutables },
});
console.log(`generated ${immutables.length} deterministic backfill snapshots in ${outputDir}`);
