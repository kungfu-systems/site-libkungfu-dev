import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STATUS_SCHEMA = "kungfu.pages-disaster-mirror-status/v1";
const BANNER_MARKER = "data-kungfu-disaster-mirror=\"true\"";
const PRIMARY_SURFACES = new Map([
  ["libkungfu.dev", ""],
  ["kfx.libkungfu.dev", "kfx"],
  ["core.libkungfu.dev", "core"],
  ["buildchain.libkungfu.dev", "buildchain"],
  ["kfd.libkungfu.dev", "kfd"],
  ["papers.libkungfu.dev", "papers"],
]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith("--")) fail(`unexpected argument: ${flag}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for ${flag}`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  return { command, values };
}

function required(values, name) {
  const value = values[name];
  if (!value) fail(`--${name} is required`);
  return value;
}

function sha256(content) {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function regularFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) fail(`symbolic links are not admitted: ${path.relative(root, file)}`);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) files.push(file);
      else fail(`unsupported artifact entry: ${path.relative(root, file)}`);
    }
  };
  visit(root);
  return files;
}

export function buildchainArtifactHash(root, prefix = "dist") {
  const digest = crypto.createHash("sha256");
  const files = regularFiles(root).map((file) => {
    const bytes = fs.readFileSync(file);
    const relative = path.relative(root, file).split(path.sep).join("/");
    return {
      path: `${prefix.replace(/\/+$/u, "")}/${relative}`,
      size: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  });
  for (const file of files) digest.update(`${file.path}\0${file.size}\0${file.sha256}\n`);
  return { hash: digest.digest("hex"), files };
}

function outputTreeHash(root, excluded = new Set()) {
  const digest = crypto.createHash("sha256");
  let count = 0;
  for (const file of regularFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (excluded.has(relative)) continue;
    const bytes = fs.readFileSync(file);
    digest.update(`${relative}\0${bytes.length}\0${crypto.createHash("sha256").update(bytes).digest("hex")}\n`);
    count += 1;
  }
  return { hash: `sha256:${digest.digest("hex")}`, fileCount: count };
}

function validateDigest(value, label) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) fail(`${label} must be a sha256 digest`);
}

function validateSource(passport, input) {
  if (input.sourceRunEvent !== "push" || input.sourceRunHeadBranch !== "main" || input.sourceRunConclusion !== "success") {
    fail("mirror source must be a successful Buildchain push run on main");
  }
  if (!/^[0-9a-f]{40}$/u.test(input.sourceSha)) fail("source SHA must be a full Git commit");
  if (!/^\d+$/u.test(input.sourceRunId)) fail("source run id must be numeric");
  if (!/^\d+$/u.test(input.productionDeploymentId) || input.productionDeploymentStatus !== "success") {
    fail("a successful production deployment is required");
  }
  validateDigest(input.artifactDigest, "artifact digest");
  validateDigest(input.passportDigest, "passport digest");

  const release = passport.release || {};
  const workflow = passport.workflow || {};
  const evidence = passport.evidence || {};
  const preflight = evidence.productionPreflight || {};
  const health = evidence.healthCheck || {};
  if (passport.contract !== "kungfu-buildchain-web-surface-release-passport" || passport.schemaVersion !== 1) {
    fail("unsupported production passport");
  }
  if (passport.product?.repository !== input.repository) fail("passport repository mismatch");
  if (release.channel !== "production" || release.status !== "applied") fail("passport is not an applied production release");
  if (release.sourceSha !== input.sourceSha) fail("passport source SHA mismatch");
  if (String(workflow.runId) !== input.sourceRunId || workflow.applyOutcome !== "success" || workflow.jobStatus !== "success") {
    fail("passport workflow binding mismatch");
  }
  if (evidence.applyResultBound !== true || preflight.status !== "passed" || preflight.channel !== "production" || health.status !== "passed") {
    fail("passport does not contain passed production evidence");
  }
  if (preflight.sourceSha !== input.sourceSha || health.sourceSha !== input.sourceSha) fail("production evidence source SHA mismatch");
  if (!/^[0-9a-f]{64}$/u.test(release.artifactHash || "")) fail("passport artifactHash is invalid");
  if (preflight.artifactHash !== release.artifactHash || health.artifactHash !== release.artifactHash) {
    fail("production evidence artifactHash mismatch");
  }
  return release;
}

function canonicalFor(relative) {
  const segments = relative.split("/");
  const surface = PRIMARY_SURFACES.has(`${segments[0]}.libkungfu.dev`) ? segments.shift() : "";
  const host = surface ? `${surface}.libkungfu.dev` : "libkungfu.dev";
  const tail = segments.join("/");
  if (tail === "index.html") return `https://${host}/`;
  if (tail.endsWith("/index.html")) return `https://${host}/${tail.slice(0, -10)}`;
  return `https://${host}/${tail}`;
}

