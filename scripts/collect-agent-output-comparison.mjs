#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WINDOWS = {
  bootstrap: {
    id: "bootstrap",
    label: "v4 bootstrap window",
    startInclusive: "2026-06-16T00:00:00.000Z",
    endExclusive: "2026-07-16T00:00:00.000Z",
    githubQualifier: "merged:2026-06-16T00:00:00Z..2026-07-15T23:59:59Z",
    duration: "P30D",
  },
  operating: {
    id: "operating",
    label: "Buildchain operating window",
    startInclusive: "2026-07-02T00:00:00.000Z",
    endExclusive: "2026-08-01T00:00:00.000Z",
    githubQualifier: "merged:2026-07-02T00:00:00Z..2026-07-31T23:59:59Z",
    duration: "P30D",
  },
};
const args = process.argv.slice(2);
const optionValue = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};
const windowId = optionValue("--window") || "bootstrap";
const WINDOW = WINDOWS[windowId];
if (!WINDOW) throw new Error(`unknown window: ${windowId}`);
const optionValueIndexes = new Set(["--window", "--reuse-pr-snapshot"]
  .map((flag) => args.indexOf(flag))
  .filter((index) => index >= 0)
  .map((index) => index + 1));
const positional = args.filter((entry, index) => !entry.startsWith("--") && !optionValueIndexes.has(index));
const defaultOutput = windowId === "bootstrap"
  ? "src/fixtures/agent-output-comparison.snapshot.json"
  : `src/fixtures/agent-output-comparison-${windowId}.snapshot.json`;
const OUTPUT = path.resolve(positional[0] || defaultOutput);
const reuseValue = optionValue("--reuse-pr-snapshot");
const reuseFile = reuseValue ? path.resolve(reuseValue) : null;
const PR_FIELDS = [
  "number", "title", "body", "author", "createdAt", "mergedAt", "url",
  "additions", "deletions", "changedFiles",
].join(",");
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ATTRIBUTION_AGENTS = ["Codex", "Claude", "Cursor", "Amp", "Gemini"];

function sanitizePublicText(value) {
  return String(value || "").replace(EMAIL_PATTERN, "[email-redacted]");
}

function normalizeRecord(record) {
  return {
    ...record,
    title: sanitizePublicText(record.title),
    body: sanitizePublicText(record.body),
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function ghJson(args) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const output = run("gh", args);
      return output ? JSON.parse(output) : [];
    } catch (error) {
      lastError = error;
      if (attempt < 4) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 3000);
    }
  }
  throw lastError;
}

function listMergedPullRequestsForQualifier(repository, qualifier) {
  return ghJson([
    "pr", "list", "--repo", repository, "--state", "merged",
    "--search", qualifier, "--limit", "1000", "--json", PR_FIELDS,
  ]).map((pr) => normalizeRecord({
    repository,
    number: pr.number,
    url: pr.url,
    title: pr.title,
    body: pr.body || "",
    author: pr.author?.login || pr.author?.name || "unknown",
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
  }));
}

function listMergedPullRequests(repository) {
  const initial = listMergedPullRequestsForQualifier(repository, WINDOW.githubQualifier);
  if (initial.length < 1000) return initial;
  const records = [];
  const start = new Date(WINDOW.startInclusive);
  const end = new Date(WINDOW.endExclusive);
  for (let cursor = start; cursor < end; cursor = new Date(cursor.getTime() + 86400000)) {
    const day = cursor.toISOString().slice(0, 10);
    records.push(...listMergedPullRequestsForQualifier(repository, `merged:${day}T00:00:00Z..${day}T23:59:59Z`));
  }
  return [...new Map(records.map((record) => [`${record.repository}#${record.number}`, record])).values()];
}

function githubSearchCount(query) {
  return Number(run("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${query}`, "-f", "per_page=1", "--jq", ".total_count"]));
}

function classify(title) {
  const match = title.match(/^([a-z]+)(?:\([^)]*\))?[!:]/i);
  if (match) return match[1].toLowerCase();
  if (/^docs?\b/i.test(title)) return "docs";
  if (/^test\b/i.test(title)) return "test";
  return "unclassified";
}

function quantile(values, probability) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
}

