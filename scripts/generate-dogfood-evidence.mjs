#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  arg,
  createEvidence,
  historyEntry,
  mergeHistoryEntries,
  projectCutCounts,
  readJson,
  run,
  serializeEvidence,
  sha256,
  sha256File,
  writeJson,
} from "./lib/dogfood-evidence.mjs";

function githubCount(query) {
  return Number(run("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${query}`, "-f", "per_page=1", "--jq", ".total_count"]));
}

function liveGithubCounts(windowQualifier) {
  const base = `org:kungfu-systems is:pr is:merged ${windowQualifier} is:public`;
  const names = run("gh", ["api", "orgs/kungfu-systems/repos?type=public&per_page=100", "--paginate", "--jq", ".[].name"])
    .split("\n").map((entry) => entry.trim()).filter(Boolean);
  const repositories = names.map((name) => ({
    name,
    mergedPublicPullRequests: githubCount(`repo:kungfu-systems/${name} is:pr is:merged ${windowQualifier} is:public`),
  })).filter((entry) => entry.mergedPublicPullRequests > 0)
    .sort((left, right) => right.mergedPublicPullRequests - left.mergedPublicPullRequests || left.name.localeCompare(right.name));
  return {
    mergedPublicPullRequests: githubCount(base),
    authorSearchMatches: githubCount(`${base} author:dongkeren`),
    reviewSearchMatches: githubCount(`${base} reviewed-by:kungfu-origin`),
    projectCutTitleMatches: githubCount(`${base} project-cut in:title`),
    repositories,
  };
}

async function loadPrevious(file, url) {
  if (file) {
    const bytes = fs.readFileSync(path.resolve(file));
    return { evidence: JSON.parse(bytes), digest: sha256(bytes) };
  }
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`previous latest fetch failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { evidence: JSON.parse(bytes), digest: sha256(bytes) };
}

const repoRoot = process.cwd();
const outputDir = path.resolve(arg("output-dir", ".buildchain/observed-evidence"));
const kungfuDir = path.resolve(arg("kungfu-dir", ".observed-evidence/source"));
const kungfuRef = arg("kungfu-ref", "HEAD");
const observedAt = new Date(arg("observed-at", new Date().toISOString())).toISOString();
const generatedAt = new Date(arg("generated-at", new Date().toISOString())).toISOString();
const end = new Date(observedAt);
const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
const githubQualifier = `merged:${start.toISOString()}..${end.toISOString()}`;
const offline = arg("github-counts-json");
const github = offline ? readJson(path.resolve(offline)) : liveGithubCounts(githubQualifier);
const cuts = projectCutCounts(kungfuDir, kungfuRef);
const fixture = readJson(path.join(repoRoot, "src", "fixtures", "dogfood-evidence.json"));
const historySeedFile = arg("history-seed-file");
const historySeed = historySeedFile ? readJson(path.resolve(historySeedFile)) : { entries: [] };

const previous = await loadPrevious(
  arg("previous-latest-file"),
  arg("previous-latest-url", "https://libkungfu.dev/dogfood-evidence.json"),
);
const priorEvidence = previous.evidence;
if (!priorEvidence.snapshotId || !priorEvidence.observation?.observedAt) throw new Error("previous latest is not a dogfood evidence snapshot");
if (Date.parse(priorEvidence.observation.observedAt) >= Date.parse(observedAt)) {
  throw new Error(`previous latest must precede the new observation: ${priorEvidence.snapshotId}`);
}
const priorEntry = historyEntry(priorEvidence, previous.digest, {
  generationKind: priorEvidence.provenance?.generationKind || "legacy",
  offCadence: priorEvidence.provenance?.generationKind ? false : true,
});
const seededPrior = historySeed.entries?.find((entry) => entry.snapshotId === priorEvidence.snapshotId);
if (seededPrior && (seededPrior.sha256 !== previous.digest || seededPrior.observedAt !== priorEvidence.observation.observedAt)) {
  throw new Error(`history seed does not match previous latest: ${priorEvidence.snapshotId}`);
}
const priorEntries = mergeHistoryEntries(
  historySeed.entries || [],
  priorEvidence.history?.entries || [],
  seededPrior ? [] : [priorEntry],
);
const generatorCommit = arg("generator-commit", process.env.GITHUB_SHA || run("git", ["rev-parse", "HEAD"], repoRoot));
const workflowRepository = process.env.GITHUB_REPOSITORY || "local/site-libkungfu-dev";
const workflowRunId = process.env.GITHUB_RUN_ID || "local";
const workflow = {
  repository: workflowRepository,
  runId: workflowRunId,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || "local",
  runUrl: workflowRunId === "local" ? null : `https://github.com/${workflowRepository}/actions/runs/${workflowRunId}`,
};
const event = process.env.GITHUB_EVENT_NAME || "manual";
const evidence = createEvidence({
  fixture,
  observedAt,
  github,
  cuts,
  generatedAt,
  generationKind: arg("generation-kind", event === "schedule" ? "scheduled" : "manual"),
  backfill: false,
  queryCapturedAt: generatedAt,
  generatorCommit,
  generatorCommand: "node scripts/generate-dogfood-evidence.mjs",
  sourceRef: arg("kungfu-source-ref", "dev/v4/v4.0"),
  workflow,
  priorEntries,
});

const snapshotDir = path.join(outputDir, "snapshots");
fs.mkdirSync(snapshotDir, { recursive: true });
const snapshotFile = path.join(snapshotDir, `${evidence.snapshotId}.json`);
const latestFile = path.join(outputDir, "latest.json");
const body = serializeEvidence(evidence);
fs.writeFileSync(snapshotFile, body);
fs.writeFileSync(latestFile, body);
writeJson(path.join(outputDir, "manifest.json"), {
  schemaVersion: 1,
  contract: "kungfu-buildchain-observed-evidence-bundle",
  snapshot: { id: evidence.snapshotId, observedAt },
  publication: {
    immutable: {
      source: `snapshots/${evidence.snapshotId}.json`,
      key: `production/dogfood-evidence/snapshots/${evidence.snapshotId}.json`,
      sha256: sha256File(snapshotFile),
      contentType: "application/json",
    },
    latest: {
      source: "latest.json",
      key: "production/dogfood-evidence.json",
      sha256: sha256File(latestFile),
      contentType: "application/json",
    },
    invalidationPaths: ["/dogfood-evidence.json", "/dogfood/*"],
  },
});
console.log(`generated ${evidence.snapshotId}: ${github.mergedPublicPullRequests} PRs, ${cuts.retained} Project Cuts, ${priorEntries.length} prior observations`);
