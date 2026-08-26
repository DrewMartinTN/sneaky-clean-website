import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const WORK_DIR = path.join(ROOT, "assets", "images", "work");
const IMAGE_WIDTHS = [640, 960, 1200];

async function convert(input, output, width, quality) {
  await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .avif({ quality, effort: 6 })
    .toFile(output);
  console.log(`Wrote ${path.relative(ROOT, output)}`);
}

const workImages = (await fs.readdir(WORK_DIR))
  .filter((file) => /^case-\d+\.webp$/.test(file))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

for (const file of workImages) {
  const input = path.join(WORK_DIR, file);
  const base = file.replace(/\.webp$/, "");

  for (const width of IMAGE_WIDTHS) {
    await convert(input, path.join(WORK_DIR, `${base}-${width}.avif`), width, 60);
  }
}

const mascot = path.join(ROOT, "assets", "images", "sneaky-clean-mascot.png");
await convert(mascot, path.join(ROOT, "assets", "images", "sneaky-clean-mascot-96.avif"), 96, 70);
await convert(mascot, path.join(ROOT, "assets", "images", "sneaky-clean-mascot-320.avif"), 320, 70);
