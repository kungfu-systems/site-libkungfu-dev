#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const schemaV1 = "kungfu.public-dogfood-evidence/v1";
const schemaV2 = "kungfu.public-dogfood-evidence/v2";

const repoRoot = process.cwd();
const fileIndex = process.argv.indexOf("--file");
const fixturePath = fileIndex === -1
  ? path.join(repoRoot, "src", "fixtures", "dogfood-evidence.json")
  : path.resolve(process.argv[fileIndex + 1]);
const evidence = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const verifyLive = process.argv.includes("--verify-live");

assert.ok([schemaV1, schemaV2].includes(evidence.schema), `unsupported dogfood evidence schema: ${evidence.schema}`);
assert.equal(evidence.status, "observed");
assert.equal(
  Date.parse(evidence.observation.window.endInclusive) - Date.parse(evidence.observation.window.startInclusive),
  30 * 24 * 60 * 60 * 1000,
  "dogfood window must span exactly 30 days",
);

if (evidence.schema === schemaV2) {
  assert.match(evidence.provenance.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof evidence.provenance.backfill, "boolean");
  assert.ok(["backfill", "scheduled", "manual"].includes(evidence.provenance.generationKind));
  assert.match(evidence.provenance.generator.repository, /^https:\/\//);
  assert.ok(evidence.provenance.generator.gitCommit, "generator commit is required");
  assert.equal(evidence.provenance.source.gitCommit, evidence.sources.projectCuts.gitCommit);
  assert.ok(evidence.provenance.workflow.repository, "workflow repository is required");
  assert.ok(evidence.provenance.workflow.runId, "workflow run id is required");
  if (evidence.provenance.backfill) {
    assert.equal(evidence.provenance.generationKind, "backfill");
    assert.match(evidence.provenance.backfilledAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(
      Date.parse(evidence.provenance.generatedAt) > Date.parse(evidence.observation.observedAt),
      "a backfill must be generated after its historical observation boundary",
    );
    assert.ok(evidence.provenance.limitations.length > 0, "a backfill must state its reconstruction limitation");
  }

  assert.match(evidence.history.semantics, /overlapping P30D windows, not new work in a week/);
  const ids = new Set();
  let previous = null;
  let previousObservedAt = -Infinity;
  for (const entry of evidence.history.entries) {
    assert.ok(!ids.has(entry.snapshotId), `duplicate history entry: ${entry.snapshotId}`);
    ids.add(entry.snapshotId);
    assert.equal(entry.previousSnapshotId, previous, `broken history link at ${entry.snapshotId}`);
    assert.ok(Date.parse(entry.observedAt) > previousObservedAt, `history is not strictly ordered at ${entry.snapshotId}`);
    assert.ok(Date.parse(entry.observedAt) < Date.parse(evidence.observation.observedAt), `history entry is not prior: ${entry.snapshotId}`);
    assert.match(entry.url, new RegExp(`/dogfood-evidence/snapshots/${entry.snapshotId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.json$`));
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    previous = entry.snapshotId;
    previousObservedAt = Date.parse(entry.observedAt);
  }
  assert.equal(evidence.history.previousSnapshotId, previous);
}
assert.equal(
  evidence.repositories.reduce((total, repository) => total + repository.mergedPublicPullRequests, 0),
  evidence.metrics.mergedPublicPullRequests.value,
  "repository counts must sum to the organization total",
);
assert.equal(
  evidence.repositories.filter((repository) => repository.mergedPublicPullRequests > 0).length,
  evidence.metrics.repositoriesWithMergedPullRequests.value,
  "repository metric must match the positive repository rows",
);
assert.equal(
  evidence.metrics.projectCutsWithEpisodeDelta.value
    + evidence.metrics.projectCutsWithExplicitEmptyEpisodeDelta.value,
  evidence.metrics.retainedPublicProjectCuts.value,
  "Project Cut Episode classifications must cover every retained Cut",
);
assert.equal(
  evidence.metrics.validProjectCutReceipts.value,
  evidence.metrics.retainedPublicProjectCuts.value,
  "the snapshot requires one valid receipt for every retained Cut",
);

for (const boundary of [
  "pull-request-not-feature",
  "author-account-not-agent-actor",
  "review-search-not-approval",
  "snapshot-not-live-analytics",
  "public-only",
]) {
  assert.ok(evidence.boundaries.some((entry) => entry.id === boundary), `missing boundary: ${boundary}`);
}

const threeActorCase = evidence.cases.find((entry) => entry.id === "three-agent-project-cut-continuation");
assert.equal(threeActorCase?.status, "qualified");
assert.equal(threeActorCase?.humanRelayCount, 0);
assert.equal(threeActorCase?.facts?.faultRejections?.length, 6);
assert.ok(threeActorCase?.roots?.actorAProjectCut?.startsWith("sha256:"));
assert.ok(threeActorCase?.roots?.actorBReview?.startsWith("sha256:"));
assert.ok(threeActorCase?.roots?.actorCSuccessorProjectCut?.startsWith("sha256:"));

const hubCase = evidence.cases.find((entry) => entry.id === "hub-architecture-cross-repository-delivery");
assert.equal(hubCase?.status, "production");
assert.equal(hubCase?.facts?.episodeDelta, "explicitly-empty");
assert.equal(hubCase?.facts?.reviewState, "APPROVED");
assert.equal(hubCase?.facts?.productionUrls?.length, 2);

for (const url of [
  evidence.sources.github.repository,
  evidence.sources.projectCuts.repository,
  ...evidence.cases.flatMap((entry) => entry.links.map((link) => link.url)),
]) {
  assert.match(url, /^https:\/\//, `public evidence URL must be HTTPS: ${url}`);
}

function githubSearchCount(query) {
  const result = spawnSync(
    "gh",
    ["api", "-X", "GET", "search/issues", "-f", `q=${query}`, "-f", "per_page=1", "--jq", ".total_count"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "GITHUB_TOKEN" && key !== "GH_TOKEN")),
    },
  );
  if (result.status !== 0) {
    throw new Error(`GitHub query failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return Number(result.stdout.trim());
}

if (verifyLive) {
  for (const metricName of [
    "mergedPublicPullRequests",
    "authorSearchMatches",
    "reviewSearchMatches",
    "projectCutTitleMatches",
  ]) {
    const metric = evidence.metrics[metricName];
    assert.equal(githubSearchCount(metric.query), metric.value, `live GitHub count drifted: ${metricName}`);
  }
  for (const repository of evidence.repositories) {
    const query = `repo:kungfu-systems/${repository.name} is:pr is:merged ${evidence.observation.window.githubQualifier} is:public`;
    assert.equal(
      githubSearchCount(query),
      repository.mergedPublicPullRequests,
      `live repository count drifted: ${repository.name}`,
    );
  }
}

console.log(`dogfood evidence valid: ${evidence.snapshotId}${verifyLive ? " (live GitHub counts matched)" : ""}`);
