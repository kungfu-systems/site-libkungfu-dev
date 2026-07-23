#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { arg, readJson, writeJson } from "./lib/dogfood-evidence.mjs";

const execute = process.argv.includes("--execute");
const backfillManifestArg = arg("backfill-manifest");
const currentManifestArg = arg("current-manifest");
const bucket = arg("bucket");
const distribution = arg("cloudfront-distribution");
if (!backfillManifestArg || !currentManifestArg || !bucket || !distribution) {
  throw new Error("--backfill-manifest, --current-manifest, --bucket, and --cloudfront-distribution are required");
}
const backfillManifestFile = path.resolve(backfillManifestArg);
const currentManifestFile = path.resolve(currentManifestArg);
const receiptFile = path.resolve(arg("receipt", ".buildchain/dogfood-history-publication-receipt.json"));

const backfillManifest = readJson(backfillManifestFile);
const currentManifest = readJson(currentManifestFile);
if (backfillManifest.contract !== "kungfu-site-dogfood-immutable-backfill/v1") throw new Error("unexpected backfill manifest contract");
if (currentManifest.contract !== "kungfu-buildchain-observed-evidence-bundle") throw new Error("unexpected current manifest contract");

function absoluteSource(manifestFile, entry) {
  const source = path.resolve(path.dirname(manifestFile), entry.source);
  const manifestRoot = `${path.dirname(manifestFile)}${path.sep}`;
  if (!source.startsWith(manifestRoot)) throw new Error(`publication source escapes manifest directory: ${entry.source}`);
  return source;
}

const immutableEntries = [
  ...backfillManifest.publication.immutables.map((entry) => ({ ...entry, file: absoluteSource(backfillManifestFile, entry) })),
  {
    ...currentManifest.publication.immutable,
    file: absoluteSource(currentManifestFile, currentManifest.publication.immutable),
  },
];
const latestEntry = {
  ...currentManifest.publication.latest,
  file: absoluteSource(currentManifestFile, currentManifest.publication.latest),
};
const immutablePattern = /^production\/dogfood-evidence\/snapshots\/kungfu-systems-[A-Za-z0-9:.+-]+\.json$/;
for (const entry of immutableEntries) {
  if (!immutablePattern.test(entry.key)) throw new Error(`immutable key is outside the dogfood snapshot allowlist: ${entry.key}`);
  if (!fs.existsSync(entry.file)) throw new Error(`publication source is missing: ${entry.file}`);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(entry.file)).digest("hex");
  if (digest !== entry.sha256) throw new Error(`publication source hash mismatch: ${entry.file}`);
}
if (latestEntry.key !== "production/dogfood-evidence.json") throw new Error(`latest key is outside the allowlist: ${latestEntry.key}`);
if (crypto.createHash("sha256").update(fs.readFileSync(latestEntry.file)).digest("hex") !== latestEntry.sha256) {
  throw new Error("latest publication source hash mismatch");
}

const plan = {
  mode: execute ? "execute" : "dry-run",
  bucket,
  immutableWrites: immutableEntries.map((entry) => ({ key: entry.key, sha256: entry.sha256, condition: "If-None-Match: *; identical existing bytes are an idempotent success" })),
  latestWrite: { key: latestEntry.key, sha256: latestEntry.sha256, condition: "only after every immutable object passes read-after-write verification" },
  invalidationPaths: ["/dogfood-evidence.json", "/dogfood/*"],
  rollback: "Restore production/dogfood-evidence.json from the preceding immutable snapshot and invalidate the same two paths. Immutable snapshots are never deleted.",
};
console.log(JSON.stringify(plan, null, 2));
if (!execute) process.exit(0);

function aws(args, allowFailure = false) {
  const result = spawnSync("aws", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0 && !allowFailure) throw new Error(`aws ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result;
}

function verifyRemote(entry) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dogfood-evidence-verify-"));
  const target = path.join(tempDir, "object.json");
  aws(["s3api", "get-object", "--bucket", bucket, "--key", entry.key, target]);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (digest !== entry.sha256) throw new Error(`read-after-write hash mismatch for ${entry.key}: ${digest}`);
}

for (const entry of immutableEntries) {
  const snapshotId = path.basename(entry.key, ".json");
  const result = aws([
    "s3api", "put-object",
    "--bucket", bucket,
    "--key", entry.key,
    "--body", entry.file,
    "--content-type", "application/json",
    "--cache-control", "public,max-age=31536000,immutable",
    "--metadata", `sha256=${entry.sha256},snapshot-id=${snapshotId}`,
    "--if-none-match", "*",
  ], true);
  if (result.status !== 0 && !/412|PreconditionFailed|precondition/i.test(`${result.stderr}\n${result.stdout}`)) {
    throw new Error(`immutable write failed for ${entry.key}: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  verifyRemote(entry);
}

aws([
  "s3api", "put-object",
  "--bucket", bucket,
  "--key", latestEntry.key,
  "--body", latestEntry.file,
  "--content-type", "application/json",
  "--cache-control", "public,max-age=0,must-revalidate",
  "--metadata", `sha256=${latestEntry.sha256},snapshot-id=${currentManifest.snapshot.id}`,
]);
verifyRemote(latestEntry);

const receipt = {
  schema: "kungfu.dogfood-history-publication-receipt/v1",
  publishedAt: new Date().toISOString(),
  workflow: {
    repository: process.env.GITHUB_REPOSITORY || "local/site-libkungfu-dev",
    runId: process.env.GITHUB_RUN_ID || "local",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || "local",
    runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  },
  bucket,
  immutable: immutableEntries.map(({ key, sha256 }) => ({ key, sha256, verified: true })),
  latest: { key: latestEntry.key, sha256: latestEntry.sha256, verified: true },
};
writeJson(receiptFile, receipt);
aws([
  "cloudfront", "create-invalidation",
  "--distribution-id", distribution,
  "--paths", "/dogfood-evidence.json", "/dogfood/*",
]);
console.log(`published ${immutableEntries.length} immutable snapshots and current latest; receipt: ${receiptFile}`);
