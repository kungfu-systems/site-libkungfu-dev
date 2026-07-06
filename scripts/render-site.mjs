import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const fixturesDir = path.join(repoRoot, "src", "fixtures");
const require = createRequire(import.meta.url);

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readFixtureJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function readOptionalJsonFile(file) {
  return fs.existsSync(file) ? readJsonFile(file) : undefined;
}

function readPackageJson(specifier) {
  return readJsonFile(require.resolve(specifier));
}

function readPackageText(specifier) {
  return fs.readFileSync(require.resolve(specifier), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relativePath, content) {
  const target = path.join(distDir, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(`<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${list.type}>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (code) {
      if (line.startsWith("```")) {
        html.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      code = { lines: [] };
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = line.match(/^\s*-\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== "ul") list = { type: "ul", items: [] };
      list.items.push(unordered[1]);
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== "ol") list = { type: "ol", items: [] };
      list.items.push(ordered[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (code) html.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
  return html.join("\n");
}

function page({ title, description, current, body }) {
  const nav = [
    ["hub", "/", "Hub"],
    ["core", "/core/", "Core"],
    ["buildchain", "/buildchain/", "Buildchain"],
    ["kfd", "/kfd/", "KFD"],
    ["manifest", "/manifest.json", "Manifest"],
    ["agents", "/llms.txt", "Agents"],
  ];

  const navHtml = nav
    .map(([id, href, label]) => {
      const active = id === current ? ' aria-current="page"' : "";
      return `<a href="${href}"${active}>${escapeHtml(label)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta name="robots" content="noindex">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f5f7f8;
      --fg: #14171a;
      --muted: #5b6470;
      --line: #cbd5df;
      --soft: #ffffff;
      --accent: #0f766e;
      --accent-strong: #0b4f4a;
      --warn: #925a16;
      --code: #eef2f3;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1214;
        --fg: #eef3f6;
        --muted: #a8b2bd;
        --line: #33404a;
        --soft: #171c20;
        --accent: #47c9ba;
        --accent-strong: #83ded3;
        --warn: #e2b15b;
        --code: #20272d;
      }
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font: 16px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--fg);
    }

    a {
      color: var(--accent-strong);
      text-decoration-thickness: 1px;
      text-underline-offset: 4px;
    }

    code {
      border: 1px solid var(--line);
      background: var(--code);
      padding: 1px 5px;
      border-radius: 4px;
      font: 0.92em/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-wrap: anywhere;
    }

    header {
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--soft) 88%, transparent);
    }

    .bar {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      min-height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }

    .brand {
      font-weight: 700;
      letter-spacing: 0;
    }

    nav {
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }

    nav a {
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
    }

    nav a[aria-current="page"] {
      color: var(--fg);
      font-weight: 700;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 64px 0 72px;
    }

    .hero {
      display: grid;
      gap: 22px;
      margin-bottom: 48px;
    }

    .visual {
      display: block;
      width: 100%;
      max-width: 960px;
      height: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--soft);
    }

    .eyebrow {
      margin: 0;
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      max-width: 920px;
      font-size: clamp(40px, 6vw, 72px);
      line-height: 0.98;
      letter-spacing: 0;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    h3 {
      margin: 0 0 8px;
      font-size: 18px;
      line-height: 1.25;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      color: var(--muted);
    }

    .lead {
      max-width: 820px;
      color: var(--fg);
      font-size: 22px;
      line-height: 1.35;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .grid.three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--soft);
      padding: 20px;
      min-width: 0;
    }

    .stack {
      display: grid;
      gap: 18px;
    }

    .meta {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 10px 18px;
      margin: 0;
    }

    .meta dt {
      color: var(--muted);
    }

    .meta dd {
      margin: 0;
      min-width: 0;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 10px;
      color: var(--muted);
      font-size: 13px;
    }

    .card-action {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      margin-top: 16px;
      font-weight: 700;
    }

    .warning {
      border-color: color-mix(in srgb, var(--warn) 55%, var(--line));
    }

    .warning strong {
      color: var(--warn);
    }

    ul {
      margin: 0;
      padding-left: 20px;
      color: var(--muted);
    }

    li + li {
      margin-top: 8px;
    }

    footer {
      border-top: 1px solid var(--line);
      color: var(--muted);
      padding: 24px 0;
      font-size: 14px;
    }

    footer div {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
    }

    @media (max-width: 820px) {
      .bar {
        align-items: flex-start;
        flex-direction: column;
        padding: 18px 0;
      }

      main {
        padding-top: 42px;
      }

      .grid,
      .grid.three {
        grid-template-columns: 1fr;
      }

      .meta {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div class="brand">libkungfu.dev</div>
      <nav aria-label="Primary">${navHtml}</nav>
    </div>
  </header>
  <main>${body}</main>
  <footer><div>This repository renders upstream manifests and pinned package artifacts. It is not a product fact source.</div></footer>
</body>
</html>
`;
}

function surfaceCard(surface) {
  return `<article class="panel stack">
    <div class="tag">${escapeHtml(surface.host)}</div>
    <div>
      <h3>${escapeHtml(surface.label)}</h3>
      <p>${escapeHtml(surface.summary)}</p>
    </div>
    <dl class="meta">
      <dt>Source</dt>
      <dd><code>${escapeHtml(surface.source)}</code></dd>
      <dt>Route</dt>
      <dd><a href="${escapeAttr(surface.path)}">${escapeHtml(surface.path)}</a></dd>
    </dl>
  </article>`;
}

function listPanels(items) {
  return items
    .map(
      (item) => `<article class="panel">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
      </article>`,
    )
    .join("\n");
}

function factPanels(items, getTitle, getSummary, getMeta = () => []) {
  return items
    .map((item) => {
      const meta = getMeta(item);
      const metaHtml = meta.length
        ? `<dl class="meta" style="margin-top: 14px;">${meta
            .map(
              ([label, value]) => `<dt>${escapeHtml(label)}</dt>
                <dd><code>${escapeHtml(value)}</code></dd>`,
            )
            .join("")}</dl>`
        : "";
      return `<article class="panel">
        <h3>${escapeHtml(getTitle(item))}</h3>
        <p>${escapeHtml(getSummary(item))}</p>
        ${metaHtml}
      </article>`;
    })
    .join("\n");
}

function decisionPanels(entries) {
  return entries
    .map((entry) => {
      const path = `/kfd/${entry.number}/`;
      return `<article class="panel">
        <h3><a href="${escapeAttr(path)}">${escapeHtml(entry.id)}</a></h3>
        <p>${escapeHtml(entry.title)}</p>
        <dl class="meta" style="margin-top: 14px;">
          <dt>kind</dt>
          <dd><code>${escapeHtml(entry.kind)}</code></dd>
          <dt>status</dt>
          <dd><code>${escapeHtml(entry.status)}</code></dd>
          <dt>path</dt>
          <dd><a href="${escapeAttr(path)}"><code>${escapeHtml(path)}</code></a></dd>
        </dl>
        <a class="card-action" href="${escapeAttr(path)}">Read ${escapeHtml(entry.id)}</a>
      </article>`;
    })
    .join("\n");
}

const site = readFixtureJson("site-manifest.json");
const core = readFixtureJson("core-spec-manifest.json");
const buildchainSite = readPackageJson("@kungfu-tech/buildchain/site/buildchain-site.json");
const buildchainPackage = readPackageJson("@kungfu-tech/buildchain/package.json");
const buildchainCli = readPackageJson("@kungfu-tech/buildchain/site/cli-registry.json");
const buildchainWorkflow = readPackageJson("@kungfu-tech/buildchain/site/workflow-registry.json");
const buildchainReleaseModel = readPackageJson("@kungfu-tech/buildchain/site/release-model.json");
const buildchainArtifactSchemas = readPackageJson("@kungfu-tech/buildchain/site/artifact-schemas.json");
const buildchainProductMechanism = readPackageJson("@kungfu-tech/buildchain/site/product-mechanism.json");
const buildchainReleaseProvenance = readPackageJson("@kungfu-tech/buildchain/site/release-provenance.json");
const buildchainAgentIndex = readPackageJson("@kungfu-tech/buildchain/site/agent-index.json");
const kfdSite = readPackageJson("@kungfu-tech/kfd/site/kfd-site.json");
const kfdPackage = readPackageJson("@kungfu-tech/kfd/package.json");
const kfdRegistry = readPackageJson("@kungfu-tech/kfd/registry.json");
const kfdStandards = readPackageJson("@kungfu-tech/kfd/standards.json");
const packageLock = readJsonFile(path.join(repoRoot, "package-lock.json"));
const kfdPropagationLock = readOptionalJsonFile(path.join(repoRoot, "buildchain.upstreams", "kfd.release.json"));
const buildchainLock = packageLock.packages?.["node_modules/@kungfu-tech/buildchain"] ?? {};
const kfdLock = packageLock.packages?.["node_modules/@kungfu-tech/kfd"] ?? {};
const expectedBuildchainVersion = "2.4.1";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.3";
if (buildchainPackage.version !== expectedBuildchainVersion || buildchainLock.version !== expectedBuildchainVersion) {
  throw new Error(`site-libkungfu-dev expects @kungfu-tech/buildchain ${expectedBuildchainVersion}`);
}
if (kfdPackage.version !== expectedKfdVersion || kfdLock.version !== expectedKfdVersion) {
  throw new Error(`site-libkungfu-dev expects @kungfu-tech/kfd ${expectedKfdVersion}`);
}
if (kfdPropagationLock && kfdLock.integrity !== kfdPropagationLock.upstream?.package?.integrity) {
  throw new Error("installed KFD package integrity does not match Buildchain release propagation lock");
}
if (buildchainSite.contract !== "kungfu-buildchain-site-bundle") {
  throw new Error("unexpected Buildchain site bundle contract");
}
if (kfdSite.contract !== "kfd-site-bundle") {
  throw new Error("unexpected KFD site bundle contract");
}
const buildchainMachineArtifacts = Array.from(
  new Set([
    ...buildchainSite.entrypoints,
    ...buildchainAgentIndex.readOrder,
    buildchainReleaseModel.releasePassport.entrypoint,
    buildchainReleaseModel.releasePassport.bundle,
    buildchainArtifactSchemas.contract,
    buildchainReleaseProvenance.contract,
  ]),
);
const generatedAt = process.env.SITE_GENERATED_AT || "1970-01-01T00:00:00.000Z";

writeFile(
  "index.html",
  page({
    title: `${site.title} | Open substrate hub`,
    description: site.tagline,
    current: "hub",
    body: `<section class="hero">
      <p class="eyebrow">Open substrate hub</p>
      <h1>${escapeHtml(site.title)}</h1>
      <p class="lead">${escapeHtml(site.tagline)}</p>
      <img class="visual" src="/assets/substrate-flow.svg" alt="Manifest flow from upstream packages through site-libkungfu-dev to core and Buildchain subdomains.">
    </section>

    <section class="grid">
      ${site.surfaces.map(surfaceCard).join("\n")}
    </section>

    <section class="panel warning" style="margin-top: 18px;">
      <h2>Source boundary</h2>
      <p><strong>Fixture source:</strong> ${escapeHtml(site.sourceBoundary.rule)}</p>
    </section>

    <section class="grid" style="margin-top: 18px;">
      ${site.stableMachineEntries
        .map(
          (entry) => `<article class="panel">
            <h3>${escapeHtml(entry.label)}</h3>
            <p>${escapeHtml(entry.purpose)}</p>
            <p style="margin-top: 12px;"><a href="${escapeAttr(entry.path)}"><code>${escapeHtml(entry.path)}</code></a></p>
          </article>`,
        )
        .join("\n")}
    </section>`,
  }),
);

writeFile(
  "core/index.html",
  page({
    title: "core.libkungfu.dev | Core substrate",
    description: "libkungfu, yijinjing, runtime fact ledger, specs, schemas, and conformance vectors.",
    current: "core",
    body: `<section class="hero">
      <p class="eyebrow">Core substrate</p>
      <h1>${escapeHtml(core.surfaceHost)}</h1>
      <p class="lead">Generated surface for libkungfu, yijinjing, runtime fact ledger specs, schema registry, and conformance vectors.</p>
    </section>

    <section class="panel">
      <h2>Current fixture manifest</h2>
      <dl class="meta">
        <dt>Package</dt>
        <dd><code>${escapeHtml(core.package)}</code></dd>
        <dt>Source repository</dt>
        <dd><a href="${escapeAttr(core.sourceRepository)}">${escapeHtml(core.sourceRepository)}</a></dd>
        <dt>Spec version</dt>
        <dd><code>${escapeHtml(core.currentSpec.specVersion)}</code></dd>
        <dt>docs_url</dt>
        <dd><code>${escapeHtml(core.currentSpec.docsUrl)}</code></dd>
      </dl>
    </section>

    <section class="grid three" style="margin-top: 18px;">
      ${listPanels(core.sections)}
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Machine fields expected from upstream</h2>
      <ul>${core.machineFields.map((field) => `<li><code>${escapeHtml(field)}</code></li>`).join("")}</ul>
    </section>`,
  }),
);

writeFile(
  "kfd/index.html",
  page({
    title: "kfd.libkungfu.dev | Kung Fu Decisions",
    description: kfdPackage.description,
    current: "kfd",
    body: `<section class="hero">
      <p class="eyebrow">Kung Fu Decisions</p>
      <h1>${escapeHtml(kfdSite.homepage.title)}</h1>
      <p class="lead">${inlineMarkdown(kfdSite.homepage.lead)}</p>
    </section>

    <section class="panel">
      <h2>${escapeHtml(kfdSite.homepage.foundationTriad.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.foundationTriad.intro)}</p>
      <div class="grid three" style="margin-top: 18px;">
        ${kfdSite.homepage.foundationTriad.commitments
          .map(
            (entry) => `<article class="panel">
              <h3>${escapeHtml(entry.id)}</h3>
              <p>${inlineMarkdown(entry.text)}</p>
            </article>`,
          )
          .join("\n")}
      </div>
      <p style="margin-top: 18px;">${inlineMarkdown(kfdSite.homepage.foundationTriad.summary)}</p>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.foundationModel.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.foundationModel.intro)}</p>
      <div class="grid three" style="margin-top: 18px;">
        ${factPanels(
          kfdSite.homepage.foundationModel.layers,
          (layer) => layer.layer,
          (layer) => layer.commitment,
          (layer) => [["decision", layer.decision], ["question", layer.readerQuestion]],
        )}
      </div>
      <p style="margin-top: 18px;"><code>${escapeHtml(kfdSite.homepage.foundationModel.chain)}</code></p>
      <div class="stack" style="margin-top: 18px;">
        ${kfdSite.homepage.foundationModel.explanation.map((text) => `<p>${inlineMarkdown(text)}</p>`).join("\n")}
      </div>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.productProofPath.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.productProofPath.body)}</p>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.currentDecisions.heading)}</h2>
      <div class="grid three">
        ${decisionPanels(kfdRegistry.entries)}
      </div>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Machine facts</h2>
      <dl class="meta">
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}</code></dd>
        <dt>Version</dt>
        <dd><code>${escapeHtml(kfdPackage.version)}</code></dd>
        <dt>Site bundle</dt>
        <dd><code>${escapeHtml(kfdSite.contract)}</code></dd>
        <dt>Registry</dt>
        <dd><code>${escapeHtml(kfdSite.decisionPages.source)}</code></dd>
        <dt>Standards</dt>
        <dd><code>${escapeHtml(kfdStandards.contract)}</code></dd>
        <dt>Lock integrity</dt>
        <dd><code>${escapeHtml(kfdLock.integrity)}</code></dd>
      </dl>
    </section>`,
  }),
);

for (const entry of kfdRegistry.entries) {
  const decisionMarkdown = readPackageText(`@kungfu-tech/kfd/${entry.path}`);
  writeFile(
    `kfd/${entry.number}/index.html`,
    page({
      title: `${entry.id} | kfd.libkungfu.dev`,
      description: entry.title,
      current: "kfd",
      body: `<section class="hero">
        <p class="eyebrow">${escapeHtml(entry.kind)} / ${escapeHtml(entry.status)}</p>
        <h1>${escapeHtml(entry.id)}</h1>
        <p class="lead">${escapeHtml(entry.title)}</p>
      </section>

      <section class="panel">
        <h2>Decision metadata</h2>
        <dl class="meta">
          <dt>Number</dt>
          <dd><code>${escapeHtml(entry.number)}</code></dd>
          <dt>Stable URL</dt>
          <dd><code>${escapeHtml(entry.url)}</code></dd>
          <dt>Source path</dt>
          <dd><code>${escapeHtml(entry.path)}</code></dd>
        </dl>
      </section>

      <section class="panel" style="margin-top: 18px;">
        ${markdownToHtml(decisionMarkdown)}
      </section>`,
    }),
  );
}

writeFile(
  "buildchain/index.html",
  page({
    title: "buildchain.libkungfu.dev | Buildchain surface",
    description: buildchainPackage.description,
    current: "buildchain",
    body: `<section class="hero">
      <p class="eyebrow">Buildchain product surface</p>
      <h1>Buildchain Release Passport</h1>
      <p class="lead">${escapeHtml(buildchainPackage.description)}</p>
    </section>

    <section class="panel">
      <h2>Pinned npm package</h2>
      <dl class="meta">
        <dt>Package</dt>
        <dd><code>${escapeHtml(buildchainPackage.name)}</code></dd>
        <dt>Version</dt>
        <dd><code>${escapeHtml(buildchainPackage.version)}</code></dd>
        <dt>Source of truth</dt>
        <dd><code>${escapeHtml(buildchainSite.sourceOfTruth)}</code></dd>
        <dt>Repository</dt>
        <dd><a href="${escapeAttr(buildchainPackage.repository)}">${escapeHtml(buildchainPackage.repository)}</a></dd>
        <dt>Lock integrity</dt>
        <dd><code>${escapeHtml(buildchainLock.integrity)}</code></dd>
      </dl>
    </section>

    <section class="grid" style="margin-top: 18px;">
      <article class="panel">
        <h2>Release model</h2>
        <p>${escapeHtml(buildchainReleaseModel.exactTags)}</p>
        <p style="margin-top: 12px;">${escapeHtml(buildchainReleaseModel.floatingTags)}</p>
        <dl class="meta" style="margin-top: 14px;">
          <dt>Passport entrypoint</dt>
          <dd><code>${escapeHtml(buildchainReleaseModel.releasePassport.entrypoint)}</code></dd>
          <dt>Passport bundle</dt>
          <dd><code>${escapeHtml(buildchainReleaseModel.releasePassport.bundle)}</code></dd>
          <dt>Stable dist-tag</dt>
          <dd><code>${escapeHtml(buildchainReleaseModel.npm.stableDistTag)}</code></dd>
        </dl>
      </article>
      <article class="panel">
        <h2>Product mechanism</h2>
        <p>${escapeHtml(buildchainProductMechanism.purpose)}</p>
        <dl class="meta" style="margin-top: 14px;">
          <dt>Category</dt>
          <dd><code>${escapeHtml(buildchainProductMechanism.category)}</code></dd>
          <dt>Substrate</dt>
          <dd><code>${escapeHtml(buildchainProductMechanism.executionSubstrate)}</code></dd>
          <dt>Human first</dt>
          <dd><code>${escapeHtml(buildchainSite.humanFirst)}</code></dd>
          <dt>Agent first</dt>
          <dd><code>${escapeHtml(buildchainSite.agentFirst)}</code></dd>
        </dl>
      </article>
    </section>

    <section class="grid" style="margin-top: 18px;">
      <article class="panel">
        <h2>Not this</h2>
        <ul>${buildchainProductMechanism.notA.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      </article>
      <article class="panel">
        <h2>Proof cases</h2>
        <ul>${buildchainProductMechanism.proofCases.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      </article>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Documentation bundle</h2>
      <div class="grid three">
        ${factPanels(
          buildchainSite.docs,
          (doc) => doc.title,
          (doc) => doc.path,
          (doc) => [["plane", doc.plane], ["exists", doc.exists]],
        )}
      </div>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>CLI command registry</h2>
      <div class="grid">
        ${factPanels(
          buildchainCli.commands,
          (command) => command.usage,
          (command) => command.purpose,
          (command) => [["id", command.id]],
        )}
      </div>
    </section>

    <section class="grid three" style="margin-top: 18px;">
      ${factPanels(
        buildchainWorkflow.workflows,
        (workflow) => workflow.id,
        (workflow) => workflow.path,
        (workflow) => [["surface", workflow.surface], ["status", workflow.status]],
      )}
    </section>

    <section class="grid three" style="margin-top: 18px;">
      ${factPanels(
        buildchainWorkflow.actions,
        (action) => action.id,
        (action) => action.path,
        (action) => [["status", action.status]],
      )}
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Machine artifacts</h2>
      <ul>${buildchainMachineArtifacts
        .map((entry) => `<li><code>${escapeHtml(entry)}</code></li>`)
        .join("")}</ul>
    </section>`,
  }),
);

const manifest = {
  schemaVersion: 1,
  contract: "libkungfu-dev-generated-site-manifest",
  generatedAt,
  canonicalHost: site.canonicalHost,
  sourceBoundary: site.sourceBoundary,
  pages: [
    { path: "/", host: "libkungfu.dev", source: "src/fixtures/site-manifest.json" },
    { path: "/core/", host: core.surfaceHost, source: "src/fixtures/core-spec-manifest.json" },
    {
      path: "/buildchain/",
      host: "buildchain.libkungfu.dev",
      source: `@kungfu-tech/buildchain@${buildchainPackage.version}/dist/site/buildchain-site.json`,
    },
    {
      path: "/kfd/",
      host: "kfd.libkungfu.dev",
      source: `@kungfu-tech/kfd@${kfdPackage.version}/site/kfd-site.json`,
    },
    ...kfdRegistry.entries.map((entry) => ({
      path: `/kfd/${entry.number}/`,
      host: "kfd.libkungfu.dev",
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.path}`,
    })),
  ],
  machineEntries: site.stableMachineEntries,
  upstreamFixtures: {
    core: {
      contract: core.contract,
      package: core.package,
      docsUrlPattern: core.docsUrlPattern,
    },
  },
  upstreamPackages: {
    buildchain: {
      contract: buildchainSite.contract,
      package: buildchainPackage.name,
      version: buildchainPackage.version,
      sourceOfTruth: buildchainSite.sourceOfTruth,
      lockIntegrity: buildchainLock.integrity,
      exportedEntrypoints: buildchainSite.entrypoints,
    },
    kfd: {
      contract: kfdSite.contract,
      package: kfdPackage.name,
      version: kfdPackage.version,
      lockIntegrity: kfdLock.integrity,
      releaseLock: kfdPropagationLock
        ? {
            path: "buildchain.upstreams/kfd.release.json",
            tag: kfdPropagationLock.upstream?.tag,
            lockSha256: kfdPropagationLock.lockSha256,
          }
        : undefined,
      registryContract: kfdRegistry.contract,
      standardsContract: kfdStandards.contract,
      decisionCount: kfdRegistry.entries.length,
    },
  },
};

writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

writeFile(
  "llms.txt",
  `# libkungfu.dev

libkungfu.dev is the open developer and agent substrate hub for Kungfu.

Primary pages:
- https://libkungfu.dev/
- https://core.libkungfu.dev/
- https://buildchain.libkungfu.dev/
- https://kfd.libkungfu.dev/

Machine entries:
- https://libkungfu.dev/manifest.json
- https://libkungfu.dev/llms.txt
- https://libkungfu.dev/llms-full.txt

Source boundary:
This repository renders upstream manifests. It is not a product fact source.
Core facts must come from @kungfu-tech/spec. Buildchain facts must come from
the @kungfu-tech/buildchain docs/site bundle. KFD facts must come from the
@kungfu-tech/kfd site bundle, registry, and decision documents.
`,
);

writeFile(
  "llms-full.txt",
  `# libkungfu.dev full agent index

${JSON.stringify(manifest, null, 2)}
`,
);
