import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = process.cwd();
const SUPPORTED = new Set([".heic", ".heif", ".jpg", ".jpeg", ".png"]);
const VIDEO = new Set([".mov", ".mp4", ".m4v", ".avi"]);

const [, , inputDirArg, outputSlugArg] = process.argv;

if (!inputDirArg || !outputSlugArg) {
  console.error("Usage: node scripts/images/prepare-images.mjs <input-dir> <output-slug>");
  process.exit(1);
}

const inputDir = path.resolve(inputDirArg);
const outputSlug = outputSlugArg
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

if (!outputSlug) {
  console.error("Output slug must include at least one letter or number.");
  process.exit(1);
}

const outputDir = path.join(ROOT, "assets", "images", "seo", outputSlug);
const entries = await fs.readdir(inputDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const imageFiles = files.filter((file) => SUPPORTED.has(path.extname(file).toLowerCase()));
const videoFiles = files.filter((file) => VIDEO.has(path.extname(file).toLowerCase()));

if (!imageFiles.length) {
  console.log(`No supported images found in ${inputDir}`);
  if (videoFiles.length) {
    console.log(`Skipped ${videoFiles.length} video file(s). Export stills first, then rerun this script.`);
  }
  process.exit(0);
}

await fs.mkdir(outputDir, { recursive: true });

let converted = 0;

for (const [index, file] of imageFiles.entries()) {
  const input = path.join(inputDir, file);
  const number = String(index + 1).padStart(2, "0");
  const output = path.join(outputDir, `${outputSlug}-${number}.jpg`);

  await run("sips", ["-Z", "1800", "-s", "format", "jpeg", "-s", "formatOptions", "82", input, "--out", output]);
  converted += 1;
  console.log(`Wrote ${path.relative(ROOT, output)}`);
}

console.log(`Prepared ${converted} image(s) in ${path.relative(ROOT, outputDir)}`);

if (videoFiles.length) {
  console.log(`Skipped ${videoFiles.length} video file(s). Use edited stills or export frames before adding them to the site.`);
}