function canonicalFromHtml(html, relative) {
  const tags = html.match(/<link\b[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/giu) || [];
  if (tags.length > 1) fail(`${relative} has multiple canonical links`);
  const href = tags[0]?.match(/\bhref=["']([^"']+)["']/iu)?.[1];
  const canonical = href || canonicalFor(relative);
  let url;
  try {
    url = new URL(canonical);
  } catch {
    fail(`${relative} has an invalid canonical URL`);
  }
  if (url.protocol !== "https:" || !PRIMARY_SURFACES.has(url.hostname)) fail(`${relative} canonical is outside the primary site`);
  return canonical;
}

function mirrorHref(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  const prefix = PRIMARY_SURFACES.get(url.hostname);
  if (prefix === undefined) return value;
  const pathname = url.pathname.startsWith("/") ? url.pathname : `/${url.pathname}`;
  const joined = prefix ? `/${prefix}${pathname === "/" ? "/" : pathname}` : pathname;
  return `${joined}${url.search}${url.hash}`;
}

function transformHtml(html, relative) {
  if (!/<head\b/iu.test(html) || !/<body\b/iu.test(html)) fail(`${relative} is not a complete HTML document`);
  const canonical = canonicalFromHtml(html, relative);
  let result = html.replace(/<meta\b[^>]*\bname=["']robots["'][^>]*>\s*/giu, "");
  result = result.replace(/\bhref=(["'])(https:\/\/[^"']+)\1/giu, (_match, quote, href) => `href=${quote}${mirrorHref(href)}${quote}`);
  result = result.replace(/<link\b[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>\s*/giu, "");
  result = result.replace(/<head\b([^>]*)>/iu, `<head$1>\n  <meta name="robots" content="noindex, nofollow, noarchive">\n  <link rel="canonical" href="${canonical}">`);
  const banner = `<aside ${BANNER_MARKER} role="status" style="box-sizing:border-box;width:100%;padding:.7rem 1rem;background:#fff3cd;color:#4b3a00;border-bottom:1px solid #d6b84a;font:600 14px/1.4 system-ui,sans-serif;text-align:center;">Disaster mirror — non-canonical, read-only, and updated only from production-approved release evidence. <a href="/incident/" style="color:inherit;text-decoration:underline;">Incident entry</a> · <a href="${canonical}" style="color:inherit;text-decoration:underline;">Primary site</a></aside>`;
  result = result.replace(/<body\b([^>]*)>/iu, `<body$1>\n${banner}`);
  return result;
}

function incidentPage(primaryHost) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><link rel="canonical" href="https://${primaryHost}/"><title>Kungfu disaster mirror incident entry</title></head><body><aside ${BANNER_MARKER} role="status" style="padding:.7rem 1rem;background:#fff3cd;border-bottom:1px solid #d6b84a;text-align:center;font:600 14px/1.4 system-ui,sans-serif;">Disaster mirror — non-canonical and read-only.</aside><main style="max-width:52rem;margin:3rem auto;padding:0 1.25rem;font:16px/1.6 system-ui,sans-serif;"><h1>Incident entry</h1><ol><li>Confirm the primary site is unavailable from more than one network.</li><li>Check <a href="/.well-known/kungfu-mirror-status.json">mirror status</a> and its SHA-256 sidecar.</li><li>Use this mirror for read-only documentation and downloads only; the primary URL remains canonical.</li><li>Do not publish, qualify, or infer production health from mirror availability.</li><li>When the primary recovers, return readers to <a href="https://${primaryHost}/">https://${primaryHost}/</a>.</li></ol><p>This mirror is promoted only from a Buildchain production passport and the exact artifact from the same successful workflow run.</p></main></body></html>`;
}

export function prepareMirror(options) {
  const artifactRoot = path.resolve(options.artifactRoot);
  const outputRoot = path.resolve(options.outputRoot);
  if (!fs.statSync(artifactRoot).isDirectory()) fail("artifact root must be a directory");
  if (outputRoot === artifactRoot || outputRoot.startsWith(`${artifactRoot}${path.sep}`)) fail("output root must be outside the input artifact");
  const passportBytes = fs.readFileSync(options.passportPath);
  const passport = JSON.parse(passportBytes.toString("utf8"));
  const release = validateSource(passport, options);
  const artifact = buildchainArtifactHash(artifactRoot, options.artifactPrefix || "dist");
  if (artifact.hash !== release.artifactHash) fail(`artifactHash mismatch: expected ${release.artifactHash}, got ${artifact.hash}`);

  if (fs.existsSync(outputRoot)) fail("output root already exists");
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.cpSync(artifactRoot, outputRoot, { recursive: true, errorOnExist: true, force: false });
  for (const file of regularFiles(outputRoot).filter((entry) => entry.endsWith(".html"))) {
    const relative = path.relative(outputRoot, file).split(path.sep).join("/");
    fs.writeFileSync(file, transformHtml(fs.readFileSync(file, "utf8"), relative));
  }
  fs.mkdirSync(path.join(outputRoot, "incident"), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "incident", "index.html"), incidentPage(options.primaryHost));
  fs.writeFileSync(path.join(outputRoot, "CNAME"), `${options.mirrorHost}\n`);

  const statusRelative = ".well-known/kungfu-mirror-status.json";
  const sidecarRelative = `${statusRelative}.sha256`;
  const tree = outputTreeHash(outputRoot, new Set([statusRelative, sidecarRelative]));
  const status = {
    schema: STATUS_SCHEMA,
    mirror: {
      host: options.mirrorHost,
      url: `https://${options.mirrorHost}/`,
      role: "non-canonical-disaster-mirror",
      indexable: false,
      writable: false,
    },
    primary: { host: options.primaryHost, url: `https://${options.primaryHost}/`, canonical: true },
    source: {
      repository: options.repository,
      sha: options.sourceSha,
      workflowRunId: options.sourceRunId,
      productionDeploymentId: options.productionDeploymentId,
      productionPassportArtifactDigest: options.passportDigest,
      productionArtifactDigest: options.artifactDigest,
      buildchainArtifactHash: release.artifactHash,
    },
    output: { treeHash: tree.hash, fileCount: tree.fileCount, digestScope: "all mirror files except status and its sidecar" },
    claimBoundary: "Availability of this mirror proves only that these bytes were projected from the cited production-approved artifact. It is not production, certification, security, qualification, or fitness evidence.",
  };
  const statusBytes = Buffer.from(`${JSON.stringify(status, null, 2)}\n`);
  fs.mkdirSync(path.join(outputRoot, ".well-known"), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, statusRelative), statusBytes);
  fs.writeFileSync(path.join(outputRoot, sidecarRelative), `${sha256(statusBytes).slice(7)}  kungfu-mirror-status.json\n`);
  return { status, statusDigest: sha256(statusBytes), outputRoot };
}

async function fetchRequired(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

export async function verifyMirrorBase(baseUrl, options = {}) {
  const base = new URL(baseUrl);
  const expectedMirrorHost = options.expectedMirrorHost || base.hostname;
  const statusResult = await fetchRequired(new URL("/.well-known/kungfu-mirror-status.json", base));
  const sidecarResult = await fetchRequired(new URL("/.well-known/kungfu-mirror-status.json.sha256", base));
  const status = JSON.parse(statusResult.bytes.toString("utf8"));
  const expectedDigest = sidecarResult.bytes.toString("utf8").trim().split(/\s+/u)[0];
  if (expectedDigest !== sha256(statusResult.bytes).slice(7)) fail("mirror status digest mismatch");
  if (status.schema !== STATUS_SCHEMA || status.mirror?.host !== expectedMirrorHost || status.mirror?.indexable !== false || status.mirror?.role !== "non-canonical-disaster-mirror") {
    fail("mirror status boundary mismatch");
  }
  if (!/^[0-9a-f]{40}$/u.test(status.source?.sha || "") || !/^sha256:[0-9a-f]{64}$/u.test(status.output?.treeHash || "")) fail("mirror status evidence is incomplete");
  if (options.expectedSourceSha && status.source.sha !== options.expectedSourceSha) fail("live mirror source SHA mismatch");
  const routes = options.routes || ["/", "/incident/"];
  for (const route of routes) {
    const result = await fetchRequired(new URL(route, base));
    const html = result.bytes.toString("utf8");
    if (!/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/iu.test(html)) fail(`${route} is missing noindex`);
    if (!html.includes(BANNER_MARKER)) fail(`${route} is missing the disaster-mirror banner`);
    const canonical = html.match(/<link\b[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/iu)?.[0]?.match(/\bhref=["']([^"']+)["']/iu)?.[1];
    if (!canonical || new URL(canonical).hostname === base.hostname || !PRIMARY_SURFACES.has(new URL(canonical).hostname)) fail(`${route} canonical boundary mismatch`);
  }
  return { status: "verified", sourceSha: status.source.sha, outputTreeHash: status.output.treeHash, routes };
}

async function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === "prepare") {
    const result = prepareMirror({
      artifactRoot: required(values, "artifact-root"),
      artifactPrefix: values["artifact-prefix"] || "dist",
      passportPath: required(values, "passport"),
      outputRoot: required(values, "output"),
      repository: required(values, "repository"),
      sourceRunId: required(values, "source-run-id"),
      sourceRunEvent: required(values, "source-run-event"),
      sourceRunHeadBranch: required(values, "source-run-head-branch"),
      sourceRunConclusion: required(values, "source-run-conclusion"),
      sourceSha: required(values, "source-sha"),
      artifactDigest: required(values, "artifact-digest"),
      passportDigest: required(values, "passport-digest"),
      productionDeploymentId: required(values, "production-deployment-id"),
      productionDeploymentStatus: required(values, "production-deployment-status"),
      mirrorHost: required(values, "mirror-host"),
      primaryHost: required(values, "primary-host"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    const result = await verifyMirrorBase(required(values, "base-url"), {
      expectedSourceSha: values["expected-source-sha"] || "",
      expectedMirrorHost: values["expected-mirror-host"] || "",
      routes: (values.routes || "/,/kfx/,/core/,/buildchain/,/kfd/,/papers/,/skills/,/incident/").split(","),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  fail("command must be prepare or verify");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`pages disaster mirror: ${error.message}\n`);
    process.exitCode = 1;
  });
}
