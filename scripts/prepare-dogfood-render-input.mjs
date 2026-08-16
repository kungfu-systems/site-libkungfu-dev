#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const latestUrl = process.env.DOGFOOD_EVIDENCE_URL || "https://libkungfu.dev/dogfood-evidence.json";
const mode = process.env.DOGFOOD_EVIDENCE_MODE || "latest";
const required = process.env.DOGFOOD_EVIDENCE_REQUIRED === "true";
const outputDir = path.join(repoRoot, ".buildchain", "render-inputs");
const outputFile = path.join(outputDir, "dogfood-evidence.json");
const sourceFile = path.join(outputDir, "dogfood-evidence-source.json");
const featuredOutputFile = path.join(outputDir, "dogfood-featured-evidence.json");
const featuredSourceFile = path.join(outputDir, "dogfood-featured-evidence-source.json");
const fixtureFile = path.join(repoRoot, "src", "fixtures", "dogfood-evidence.json");
const siteManifestFile = path.join(repoRoot, "src", "fixtures", "site-manifest.json");

if (!["latest", "fixture"].includes(mode)) throw new Error(`unsupported DOGFOOD_EVIDENCE_MODE: ${mode}`);
if (new URL(latestUrl).protocol !== "https:") throw new Error("DOGFOOD_EVIDENCE_URL must use HTTPS");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
}

function validate(bytes, label) {
  const document = JSON.parse(bytes.toString("utf8"));
  if (!document.snapshotId || !Number.isFinite(Date.parse(document.observation?.observedAt || ""))) {
    throw new Error(`${label} is not a timestamped dogfood evidence snapshot`);
  }
  if (!/^[A-Za-z0-9._:+-]+$/.test(document.snapshotId)) {
    throw new Error(`${label} has an unsafe snapshot id`);
  }
  const temporary = path.join(outputDir, `dogfood-evidence-validate-${process.pid}.json`);
  atomicWrite(temporary, bytes);
  const result = spawnSync(process.execPath, ["scripts/check-dogfood-evidence.mjs", "--file", temporary], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  fs.rmSync(temporary, { force: true });
  if (result.status !== 0) {
    throw new Error(`${label} failed the repository evidence contract: ${(result.stderr || result.stdout).trim()}`);
  }
  return document;
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`fetch failed with ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function immutableSnapshotUrl(document) {
  const root = new URL("/", latestUrl);
  return new URL(`dogfood-evidence/snapshots/${document.snapshotId}.json`, root).href;
}

const fixtureBytes = fs.readFileSync(fixtureFile);
const fixture = validate(fixtureBytes, "retained fixture");
const featuredConfig = JSON.parse(fs.readFileSync(siteManifestFile, "utf8")).featuredDogfoodObservation;
if (!featuredConfig || featuredConfig.role !== "stable-reader-default") {
  throw new Error("site manifest is missing the stable featured dogfood observation");
}
if (
  fixture.snapshotId !== featuredConfig.snapshotId
  || fixture.observation.observedAt !== featuredConfig.observedAt
  || sha256(fixtureBytes) !== featuredConfig.sha256
  || new URL(featuredConfig.immutableUrl).protocol !== "https:"
) {
  throw new Error("retained fixture does not match the featured dogfood observation contract");
}
const featuredSource = {
  schemaVersion: 1,
  contract: "kungfu-site-dogfood-featured-render-input",
  selection: "featured-immutable",
  source: "src/fixtures/dogfood-evidence.json",
  immutableUrl: featuredConfig.immutableUrl,
  snapshotId: fixture.snapshotId,
  observedAt: fixture.observation.observedAt,
  sha256: sha256(fixtureBytes),
};
let selectedBytes = fixtureBytes;
let selected = fixture;
let source = {
  schemaVersion: 1,
  contract: "kungfu-site-dogfood-render-input",
  selection: "retained-fixture",
  source: "src/fixtures/dogfood-evidence.json",
  immutableUrl: null,
  snapshotId: fixture.snapshotId,
  observedAt: fixture.observation.observedAt,
  sha256: sha256(fixtureBytes),
};

if (mode !== "fixture") {
  try {
    const latestBytes = await fetchBytes(latestUrl);
    const latest = validate(latestBytes, "latest public evidence");
    if (Date.parse(latest.observation.observedAt) < Date.parse(fixture.observation.observedAt)) {
      throw new Error(`latest public evidence predates the retained fixture: ${latest.observation.observedAt}`);
    }
    const immutableUrl = immutableSnapshotUrl(latest);
    const immutableBytes = await fetchBytes(immutableUrl);
    const immutable = validate(immutableBytes, "immutable public evidence");
    if (immutable.snapshotId !== latest.snapshotId || sha256(immutableBytes) !== sha256(latestBytes)) {
      throw new Error("latest and immutable public evidence do not contain identical admitted bytes");
    }
    selectedBytes = immutableBytes;
    selected = immutable;
    source = {
      schemaVersion: 1,
      contract: "kungfu-site-dogfood-render-input",
      selection: "observed-immutable",
      source: latestUrl,
      immutableUrl,
      snapshotId: immutable.snapshotId,
      observedAt: immutable.observation.observedAt,
      sha256: sha256(immutableBytes),
    };
  } catch (error) {
    if (required) throw error;
    console.warn(`warning: ${error.message}; rendering the retained fixture`);
  }
}

atomicWrite(outputFile, selectedBytes);
atomicWrite(sourceFile, `${JSON.stringify(source, null, 2)}\n`);
atomicWrite(featuredOutputFile, fixtureBytes);
atomicWrite(featuredSourceFile, `${JSON.stringify(featuredSource, null, 2)}\n`);
console.log(`dogfood render input: ${source.selection} ${selected.snapshotId} sha256:${source.sha256}`);
console.log(`dogfood featured input: ${fixture.snapshotId} sha256:${featuredSource.sha256}`);
