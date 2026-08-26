#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);
const root = process.cwd();
const sourceDir = path.join(root, "imports", "evidence-2026");
const outputDir = path.join(root, "assets", "images", "evidence");
const widths = [640, 960, 1200];

const photos = [
  { source: "IMG_2134.HEIC", slug: "porsche-911-finished", webpWidth: 1800 },
  { source: "IMG_2123.HEIC", slug: "porsche-cayenne-finished", webpWidth: 1800 },
  { source: "IMG_1411.heic", slug: "porsche-911-foam", webpWidth: 1400 },
  { source: "IMG_7528.HEIC", slug: "silverado-passenger-before", webpWidth: 1400 },
  { source: "IMG_7532.HEIC", slug: "silverado-passenger-after", webpWidth: 1400 },
  { source: "IMG_7529.HEIC", slug: "silverado-driver-before", webpWidth: 1400 },
  { source: "IMG_7533.HEIC", slug: "silverado-driver-after", webpWidth: 1400 },
];

await mkdir(outputDir, { recursive: true });
const tempDir = await mkdtemp(path.join(os.tmpdir(), "sneaky-evidence-"));

try {
  for (const photo of photos) {
    const sourcePath = path.join(sourceDir, photo.source);
    const jpegPath = path.join(tempDir, `${photo.slug}.jpg`);

    await run("heif-convert", ["-q", "92", sourcePath, jpegPath]);

    await sharp(jpegPath)
      .resize({ width: photo.webpWidth, withoutEnlargement: true })
      .webp({ quality: 84, effort: 5 })
      .toFile(path.join(outputDir, `${photo.slug}.webp`));

    for (const width of widths) {
      await sharp(jpegPath)
        .resize({ width, withoutEnlargement: true })
        .avif({ quality: 62, effort: 6 })
        .toFile(path.join(outputDir, `${photo.slug}-${width}.avif`));
    }

    console.log(`Prepared ${photo.slug}`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