function distribution(records, key) {
  const counts = new Map();
  for (const record of records) counts.set(key(record), (counts.get(key(record)) || 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function summarize(records) {
  const changes = records.map((record) => record.additions + record.deletions);
  const daily = distribution(records, (record) => record.mergedAt.slice(0, 10));
  const authors = distribution(records, (record) => record.author);
  const repositories = distribution(records, (record) => record.repository);
  const workTypes = distribution(records, (record) => classify(record.title));
  return {
    mergedPullRequests: records.length,
    activeRepositories: repositories.length,
    authorAccounts: authors.length,
    activeMergeDays: daily.length,
    totalAdditions: records.reduce((total, record) => total + record.additions, 0),
    totalDeletions: records.reduce((total, record) => total + record.deletions, 0),
    totalChangedFiles: records.reduce((total, record) => total + record.changedFiles, 0),
    changeSize: {
      median: quantile(changes, 0.5),
      p25: quantile(changes, 0.25),
      p75: quantile(changes, 0.75),
      p90: quantile(changes, 0.9),
    },
    authors,
    repositories,
    daily: daily.sort((left, right) => left.name.localeCompare(right.name)),
    workTypes,
  };
}

function compactSummary(records) {
  const summary = summarize(records);
  const sortedChanges = records.map((record) => record.additions + record.deletions).sort((left, right) => left - right);
  const trimCount = Math.floor(sortedChanges.length * 0.05);
  const central90 = sortedChanges.slice(trimCount, sortedChanges.length - trimCount);
  const central90GrossChangedLines = central90.reduce((total, value) => total + value, 0);
  const topTenGrossChangedLines = [...sortedChanges].sort((left, right) => right - left).slice(0, 10).reduce((total, value) => total + value, 0);
  const grossChangedLines = summary.totalAdditions + summary.totalDeletions;
  return {
    mergedPullRequests: summary.mergedPullRequests,
    activeMergeDays: summary.activeMergeDays,
    totalAdditions: summary.totalAdditions,
    totalDeletions: summary.totalDeletions,
    grossChangedLines,
    totalChangedFiles: summary.totalChangedFiles,
    medianChangedLinesPerPullRequest: summary.changeSize.median,
    central90: {
      pullRequests: central90.length,
      grossChangedLines: central90GrossChangedLines,
      meanChangedLinesPerPullRequest: Number((central90GrossChangedLines / central90.length).toFixed(2)),
    },
    topTenGrossChangedLinesShare: Number((topTenGrossChangedLines / grossChangedLines).toFixed(4)),
  };
}

function throughputSummary(summary) {
  return Object.fromEntries(["mergedPullRequests", "grossChangedLines", "totalChangedFiles"].map((key) => [key, summary[key]]));
}

function divideThroughput(summary, divisor) {
  return Object.fromEntries(Object.entries(throughputSummary(summary)).map(([key, value]) => [key, Number((value / divisor).toFixed(2))]));
}

function ratioThroughput(numerator, denominator) {
  return Object.fromEntries(Object.keys(throughputSummary(numerator)).map((key) => [key, Number((numerator[key] / denominator[key]).toFixed(2))]));
}

function publicAuthorLeverage(axRecords, kungfuRecords) {
  const rankedAxAuthors = distribution(axRecords, (record) => record.author);
  const topThreeNames = rankedAxAuthors.slice(0, 3).map((entry) => entry.name);
  const topAuthor = compactSummary(axRecords.filter((record) => record.author === topThreeNames[0]));
  const topThreeCombined = compactSummary(axRecords.filter((record) => topThreeNames.includes(record.author)));
  const topThreeAverage = divideThroughput(topThreeCombined, topThreeNames.length);
  const allAxCombined = compactSummary(axRecords);
  const kungfuPrimary = compactSummary(kungfuRecords.filter((record) => record.author === "dongkeren"));
  return {
    unit: "public output per accountable GitHub author identity over the fixed calendar window",
    kungfuPrimary: { account: "dongkeren", ...kungfuPrimary },
    axTopAuthor: { account: topThreeNames[0], ...topAuthor },
    axTopThree: { accounts: topThreeNames, combined: topThreeCombined, average: topThreeAverage },
    axAllAuthors: {
      accounts: rankedAxAuthors.map((entry) => entry.name),
      combined: allAxCombined,
      average: divideThroughput(allAxCombined, rankedAxAuthors.length),
    },
    ratios: {
      kungfuPrimaryToAxTopAuthor: ratioThroughput(kungfuPrimary, topAuthor),
      kungfuPrimaryToAxTopThreeCombined: ratioThroughput(kungfuPrimary, topThreeCombined),
      kungfuPrimaryToAxTopThreeAverage: ratioThroughput(kungfuPrimary, topThreeAverage),
      kungfuPrimaryToAxAllAuthorsCombined: ratioThroughput(kungfuPrimary, allAxCombined),
      kungfuPrimaryToAxAllAuthorsAverage: ratioThroughput(kungfuPrimary, divideThroughput(allAxCombined, rankedAxAuthors.length)),
    },
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function publicBranchCommits(repository, branch, window) {
  const endInclusive = new Date(new Date(window.endExclusive).getTime() - 1).toISOString();
  const pages = ghJson([
    "api", "--paginate", "--slurp",
    `repos/${repository}/commits?sha=${encodeURIComponent(branch)}&since=${window.startInclusive}&until=${endInclusive}&per_page=100`,
  ]);
  return pages.flat().map((entry) => ({
    sha: entry.sha,
    url: entry.html_url,
    committedAt: entry.commit.committer.date,
    author: entry.author?.login || entry.commit.author.name,
    authorName: entry.commit.author.name,
    committerName: entry.commit.committer.name,
    title: entry.commit.message.split("\n", 1)[0],
    message: sanitizePublicText(entry.commit.message),
  })).sort((left, right) => left.committedAt.localeCompare(right.committedAt));
}

function defaultBranchActivity(repository, branch, window = WINDOW) {
  const commits = publicBranchCommits(repository, branch, window);
  const byDay = distribution(commits, (commit) => commit.committedAt.slice(0, 10));
  const days = [];
  for (let cursor = new Date(window.startInclusive); cursor < new Date(window.endExclusive); cursor = new Date(cursor.getTime() + 86400000)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  const dayCounts = new Map(byDay.map((entry) => [entry.name, entry.count]));
  const rolling7 = days.slice(6).map((endDay, index) => {
    const windowDays = days.slice(index, index + 7);
    return {
      endDay,
      commits: windowDays.reduce((sum, day) => sum + (dayCounts.get(day) || 0), 0),
      activeDays: windowDays.filter((day) => dayCounts.has(day)).length,
    };
  });
  return {
    repository,
    branch,
    commits: commits.length,
    activeDays: byDay.length,
    authorAccounts: new Set(commits.map((commit) => commit.author)).size,
    rolling7: {
      minimumCommits: Math.min(...rolling7.map((entry) => entry.commits)),
      maximumCommits: Math.max(...rolling7.map((entry) => entry.commits)),
      minimumActiveDays: Math.min(...rolling7.map((entry) => entry.activeDays)),
      maximumActiveDays: Math.max(...rolling7.map((entry) => entry.activeDays)),
      observations: rolling7,
    },
    daily: byDay.sort((left, right) => left.name.localeCompare(right.name)),
    records: commits,
  };
}

function normalizedAgent(value) {
  return ATTRIBUTION_AGENTS.find((agent) => new RegExp(`\\b${agent}\\b`, "i").test(value || "")) || null;
}

function commitAgentAttributions(commit) {
  const candidates = [];
  for (const line of commit.message.split("\n")) {
    const agentField = line.match(/^\s*Agent\s*:\s*(.+?)\s*$/i);
    if (agentField) {
      const agent = normalizedAgent(agentField[1]);
      if (agent) candidates.push({ agent, markerType: "agent-field", marker: `Agent: ${agentField[1].trim()}` });
    }
    const coAuthor = line.match(/^\s*Co-authored-by\s*:\s*([^<]+)(?:<[^>]+>)?\s*$/i);
    if (coAuthor) {
      const agent = normalizedAgent(coAuthor[1]);
      if (agent) candidates.push({ agent, markerType: "co-author-trailer", marker: `Co-authored-by: ${coAuthor[1].trim()}` });
    }
  }
  for (const [markerType, label, value] of [
    ["commit-author", "Commit author", commit.authorName],
    ["committer", "Committer", commit.committerName],
  ]) {
    const agent = normalizedAgent(value);
    if (agent) candidates.push({ agent, markerType, marker: `${label}: ${value}` });
  }
  const markerPriority = ["agent-field", "co-author-trailer", "commit-author", "committer"];
  return ATTRIBUTION_AGENTS.flatMap((agent) => {
    const matches = candidates.filter((candidate) => candidate.agent === agent);
    if (!matches.length) return [];
    matches.sort((left, right) => markerPriority.indexOf(left.markerType) - markerPriority.indexOf(right.markerType));
    return [{
      agent,
      markerType: matches[0].markerType,
      marker: matches[0].marker,
    }];
  });
}

function agentAttributionCensus(repository, branch, window, windowRelation) {
  const commits = publicBranchCommits(repository, branch, window);
  const records = commits.flatMap((commit) => commitAgentAttributions(commit).map((attribution) => ({
    ...attribution,
    repository,
    branch,
    sha: commit.sha,
    url: commit.url,
    title: commit.title,
    observedAt: commit.committedAt,
  })));
  const attributedCommitKeys = new Set(records.map((record) => `${record.repository}@${record.sha}`));
  const byAgent = ATTRIBUTION_AGENTS.map((agent) => {
    const agentRecords = records.filter((record) => record.agent === agent);
    return {
      agent,
      commits: new Set(agentRecords.map((record) => record.sha)).size,
      markerTypes: distribution(agentRecords, (record) => record.markerType),
    };
  }).filter((entry) => entry.commits > 0);
  return {
    repository,
    branch,
    window,
    windowRelation,
    totalCommitsScanned: commits.length,
    explicitlyAttributedCommits: attributedCommitKeys.size,
    byAgent,
    records,
  };
}

const reused = reuseFile ? JSON.parse(fs.readFileSync(reuseFile, "utf8")) : null;
const publicKungfuRepositories = reused ? [] : ghJson([
  "api", "--paginate", "--slurp", "orgs/kungfu-systems/repos?type=public&per_page=100",
]).flat().map((repository) => repository.full_name);

const axRecords = (reused?.subjects?.ax?.records || listMergedPullRequests("google/ax")).map(normalizeRecord);
const kungfuRecords = (reused?.subjects?.kungfu?.records || publicKungfuRepositories.flatMap(listMergedPullRequests)).map(normalizeRecord);
for (const records of [axRecords, kungfuRecords]) {
  records.sort((left, right) => left.mergedAt.localeCompare(right.mergedAt) || left.repository.localeCompare(right.repository) || left.number - right.number);
}

const ax = summarize(axRecords);
const kungfu = summarize(kungfuRecords);
const axActivity = defaultBranchActivity("google/ax", "main");
const axDevelopmentAttribution = agentAttributionCensus(
  "google/ax",
  "main",
  {
    id: "ax-history-before-cutoff",
    label: "AX public default-branch history before the comparison cutoff",
    startInclusive: "2026-01-01T00:00:00.000Z",
    endExclusive: "2026-08-01T00:00:00.000Z",
    duration: "P212D",
  },
  "repository-history-outside-measured-windows",
);
const kungfuDevelopmentAttribution = agentAttributionCensus(
  "kungfu-systems/kungfu",
  "dev/v4/v4.0",
  {
    id: "kungfu-v4-through-operating-cutoff",
    label: "Kungfu v4 public branch through the operating cutoff",
    startInclusive: "2026-06-16T00:00:00.000Z",
    endExclusive: "2026-08-01T00:00:00.000Z",
    duration: "P46D",
  },
  "overlaps-bootstrap-and-operating-observations",
);
const independentCounts = {
  ax: githubSearchCount(`repo:google/ax is:pr is:merged ${WINDOW.githubQualifier}`),
  kungfu: githubSearchCount(`org:kungfu-systems is:pr is:merged ${WINDOW.githubQualifier} is:public`),
};
if (ax.mergedPullRequests !== independentCounts.ax || kungfu.mergedPullRequests !== independentCounts.kungfu) {
  throw new Error(`record coverage mismatch: AX ${ax.mergedPullRequests}/${independentCounts.ax}, Kungfu ${kungfu.mergedPullRequests}/${independentCounts.kungfu}`);
}
const comparison = {
  pullRequestRatio: Number((kungfu.mergedPullRequests / ax.mergedPullRequests).toFixed(2)),
  changedLinesRatio: Number(((kungfu.totalAdditions + kungfu.totalDeletions) / (ax.totalAdditions + ax.totalDeletions)).toFixed(2)),
  changedFilesRatio: Number((kungfu.totalChangedFiles / ax.totalChangedFiles).toFixed(2)),
  kungfuPrimaryAuthor: {
    account: "dongkeren",
    mergedPullRequests: kungfu.authors.find((entry) => entry.name === "dongkeren")?.count || 0,
  },
};
comparison.kungfuPrimaryAuthor.share = Number((comparison.kungfuPrimaryAuthor.mergedPullRequests / kungfu.mergedPullRequests).toFixed(4));
comparison.publicAuthorLeverage = publicAuthorLeverage(axRecords, kungfuRecords);

const bootstrapCommitPhase = windowId === "bootstrap"
  ? defaultBranchActivity("kungfu-systems/kungfu", "dev/v4/v4.0", {
      startInclusive: "2026-06-16T00:00:00.000Z",
      endExclusive: "2026-06-29T00:00:00.000Z",
    })
  : null;
if (bootstrapCommitPhase) {
  bootstrapCommitPhase.explicitClaudeAuthoredCommits = bootstrapCommitPhase.records.filter((record) => /Claude/i.test(record.author)).length;
}

const collectedAt = new Date().toISOString();
const snapshot = {
  schema: "libkungfu.agent-output-comparison/v1",
  status: "observed-public-github-data",
  collectedAt,
  window: WINDOW,
  subjects: {
    ax: {
      label: "Google AX",
      scope: "one public repository",
      query: `repo:google/ax is:pr is:merged ${WINDOW.githubQualifier}`,
      organizationForm: "multiple public contributor accounts working in one repository",
      summary: ax,
      defaultBranchActivity: axActivity,
      records: axRecords,
      developmentAttribution: axDevelopmentAttribution,
    },
    kungfu: {
      label: "Kungfu Systems",
      scope: "all public repositories in kungfu-systems with merged work in the window",
      query: `org:kungfu-systems is:pr is:merged ${WINDOW.githubQualifier} is:public`,
      organizationForm: "one human product owner directing Agent-mediated work across a public multi-repository system",
      summary: kungfu,
      records: kungfuRecords,
      developmentAttribution: kungfuDevelopmentAttribution,
    },
  },
  comparison,
  bootstrapCommitPhase,
  collection: {
    repository: "https://github.com/kungfu-systems/site-libkungfu-dev",
    script: "scripts/collect-agent-output-comparison.mjs",
    command: `node scripts/collect-agent-output-comparison.mjs --window ${windowId}`,
    api: "GitHub CLI over public GitHub GraphQL and REST APIs",
    normalization: "Public PR fields are retained; email addresses in titles and bodies are replaced with [email-redacted].",
    independentSearchCounts: independentCounts,
    recordDigest: {
      ax: digest(axRecords),
      kungfu: digest(kungfuRecords),
    },
  },
  boundaries: [
    "A merged pull request is a public work item, not a feature, quality, maturity, or value unit.",
    "The comparison observes public GitHub delivery only. Google internal work and all other private work are outside the dataset.",
    "The scopes intentionally reflect the two real organization forms: AX is one product repository; Kungfu is a multi-repository product and release system.",
    "Author accounts are public GitHub identities. They do not by themselves identify whether a human or an Agent produced the underlying change.",
    "Per-author comparisons observe public responsibility identities, not verified team headcount, labor hours, employment roles, or individual authorship of every line.",
    "Kungfu pull requests operate as settlement objects while AX pull requests follow a conventional contribution workflow; their counts are visible responsibility throughput, not interchangeable feature units.",
    "Additions, deletions, and changed-file totals are gross PR statistics and may include generated files, vendored material, formatting, or repeated edits.",
    "Explicit attribution markers establish some Agent participation in both repositories. AX's Gemini co-author history predates the measured windows; Kungfu's census spans the v4 bootstrap through the operating cutoff.",
    "Attribution examples do not prove AI authorship of every change or isolate Agent use as the sole cause of the output difference.",
    "Different review, merge, and PR-splitting disciplines remain a confounder; the raw records are published so readers can test alternative measures.",
  ],
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
fs.writeFileSync(`${OUTPUT}.sha256`, `${crypto.createHash("sha256").update(fs.readFileSync(OUTPUT)).digest("hex")}  ${path.basename(OUTPUT)}\n`);
console.log(JSON.stringify({ output: OUTPUT, ax, kungfu, comparison }, null, 2));
