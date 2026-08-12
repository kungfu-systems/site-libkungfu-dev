#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] || "src/fixtures/agent-output-comparison.snapshot.json");
const bytes = fs.readFileSync(file);
const snapshot = JSON.parse(bytes);
const expectedWindows = {
  bootstrap: ["2026-06-16T00:00:00.000Z", "2026-07-16T00:00:00.000Z"],
  operating: ["2026-07-02T00:00:00.000Z", "2026-08-01T00:00:00.000Z"],
};

assert.equal(snapshot.schema, "libkungfu.agent-output-comparison/v1");
assert.ok(expectedWindows[snapshot.window.id]);
assert.deepEqual(
  [snapshot.window.startInclusive, snapshot.window.endExclusive],
  expectedWindows[snapshot.window.id],
);
assert.equal(Date.parse(snapshot.window.endExclusive) - Date.parse(snapshot.window.startInclusive), 30 * 86400000);

for (const subject of Object.values(snapshot.subjects)) {
  assert.equal(subject.records.length, subject.summary.mergedPullRequests);
  assert.equal(new Set(subject.records.map((record) => record.repository)).size, subject.summary.activeRepositories);
  assert.equal(new Set(subject.records.map((record) => record.author)).size, subject.summary.authorAccounts);
  assert.equal(new Set(subject.records.map((record) => record.mergedAt.slice(0, 10))).size, subject.summary.activeMergeDays);
  assert.equal(subject.records.reduce((sum, record) => sum + record.additions, 0), subject.summary.totalAdditions);
  assert.equal(subject.records.reduce((sum, record) => sum + record.deletions, 0), subject.summary.totalDeletions);
  assert.equal(subject.records.reduce((sum, record) => sum + record.changedFiles, 0), subject.summary.totalChangedFiles);
  assert.equal(subject.summary.repositories.reduce((sum, entry) => sum + entry.count, 0), subject.summary.mergedPullRequests);
  assert.equal(subject.summary.authors.reduce((sum, entry) => sum + entry.count, 0), subject.summary.mergedPullRequests);
  assert.equal(subject.summary.daily.reduce((sum, entry) => sum + entry.count, 0), subject.summary.mergedPullRequests);
  const attribution = subject.developmentAttribution;
  assert.ok(attribution.totalCommitsScanned >= attribution.explicitlyAttributedCommits);
  assert.equal(
    new Set(attribution.records.map((record) => `${record.repository}@${record.sha}`)).size,
    attribution.explicitlyAttributedCommits,
  );
  for (const agent of attribution.byAgent) {
    assert.equal(
      new Set(attribution.records.filter((record) => record.agent === agent.agent).map((record) => record.sha)).size,
      agent.commits,
    );
    assert.ok(agent.commits > 0);
  }
  for (const evidence of attribution.records) {
    assert.match(evidence.url, /^https:\/\/github\.com\//);
    assert.ok(["agent-field", "co-author-trailer", "commit-author", "committer"].includes(evidence.markerType));
    assert.match(evidence.marker, new RegExp(evidence.agent, "i"));
  }
}

assert.equal(snapshot.subjects.ax.summary.activeRepositories, 1);
assert.ok(snapshot.subjects.ax.summary.authorAccounts >= 4);
assert.ok(snapshot.subjects.kungfu.summary.activeRepositories >= 10);
assert.deepEqual(snapshot.subjects.ax.developmentAttribution.byAgent.map((entry) => entry.agent), ["Gemini"]);
assert.deepEqual(
  snapshot.subjects.kungfu.developmentAttribution.byAgent.map((entry) => entry.agent),
  ["Codex", "Claude", "Cursor", "Amp"],
);
assert.equal(snapshot.subjects.kungfu.developmentAttribution.explicitlyAttributedCommits, 135);
assert.equal(
  snapshot.comparison.pullRequestRatio,
  Number((snapshot.subjects.kungfu.summary.mergedPullRequests / snapshot.subjects.ax.summary.mergedPullRequests).toFixed(2)),
);
assert.equal(
  snapshot.comparison.kungfuPrimaryAuthor.mergedPullRequests,
  snapshot.subjects.kungfu.summary.authors.find((entry) => entry.name === "dongkeren").count,
);
assert.ok(snapshot.boundaries.some((entry) => entry.includes("not a feature")));
assert.ok(snapshot.boundaries.some((entry) => entry.includes("Google internal work")));
assert.ok(snapshot.boundaries.some((entry) => entry.includes("PR-splitting")));
assert.match(snapshot.collection.normalization, /email addresses/);
assert.doesNotMatch(bytes.toString("utf8"), /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

const axActivity = snapshot.subjects.ax.defaultBranchActivity;
assert.equal(axActivity.branch, "main");
assert.equal(axActivity.commits, axActivity.records.length);
assert.equal(axActivity.activeDays, axActivity.daily.length);
assert.ok(axActivity.rolling7.minimumCommits > 0);
assert.ok(axActivity.rolling7.minimumActiveDays > 0);

const leverage = snapshot.comparison.publicAuthorLeverage;
assert.equal(leverage.kungfuPrimary.account, "dongkeren");
assert.equal(leverage.axTopThree.accounts.length, 3);
assert.equal(
  leverage.kungfuPrimary.mergedPullRequests,
  snapshot.subjects.kungfu.records.filter((record) => record.author === "dongkeren").length,
);
assert.equal(
  leverage.axTopThree.combined.mergedPullRequests,
  snapshot.subjects.ax.records.filter((record) => leverage.axTopThree.accounts.includes(record.author)).length,
);
assert.equal(
  leverage.ratios.kungfuPrimaryToAxTopThreeCombined.grossChangedLines,
  Number((leverage.kungfuPrimary.grossChangedLines / leverage.axTopThree.combined.grossChangedLines).toFixed(2)),
);
if (snapshot.window.id === "bootstrap") {
  assert.equal(snapshot.bootstrapCommitPhase.repository, "kungfu-systems/kungfu");
  assert.equal(snapshot.bootstrapCommitPhase.branch, "dev/v4/v4.0");
  assert.equal(snapshot.bootstrapCommitPhase.commits, snapshot.bootstrapCommitPhase.records.length);
  assert.ok(snapshot.bootstrapCommitPhase.explicitClaudeAuthoredCommits > 0);
} else {
  assert.equal(snapshot.bootstrapCommitPhase, null);
}

const expected = fs.readFileSync(`${file}.sha256`, "utf8").trim().split(/\s+/)[0];
assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expected);
console.log(`agent output comparison ${snapshot.window.id} valid: ${snapshot.subjects.ax.summary.mergedPullRequests} AX PRs, ${snapshot.subjects.kungfu.summary.mergedPullRequests} Kungfu PRs`);
