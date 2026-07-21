#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

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

function walk(root, name) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target, name) : entry.name === name ? [target] : [];
  });
}

function projectCutCounts(kungfuDir) {
  const commit = run("git", ["rev-parse", "HEAD"], kungfuDir);
  const manifests = walk(path.join(kungfuDir, ".kungfu", "project-cuts", "sha256"), "manifest.json");
  let valid = 0;
  let nonEmpty = 0;
  let empty = 0;
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const receiptPath = path.join(path.dirname(manifestPath), "receipt.json");
    if (!fs.existsSync(receiptPath)) throw new Error(`missing Project Cut receipt: ${receiptPath}`);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    const expectedCutRoot = `sha256:${path.basename(path.dirname(manifestPath))}`;
    if (manifest.schema !== "project.cut/v1" || receipt.schema !== "project.cut.receipt/v1" || receipt.verdict !== "valid" || receipt.cutRoot !== expectedCutRoot) {
      throw new Error(`invalid retained Project Cut pair: ${manifestPath}`);
    }
    valid += 1;
    if (manifest.episodeDelta?.empty === true) empty += 1;
    else nonEmpty += 1;
  }
  return { commit, retained: manifests.length, valid, nonEmpty, empty };
}

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const repoRoot = process.cwd();
const outputDir = path.resolve(arg("output-dir", ".buildchain/observed-evidence"));
const kungfuDir = path.resolve(arg("kungfu-dir", ".observed-evidence/source"));
const observedAt = new Date(arg("observed-at", new Date().toISOString())).toISOString();
const end = new Date(observedAt);
const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
const githubQualifier = `merged:${start.toISOString()}..${end.toISOString()}`;
const offline = arg("github-counts-json");
const github = offline ? JSON.parse(fs.readFileSync(path.resolve(offline), "utf8")) : liveGithubCounts(githubQualifier);
const cuts = projectCutCounts(kungfuDir);
const evidence = JSON.parse(fs.readFileSync(path.join(repoRoot, "src", "fixtures", "dogfood-evidence.json"), "utf8"));

evidence.snapshotId = `kungfu-systems-${observedAt}`;
evidence.observation = { observedAt, window: { kind: "rolling-duration", duration: "P30D", startInclusive: start.toISOString(), endInclusive: end.toISOString(), githubQualifier } };
const baseQuery = `org:kungfu-systems is:pr is:merged ${githubQualifier} is:public`;
evidence.sources.github.baseQuery = baseQuery;
evidence.sources.projectCuts.gitCommit = cuts.commit;
evidence.metrics.mergedPublicPullRequests.value = github.mergedPublicPullRequests;
evidence.metrics.mergedPublicPullRequests.query = baseQuery;
evidence.metrics.repositoriesWithMergedPullRequests.value = github.repositories.length;
for (const [name, suffix] of [["authorSearchMatches", "author:dongkeren"], ["reviewSearchMatches", "reviewed-by:kungfu-origin"], ["projectCutTitleMatches", "project-cut in:title"]]) {
  evidence.metrics[name].value = github[name];
  evidence.metrics[name].query = `${baseQuery} ${suffix}`;
}
for (const [name, value] of [["retainedPublicProjectCuts", cuts.retained], ["validProjectCutReceipts", cuts.valid], ["projectCutsWithEpisodeDelta", cuts.nonEmpty], ["projectCutsWithExplicitEmptyEpisodeDelta", cuts.empty]]) {
  evidence.metrics[name].value = value;
  evidence.metrics[name].atGitCommit = cuts.commit;
}
evidence.repositories = github.repositories;
evidence.reproduction.commands = [
  `gh api -X GET search/issues -f q='${baseQuery}' -f per_page=1 --jq '.total_count'`,
  "node scripts/check-dogfood-evidence.mjs --file <snapshot.json> --verify-live",
];

const snapshotDir = path.join(outputDir, "snapshots");
fs.mkdirSync(snapshotDir, { recursive: true });
const snapshotFile = path.join(snapshotDir, `${evidence.snapshotId}.json`);
const latestFile = path.join(outputDir, "latest.json");
const body = `${JSON.stringify(evidence, null, 2)}\n`;
fs.writeFileSync(snapshotFile, body);
fs.writeFileSync(latestFile, body);
const manifest = {
  schemaVersion: 1,
  contract: "kungfu-buildchain-observed-evidence-bundle",
  snapshot: { id: evidence.snapshotId, observedAt },
  publication: {
    immutable: { source: `snapshots/${evidence.snapshotId}.json`, key: `dogfood-evidence/snapshots/${evidence.snapshotId}.json`, sha256: hash(snapshotFile), contentType: "application/json" },
    latest: { source: "latest.json", key: "dogfood-evidence.json", sha256: hash(latestFile), contentType: "application/json" },
    invalidationPaths: ["/dogfood-evidence.json", "/dogfood/*"],
  },
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`generated ${evidence.snapshotId}: ${github.mergedPublicPullRequests} PRs, ${cuts.retained} Project Cuts`);
