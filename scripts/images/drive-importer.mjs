import fs from "node:fs/promises";
import fsSync from "node:fs";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const IMAGE_EXTENSIONS = new Set([".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v"]);

function slugify(value) {
  return String(value || "drive-import")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeSegment(value, fallback = "file") {
  const cleaned = String(value || fallback)
    .replace(/[/:\\?%*"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function uniquePath(filePath, used) {
  const parsed = path.parse(filePath);
  let candidate = filePath;
  let index = 2;
  while (used.has(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeExtension(file) {
  const title = file.title || file.name || "drive-file";
  const current = path.extname(title).toLowerCase();
  if (current) return safeSegment(title);

  if (file.mime_type === "image/heif" || file.mime_type === "image/heic") return `${safeSegment(title)}.heic`;
  if (file.mime_type === "image/jpeg") return `${safeSegment(title)}.jpg`;
  if (file.mime_type === "image/png") return `${safeSegment(title)}.png`;
  if (file.mime_type === "image/webp") return `${safeSegment(title)}.webp`;
  if (file.mime_type === "video/quicktime") return `${safeSegment(title)}.mov`;
  if (file.mime_type === "video/mp4") return `${safeSegment(title)}.mp4`;
  return safeSegment(title);
}

function mediaKind(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "other";
}

async function downloadUrl(url, destination) {
  await new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          downloadUrl(response.headers.location, destination).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with HTTP ${response.statusCode}`));
          response.resume();
          return;
        }

        pipeline(response, fsSync.createWriteStream(destination)).then(resolve, reject);
      })
      .on("error", reject);
  });
}

async function writeBase64(base64, destination) {
  const stream = Readable.from(Buffer.from(base64, "base64"));
  await pipeline(stream, fsSync.createWriteStream(destination));
}

export async function importDriveManifest(manifestPath, outputDirArg) {
  const manifestAbsolute = path.resolve(manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestAbsolute, "utf8"));
  const importSlug = slugify(manifest.title || manifest.name || path.basename(manifestAbsolute, ".json"));
  const outputDir = path.resolve(outputDirArg || path.join(process.cwd(), "imports", importSlug));
  const files = manifest.files || [];
  const rows = ["relative_path,drive_id,title,mime_type,source_url,kind"];
  const used = new Set();
  const summary = {
    outputDir,
    total: files.length,
    downloaded: 0,
    skipped: 0,
    unsupported: 0,
  };

  await fs.mkdir(outputDir, { recursive: true });

  for (const file of files) {
    const fileName = normalizeExtension(file);
    const relativeDir = file.relative_dir ? safeSegment(file.relative_dir) : "";
    const relativePath = uniquePath(path.join(relativeDir, fileName), used);
    const destination = path.join(outputDir, relativePath);
    const kind = mediaKind(fileName);

    if (kind === "other") {
      summary.unsupported += 1;
      continue;
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });

    if (file.b64_string) {
      await writeBase64(file.b64_string, destination);
    } else if (file.download_url) {
      await downloadUrl(file.download_url, destination);
    } else {
      summary.skipped += 1;
      continue;
    }

    summary.downloaded += 1;
    rows.push(
      [
        csv(relativePath),
        csv(file.id || ""),
        csv(file.title || file.name || ""),
        csv(file.mime_type || ""),
        csv(file.url || file.display_url || ""),
        csv(kind),
      ].join(","),
    );
  }

  await fs.writeFile(path.join(outputDir, "drive-import-manifest.csv"), `${rows.join("\n")}\n`);
  return summary;
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , manifestPath, outputDir] = process.argv;
  if (!manifestPath) {
    console.error("Usage: node scripts/images/drive-importer.mjs <manifest-json> [output-dir]");
    process.exit(1);
  }

  const summary = await importDriveManifest(manifestPath, outputDir);
  console.log(`Imported ${summary.downloaded}/${summary.total} Drive file(s)`);
  if (summary.skipped) console.log(`Skipped ${summary.skipped} file(s) without raw bytes or download URLs`);
  if (summary.unsupported) console.log(`Skipped ${summary.unsupported} unsupported file(s)`);
  console.log(`Output: ${summary.outputDir}`);
}
