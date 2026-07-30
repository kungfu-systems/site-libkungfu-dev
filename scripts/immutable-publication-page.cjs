"use strict";

const IMMUTABLE_PUBLICATION_PAGE_CONTRACT = "libkungfu-dev-immutable-publication-page-v1";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function absolutePath(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("/") || normalized.includes("..") || normalized.includes("//")) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return normalized;
}

function artifactPath(value) {
  const normalized = String(value || "").trim().replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`invalid immutable publication artifact path: ${value}`);
  }
  return normalized;
}

function renderImmutablePublicationPage({ publication, version } = {}) {
  const id = String(publication?.id || "").trim();
  const title = String(publication?.title || "").trim();
  const versionId = String(version?.version || "").trim();
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || !title || !/^[a-z0-9][a-z0-9.-]*$/.test(versionId)) {
    throw new Error("immutable publication page requires a valid publication id, title, and version");
  }
  const immutablePath = absolutePath(version.immutablePath, "immutable publication path");
  if (!immutablePath.endsWith("/") || immutablePath !== `/archive/${id}/v${versionId}/`) {
    throw new Error(`immutable publication path does not match ${id}@${versionId}`);
  }
  const publicationPath = `/${id}/`;
  const artifacts = (version.renderedArtifacts || []).map((artifact) => ({
    kind: String(artifact.kind || "artifact"),
    path: artifactPath(artifact.path),
    sha256: String(artifact.sha256 || ""),
  }));
  if (artifacts.length === 0 || artifacts.some((artifact) => !/^sha256:[a-f0-9]{64}$/.test(artifact.sha256))) {
    throw new Error(`immutable publication page requires exact artifact digests for ${id}@${versionId}`);
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <meta name="description" content="${escapeHtml(`Immutable archive for ${title} ${versionId}.`)}">
  <title>${escapeHtml(`${title} ${versionId} | papers.libkungfu.dev`)}</title>
  <link rel="alternate" type="application/json" title="Site manifest" href="/manifest.json">
  <link rel="alternate" type="text/plain" title="Agent entrypoint" href="/llms.txt">
  <link rel="alternate" type="text/plain" title="Full agent index" href="/llms-full.txt">
  <style>
    :root { color-scheme: light; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    * { box-sizing: border-box; }
    body { max-width: 880px; margin: 0 auto; padding: 40px 20px 72px; color: #172033; background: #f7f5ef; line-height: 1.6; }
    a { color: #154f83; text-underline-offset: 3px; }
    header, section { padding: 24px; border: 1px solid #c8c3b6; background: #fffdf7; }
    section { margin-top: 18px; }
    h1, h2 { margin-top: 0; line-height: 1.2; }
    code { overflow-wrap: anywhere; }
    dl { display: grid; grid-template-columns: minmax(90px, 0.3fr) minmax(0, 1fr); gap: 10px 18px; margin-bottom: 0; }
    dt { font-weight: 700; }
    dd { margin: 0; }
    .boundary { border-left: 5px solid #b36b00; }
    @media (max-width: 600px) { dl { grid-template-columns: 1fr; } dd + dt { margin-top: 8px; } }
  </style>
</head>
<body data-contract="${IMMUTABLE_PUBLICATION_PAGE_CONTRACT}">
  <header>
    <p><a href="${escapeHtml(publicationPath)}">Back to publication page</a></p>
    <p>immutable / ${escapeHtml(versionId)}</p>
    <h1>${escapeHtml(title)} ${escapeHtml(versionId)}</h1>
    <p>Immutable archive prefix. Later builds must preserve every byte listed here.</p>
  </header>
  <section class="boundary">
    <h2>Immutable route</h2>
    <p><strong>Append-only:</strong> <code>${escapeHtml(immutablePath)}</code></p>
    <p><strong>Renderer contract:</strong> <code>${IMMUTABLE_PUBLICATION_PAGE_CONTRACT}</code></p>
  </section>
  <section>
    <h2>Artifacts</h2>
    <dl>
${artifacts.map((artifact) => `      <dt>${escapeHtml(artifact.kind)}</dt>
      <dd><a href="${escapeHtml(`${immutablePath}${artifact.path}`)}"><code>${escapeHtml(artifact.path)}</code></a><br><code>${escapeHtml(artifact.sha256)}</code></dd>`).join("\n")}
    </dl>
  </section>
</body>
</html>
`;
}

module.exports = {
  IMMUTABLE_PUBLICATION_PAGE_CONTRACT,
  renderImmutablePublicationPage,
};
