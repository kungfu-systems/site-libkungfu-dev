import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const EVIDENCE_SCHEMA_V1 = "kungfu.public-dogfood-evidence/v1";
export const EVIDENCE_SCHEMA_V2 = "kungfu.public-dogfood-evidence/v2";
export const HISTORY_SEMANTICS = "Entries are immutable prior observation points ordered oldest to newest. Deltas are changes between observation points over overlapping P30D windows, not new work in a week.";

export function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

export function run(command, args, cwd = process.cwd(), options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout.trim();
}

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function gitJson(kungfuDir, commit, file) {
  return JSON.parse(run("git", ["show", `${commit}:${file}`], kungfuDir));
}

export function projectCutCounts(kungfuDir, ref = "HEAD") {
  const commit = run("git", ["rev-parse", `${ref}^{commit}`], kungfuDir);
  const names = run(
    "git",
    ["ls-tree", "-r", "--name-only", commit, "--", ".kungfu/project-cuts/sha256"],
    kungfuDir,
  ).split("\n").map((entry) => entry.trim()).filter(Boolean);
  const nameSet = new Set(names);
  const manifests = names.filter((entry) => entry.endsWith("/manifest.json"));
  let valid = 0;
  let nonEmpty = 0;
  let empty = 0;
  for (const manifestFile of manifests) {
    const receiptFile = manifestFile.replace(/manifest\.json$/, "receipt.json");
    if (!nameSet.has(receiptFile)) throw new Error(`missing Project Cut receipt at ${commit}: ${receiptFile}`);
    const manifest = gitJson(kungfuDir, commit, manifestFile);
    const receipt = gitJson(kungfuDir, commit, receiptFile);
    const expectedCutRoot = `sha256:${path.basename(path.dirname(manifestFile))}`;
    if (
      manifest.schema !== "project.cut/v1"
      || receipt.schema !== "project.cut.receipt/v1"
      || receipt.verdict !== "valid"
      || receipt.cutRoot !== expectedCutRoot
    ) {
      throw new Error(`invalid retained Project Cut pair at ${commit}: ${manifestFile}`);
    }
    valid += 1;
    if (manifest.episodeDelta?.empty === true) empty += 1;
    else nonEmpty += 1;
  }
  return { commit, retained: manifests.length, valid, nonEmpty, empty };
}

export function snapshotIdFor(observedAt) {
  return `kungfu-systems-${new Date(observedAt).toISOString()}`;
}

export function snapshotUrl(snapshotId) {
  return `https://libkungfu.dev/dogfood-evidence/snapshots/${snapshotId}.json`;
}

export function historyEntry(evidence, digest, overrides = {}) {
  return {
    snapshotId: evidence.snapshotId,
    observedAt: evidence.observation.observedAt,
    generatedAt: evidence.provenance?.generatedAt || evidence.observation.observedAt,
    generationKind: evidence.provenance?.generationKind || "legacy",
    backfill: evidence.provenance?.backfill === true,
    offCadence: false,
    url: snapshotUrl(evidence.snapshotId),
    sha256: digest,
    previousSnapshotId: evidence.history?.previousSnapshotId || null,
    ...overrides,
  };
}

export function mergeHistoryEntries(...collections) {
  const byId = new Map();
  for (const entry of collections.flat()) {
    if (!entry) continue;
    const existing = byId.get(entry.snapshotId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
      throw new Error(`conflicting history metadata for ${entry.snapshotId}`);
    }
    byId.set(entry.snapshotId, entry);
  }
  return [...byId.values()].sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
}

export function createEvidence({
  fixture,
  observedAt,
  github,
  cuts,
  generatedAt,
  generationKind,
  backfill,
  queryCapturedAt,
  generatorCommit,
  generatorCommand,
  sourceRef,
  workflow,
  limitations = [],
  priorEntries = [],
}) {
  const evidence = structuredClone(fixture);
  const normalizedObservedAt = new Date(observedAt).toISOString();
  const normalizedGeneratedAt = new Date(generatedAt).toISOString();
  const end = new Date(normalizedObservedAt);
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const githubQualifier = `merged:${start.toISOString()}..${end.toISOString()}`;
  const baseQuery = `org:kungfu-systems is:pr is:merged ${githubQualifier} is:public`;
  const entries = mergeHistoryEntries(priorEntries);

  evidence.schema = EVIDENCE_SCHEMA_V2;
  evidence.snapshotId = snapshotIdFor(normalizedObservedAt);
  evidence.observation = {
    observedAt: normalizedObservedAt,
    window: {
      kind: "rolling-duration",
      duration: "P30D",
      startInclusive: start.toISOString(),
      endInclusive: end.toISOString(),
      githubQualifier,
    },
  };
  evidence.sources.github.baseQuery = baseQuery;
  evidence.sources.projectCuts.gitCommit = cuts.commit;
  evidence.metrics.mergedPublicPullRequests.value = github.mergedPublicPullRequests;
  evidence.metrics.mergedPublicPullRequests.query = baseQuery;
  evidence.metrics.repositoriesWithMergedPullRequests.value = github.repositories.length;
  for (const [name, suffix] of [
    ["authorSearchMatches", "author:dongkeren"],
    ["reviewSearchMatches", "reviewed-by:kungfu-origin"],
    ["projectCutTitleMatches", "project-cut in:title"],
  ]) {
    evidence.metrics[name].value = github[name];
    evidence.metrics[name].query = `${baseQuery} ${suffix}`;
  }
  for (const [name, value] of [
    ["retainedPublicProjectCuts", cuts.retained],
    ["validProjectCutReceipts", cuts.valid],
    ["projectCutsWithEpisodeDelta", cuts.nonEmpty],
    ["projectCutsWithExplicitEmptyEpisodeDelta", cuts.empty],
  ]) {
    evidence.metrics[name].value = value;
    evidence.metrics[name].atGitCommit = cuts.commit;
  }
  evidence.repositories = github.repositories;
  evidence.history = {
    semantics: HISTORY_SEMANTICS,
    previousSnapshotId: entries.at(-1)?.snapshotId || null,
    entries,
  };
  evidence.provenance = {
    generatedAt: normalizedGeneratedAt,
    ...(backfill ? { backfilledAt: normalizedGeneratedAt } : {}),
    backfill,
    generationKind,
    queryCapturedAt: new Date(queryCapturedAt || normalizedGeneratedAt).toISOString(),
    generator: {
      repository: "https://github.com/kungfu-systems/site-libkungfu-dev",
      gitCommit: generatorCommit,
      command: generatorCommand,
    },
    source: {
      repository: evidence.sources.projectCuts.repository,
      ref: sourceRef,
      gitCommit: cuts.commit,
    },
    workflow,
    limitations,
  };
  evidence.reproduction.commands = [
    `gh api -X GET search/issues -f q='${baseQuery}' -f per_page=1 --jq '.total_count'`,
    `git -C <kungfu-dir> rev-parse '${cuts.commit}^{commit}'`,
    "node scripts/check-dogfood-evidence.mjs --file <snapshot.json>",
  ];
  return evidence;
}

export function serializeEvidence(evidence) {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
