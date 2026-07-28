// SPDX-License-Identifier: Apache-2.0

const path = require("node:path");

function createCoreSiteExperience(siteApi) {
  return siteApi.renderProductSiteExperience({
    id: "kungfu-core",
    context: "Core Product and Developer Platform",
    canonicalBaseUrl: "https://core.libkungfu.dev",
    external: [
      { label: "Developer Hub", href: "https://libkungfu.dev/" },
      { label: "Buildchain", href: "https://buildchain.libkungfu.dev/" },
      { label: "KFD", href: "https://kfd.libkungfu.dev/" },
    ],
  });
}

function previewOutputPath(route) {
  if (route === "/") return "core-preview/index.html";
  const relative = route.replace(/^\/+/, "");
  return route.endsWith("/")
    ? path.posix.join("core-preview", relative, "index.html")
    : path.posix.join("core-preview", relative);
}

module.exports = {
  createCoreSiteExperience,
  previewOutputPath,
};
