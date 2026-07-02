import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const fixturesDir = path.join(repoRoot, "src", "fixtures");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
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

function page({ title, description, current, body }) {
  const nav = [
    ["hub", "/", "Hub"],
    ["core", "/core/", "Core"],
    ["buildchain", "/buildchain/", "Buildchain"],
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
  <footer><div>Fixture source only. This repository renders upstream manifests and is not a product fact source.</div></footer>
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

const site = readJson("site-manifest.json");
const core = readJson("core-spec-manifest.json");
const buildchain = readJson("buildchain-site-bundle.json");
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
  "buildchain/index.html",
  page({
    title: "buildchain.libkungfu.dev | Buildchain surface",
    description: buildchain.productPositioning,
    current: "buildchain",
    body: `<section class="hero">
      <p class="eyebrow">Buildchain product surface</p>
      <h1>${escapeHtml(buildchain.surfaceHost)}</h1>
      <p class="lead">${escapeHtml(buildchain.productPositioning)}</p>
    </section>

    <section class="panel">
      <h2>Current fixture bundle</h2>
      <dl class="meta">
        <dt>Package</dt>
        <dd><code>${escapeHtml(buildchain.package)}</code></dd>
        <dt>Source repository</dt>
        <dd><a href="${escapeAttr(buildchain.sourceRepository)}">${escapeHtml(buildchain.sourceRepository)}</a></dd>
        <dt>Bundle version</dt>
        <dd><code>${escapeHtml(buildchain.currentBundle.version)}</code></dd>
        <dt>Docs URL pattern</dt>
        <dd><code>${escapeHtml(buildchain.docsUrlPattern)}</code></dd>
      </dl>
    </section>

    <section class="grid three" style="margin-top: 18px;">
      ${listPanels(buildchain.requiredArtifacts)}
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
    { path: "/buildchain/", host: buildchain.surfaceHost, source: "src/fixtures/buildchain-site-bundle.json" },
  ],
  machineEntries: site.stableMachineEntries,
  upstreamFixtures: {
    core: {
      contract: core.contract,
      package: core.package,
      docsUrlPattern: core.docsUrlPattern,
    },
    buildchain: {
      contract: buildchain.contract,
      package: buildchain.package,
      docsUrlPattern: buildchain.docsUrlPattern,
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

Machine entries:
- https://libkungfu.dev/manifest.json
- https://libkungfu.dev/llms.txt
- https://libkungfu.dev/llms-full.txt

Source boundary:
This repository renders upstream manifests. It is not a product fact source.
Core facts must come from @kungfu-tech/spec. Buildchain facts must come from
the @kungfu-tech/buildchain docs/site bundle.
`,
);

writeFile(
  "llms-full.txt",
  `# libkungfu.dev full agent index

${JSON.stringify(manifest, null, 2)}
`,
);
