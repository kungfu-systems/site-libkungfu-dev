import fs from "node:fs";

const cards = [
  {
    file: "public/assets/social/dogfood-public-evidence.png",
    page: "dist/dogfood/index.html",
    canonical: "https://libkungfu.dev/dogfood/",
    title: "One Human. Agents. Thousands of Merged PRs in 30 Days.",
    image: "https://libkungfu.dev/assets/social/dogfood-public-evidence.png",
  },
  {
    file: "public/assets/social/parallel-runtime-paths.png",
    page: "dist/dogfood/parallel-runtime-paths/index.html",
    canonical: "https://libkungfu.dev/dogfood/parallel-runtime-paths/",
    title: "75× More Merged PRs: Kungfu vs. Google AX",
    image: "https://libkungfu.dev/assets/social/parallel-runtime-paths.png",
  },
];

for (const card of cards) {
  const image = fs.readFileSync(card.file);
  if (image.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${card.file} is not a PNG`);
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== 1200 || height !== 630) {
    throw new Error(`${card.file} must be 1200x630, got ${width}x${height}`);
  }

  const html = fs.readFileSync(card.page, "utf8");
  for (const expected of [
    `<link rel="canonical" href="${card.canonical}">`,
    `<meta property="og:url" content="${card.canonical}">`,
    `<meta property="og:title" content="${card.title}">`,
    `<meta property="og:image" content="${card.image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${card.image}">`,
  ]) {
    if (!html.includes(expected)) {
      throw new Error(`${card.page} is missing ${expected}`);
    }
  }
}

const dogfoodEvidence = JSON.parse(fs.readFileSync(".buildchain/render-inputs/dogfood-evidence.json", "utf8"));
if (dogfoodEvidence.metrics.mergedPublicPullRequests.value < 2000) {
  throw new Error("dogfood social title requires at least 2,000 merged public pull requests in the rolling window");
}

const comparisonHtml = fs.readFileSync("dist/dogfood/parallel-runtime-paths/index.html", "utf8");
if (!comparisonHtml.includes("<strong>75×</strong>")) {
  throw new Error("parallel runtime social title must be updated when the rendered comparison ratio changes");
}

console.log("social card metadata and dimensions verified");
