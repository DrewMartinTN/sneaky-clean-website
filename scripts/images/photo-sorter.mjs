import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const IMAGE_EXTENSIONS = new Set([".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v"]);
const DEFAULT_PORT = 8791;

const CATEGORIES = [
  { key: "site-favorites", label: "Site Favorites", shortcut: "1" },
  { key: "before", label: "Before", shortcut: "2" },
  { key: "after", label: "After", shortcut: "3" },
  { key: "interior", label: "Interior", shortcut: "4" },
  { key: "exterior", label: "Exterior", shortcut: "5" },
  { key: "ceramic", label: "Ceramic", shortcut: "6" },
  { key: "motorcycle", label: "Motorcycle", shortcut: "7" },
  { key: "needs-edit", label: "Needs Edit", shortcut: "8" },
  { key: "archive", label: "Archive", shortcut: "9" },
];

const args = process.argv.slice(2);
const sourceArg = args.find((arg) => !arg.startsWith("--"));
const outputArg = args.filter((arg) => !arg.startsWith("--"))[1];
const portArg = args.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : DEFAULT_PORT;

if (!sourceArg) {
  console.error("Usage: npm run images:sort -- <source-dir> [output-dir] [--port=8791]");
  process.exit(1);
}

const sourceDir = path.resolve(sourceArg);
const outputDir = path.resolve(outputArg || path.join(sourceDir, "_sneaky-sorted"));
const cacheDir = path.join(outputDir, ".photo-sorter-cache");
const manifestPath = path.join(outputDir, "sort-manifest.csv");

function idFor(relativePath) {
  return Buffer.from(relativePath).toString("base64url");
}

function relativeFor(id) {
  return Buffer.from(id, "base64url").toString("utf8");
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, results = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.name.startsWith(".")) continue;
    if (isInside(absolute, outputDir) || absolute === outputDir) continue;

    if (entry.isDirectory()) {
      await walk(absolute, results);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) continue;

    const stat = await fs.stat(absolute);
    const relativePath = path.relative(sourceDir, absolute);
    results.push({
      id: idFor(relativePath),
      name: entry.name,
      relativePath,
      ext,
      kind: IMAGE_EXTENSIONS.has(ext) ? "image" : "video",
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  return results;
}

function fileFromId(id) {
  const relativePath = relativeFor(id);
  const absolute = path.resolve(sourceDir, relativePath);
  if (absolute !== sourceDir && isInside(absolute, sourceDir)) {
    return { absolute, relativePath };
  }
  throw new Error("Invalid file id");
}

async function sortedCategories(relativePath) {
  const found = [];
  for (const category of CATEGORIES) {
    const sortedPath = path.join(outputDir, category.key, relativePath);
    if (await exists(sortedPath)) found.push(category.key);
  }
  return found;
}

async function filesPayload() {
  const files = await walk(sourceDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));

  return {
    sourceDir,
    outputDir,
    categories: CATEGORIES,
    files: await Promise.all(
      files.map(async (file) => ({
        ...file,
        sortedCategories: await sortedCategories(file.relativePath),
        thumbUrl: file.kind === "image" ? `/thumb/${file.id}.jpg` : "",
        mediaUrl: `/media/${file.id}`,
      })),
    ),
  };
}

async function ensureThumb(id) {
  const { absolute } = fileFromId(id);
  const sourceHash = crypto.createHash("sha1").update(absolute).digest("hex");
  const thumbPath = path.join(cacheDir, `${sourceHash}.jpg`);
  if (await exists(thumbPath)) return thumbPath;

  await fs.mkdir(cacheDir, { recursive: true });
  await run("sips", ["-Z", "1200", "-s", "format", "jpeg", "-s", "formatOptions", "80", absolute, "--out", thumbPath]);
  return thumbPath;
}

async function updateManifest() {
  await fs.mkdir(outputDir, { recursive: true });
  const payload = await filesPayload();
  const rows = ["relative_path,categories,last_updated"];
  for (const file of payload.files) {
    if (!file.sortedCategories.length) continue;
    rows.push(
      [
        csv(file.relativePath),
        csv(file.sortedCategories.join("|")),
        csv(new Date().toISOString()),
      ].join(","),
    );
  }
  await fs.writeFile(manifestPath, `${rows.join("\n")}\n`);
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendFile(res, filePath, type) {
  res.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store",
  });
  fsSync.createReadStream(filePath).pipe(res);
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
}

async function copyToCategory(id, categoryKey) {
  if (!CATEGORIES.some((category) => category.key === categoryKey)) {
    throw new Error("Unknown category");
  }

  const { absolute, relativePath } = fileFromId(id);
  const destination = path.join(outputDir, categoryKey, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(absolute, destination);
  await updateManifest();
  return { relativePath, destination };
}

async function removeFromCategory(id, categoryKey) {
  if (!CATEGORIES.some((category) => category.key === categoryKey)) {
    throw new Error("Unknown category");
  }

  const { relativePath } = fileFromId(id);
  const destination = path.join(outputDir, categoryKey, relativePath);
  if (await exists(destination)) await fs.unlink(destination);
  await updateManifest();
  return { relativePath, destination };
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, pageHtml(), { "content-type": "text/html; charset=utf-8" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/files") {
      sendJson(res, 200, await filesPayload());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/sort") {
      const body = await readJson(req);
      await copyToCategory(body.id, body.category);
      sendJson(res, 200, { ok: true, payload: await filesPayload() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/unsort") {
      const body = await readJson(req);
      await removeFromCategory(body.id, body.category);
      sendJson(res, 200, { ok: true, payload: await filesPayload() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/open-output") {
      await run("open", [outputDir]);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      const id = decodeURIComponent(url.pathname.replace("/media/", ""));
      const { absolute } = fileFromId(id);
      sendFile(res, absolute, contentType(absolute));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/thumb/")) {
      const id = decodeURIComponent(url.pathname.replace("/thumb/", "").replace(/\.jpg$/, ""));
      const thumbPath = await ensureThumb(id);
      sendFile(res, thumbPath, "image/jpeg");
      return;
    }

    send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong" });
  }
}

function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sneaky Clean Photo Sorter</title>
  <style>
    :root {
      --black: #001210;
      --panel: #15191f;
      --panel-2: #1d2229;
      --cream: #f4ffdb;
      --muted: rgba(244, 255, 219, 0.72);
      --line: rgba(244, 255, 219, 0.14);
      --pink: #db0758;
      --teal: #18e1b4;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--black);
      color: var(--cream);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1rem;
      align-items: center;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--line);
      background: rgba(0, 18, 16, 0.94);
      backdrop-filter: blur(14px);
    }

    h1 {
      margin: 0;
      font-family: ui-serif, Georgia, "Times New Roman", serif;
      font-size: clamp(1.5rem, 3vw, 2.4rem);
      letter-spacing: -0.03em;
    }

    .sub {
      margin: 0.15rem 0 0;
      color: var(--muted);
      font-size: 0.85rem;
    }

    .header-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .button {
      min-height: 2.5rem;
      padding: 0.55rem 0.8rem;
      border: 1px solid rgba(24, 225, 180, 0.35);
      border-radius: 0.55rem;
      background: rgba(24, 225, 180, 0.1);
      color: var(--cream);
      font-weight: 800;
    }

    .button--hot {
      border-color: rgba(219, 7, 88, 0.55);
      background: linear-gradient(135deg, var(--pink), #b9064a);
      color: white;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
      gap: 1rem;
      padding: 1rem;
    }

    .toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 170px 170px;
      gap: 0.65rem;
      margin-bottom: 1rem;
    }

    .toolbar input,
    .toolbar select {
      min-height: 2.5rem;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 0.55rem;
      background: var(--panel);
      color: var(--cream);
      padding: 0 0.75rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 0.75rem;
    }

    .thumb {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 0.75rem;
      background: var(--panel);
      color: inherit;
      padding: 0;
      text-align: left;
    }

    .thumb.is-selected {
      border-color: var(--teal);
      box-shadow: 0 0 0 2px rgba(24, 225, 180, 0.18);
    }

    .thumb img,
    .video-tile {
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: #091d1a;
    }

    .video-tile {
      display: grid;
      place-items: center;
      color: var(--teal);
      font-weight: 900;
    }

    .thumb-body {
      padding: 0.65rem;
    }

    .thumb-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 850;
      font-size: 0.82rem;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.45rem;
      min-height: 1.35rem;
    }

    .pill {
      padding: 0.18rem 0.4rem;
      border: 1px solid rgba(24, 225, 180, 0.32);
      border-radius: 999px;
      color: var(--teal);
      font-size: 0.68rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    aside {
      position: sticky;
      top: 5.2rem;
      align-self: start;
      max-height: calc(100vh - 6.2rem);
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 0.85rem;
      background: linear-gradient(135deg, rgba(21, 25, 31, 0.98), rgba(0, 18, 16, 0.98));
      box-shadow: 0 22px 60px rgba(0, 0, 0, 0.32);
    }

    .preview {
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: contain;
      background: #061816;
      border-bottom: 1px solid var(--line);
    }

    .inspector {
      padding: 1rem;
    }

    .inspector h2 {
      margin: 0 0 0.4rem;
      font-family: ui-serif, Georgia, "Times New Roman", serif;
      font-size: 1.55rem;
      letter-spacing: -0.03em;
      overflow-wrap: anywhere;
    }

    .meta {
      display: grid;
      gap: 0.25rem;
      margin-bottom: 0.85rem;
      color: var(--muted);
      font-size: 0.85rem;
    }

    .category-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    .category-button {
      min-height: 2.65rem;
      border: 1px solid var(--line);
      border-radius: 0.55rem;
      background: rgba(244, 255, 219, 0.045);
      color: var(--cream);
      font-weight: 850;
    }

    .category-button.is-active {
      border-color: rgba(219, 7, 88, 0.65);
      background: rgba(219, 7, 88, 0.18);
    }

    .status {
      min-height: 1.4rem;
      margin-top: 0.85rem;
      color: var(--teal);
      font-size: 0.85rem;
      font-weight: 850;
    }

    .empty {
      padding: 2rem;
      border: 1px solid var(--line);
      border-radius: 0.75rem;
      background: var(--panel);
      color: var(--muted);
    }

    @media (max-width: 980px) {
      header,
      .workspace,
      .toolbar {
        grid-template-columns: 1fr;
      }

      aside {
        position: static;
        max-height: none;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>Sneaky Clean Photo Sorter</h1>
        <p class="sub" id="paths">${escapeHtml(sourceDir)} → ${escapeHtml(outputDir)}</p>
      </div>
      <div class="header-actions">
        <button class="button" id="reload">Reload</button>
        <button class="button button--hot" id="open-output">Output Folder</button>
      </div>
    </header>

    <main class="workspace">
      <section>
        <div class="toolbar">
          <input id="search" type="search" placeholder="Search filename, folder, or tag">
          <select id="filter">
            <option value="">All files</option>
          </select>
          <select id="kind">
            <option value="">Images + video</option>
            <option value="image">Images only</option>
            <option value="video">Video only</option>
          </select>
        </div>
        <div class="grid" id="grid"></div>
      </section>

      <aside>
        <div id="preview-wrap"></div>
        <div class="inspector">
          <h2 id="selected-name">No file selected</h2>
          <div class="meta" id="selected-meta"></div>
          <div class="category-grid" id="category-grid"></div>
          <div class="status" id="status"></div>
        </div>
      </aside>
    </main>
  </div>

  <script>
    const state = {
      files: [],
      categories: [],
      selectedId: null,
      query: "",
      filter: "",
      kind: "",
    };

    const el = (id) => document.getElementById(id);

    function formatBytes(bytes) {
      if (!bytes) return "0 B";
      const units = ["B", "KB", "MB", "GB"];
      const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      return \`\${(bytes / Math.pow(1024, power)).toFixed(power ? 1 : 0)} \${units[power]}\`;
    }

    function fileById(id) {
      return state.files.find((file) => file.id === id);
    }

    async function load() {
      const response = await fetch("/api/files");
      const data = await response.json();
      state.files = data.files;
      state.categories = data.categories;
      if (!state.selectedId && state.files.length) state.selectedId = state.files[0].id;
      if (state.selectedId && !fileById(state.selectedId)) state.selectedId = state.files[0]?.id || null;
      renderFilters();
      render();
    }

    function renderFilters() {
      const filter = el("filter");
      const current = filter.value;
      filter.innerHTML = '<option value="">All files</option>' + state.categories
        .map((category) => \`<option value="\${category.key}">\${category.label}</option>\`)
        .join("");
      filter.value = current;
    }

    function visibleFiles() {
      const query = state.query.toLowerCase();
      return state.files.filter((file) => {
        if (state.kind && file.kind !== state.kind) return false;
        if (state.filter && !file.sortedCategories.includes(state.filter)) return false;
        if (!query) return true;
        return [
          file.name,
          file.relativePath,
          file.ext,
          ...file.sortedCategories,
        ].join(" ").toLowerCase().includes(query);
      });
    }

    function labelFor(key) {
      return state.categories.find((category) => category.key === key)?.label || key;
    }

    function render() {
      const files = visibleFiles();
      const grid = el("grid");
      if (!files.length) {
        grid.innerHTML = '<div class="empty">No matching files.</div>';
      } else {
        grid.innerHTML = files.map((file) => \`
          <button class="thumb \${file.id === state.selectedId ? "is-selected" : ""}" data-id="\${file.id}" type="button">
            \${file.kind === "image"
              ? \`<img src="\${file.thumbUrl}" alt="">\`
              : '<div class="video-tile">VIDEO</div>'}
            <div class="thumb-body">
              <div class="thumb-name" title="\${file.relativePath}">\${file.name}</div>
              <div class="pills">
                \${file.sortedCategories.map((key) => \`<span class="pill">\${labelFor(key)}</span>\`).join("")}
              </div>
            </div>
          </button>
        \`).join("");
      }

      grid.querySelectorAll(".thumb").forEach((button) => {
        button.addEventListener("click", () => {
          state.selectedId = button.dataset.id;
          render();
        });
      });

      renderInspector();
    }

    function renderInspector() {
      const file = fileById(state.selectedId);
      const previewWrap = el("preview-wrap");
      const categoryGrid = el("category-grid");
      const meta = el("selected-meta");

      if (!file) {
        previewWrap.innerHTML = "";
        el("selected-name").textContent = "No file selected";
        meta.innerHTML = "";
        categoryGrid.innerHTML = "";
        return;
      }

      previewWrap.innerHTML = file.kind === "image"
        ? \`<img class="preview" src="\${file.thumbUrl}" alt="">\`
        : \`<video class="preview" src="\${file.mediaUrl}" controls preload="metadata"></video>\`;
      el("selected-name").textContent = file.name;
      meta.innerHTML = \`
        <span>\${file.relativePath}</span>
        <span>\${file.kind.toUpperCase()} · \${file.ext.replace(".", "").toUpperCase()} · \${formatBytes(file.bytes)}</span>
      \`;
      categoryGrid.innerHTML = state.categories.map((category) => {
        const active = file.sortedCategories.includes(category.key);
        const prefix = category.shortcut ? \`\${category.shortcut}. \` : "";
        return \`<button class="category-button \${active ? "is-active" : ""}" data-category="\${category.key}" type="button">\${prefix}\${category.label}</button>\`;
      }).join("");
      categoryGrid.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => toggleCategory(button.dataset.category));
      });
    }

    async function toggleCategory(category) {
      const file = fileById(state.selectedId);
      if (!file) return;
      const active = file.sortedCategories.includes(category);
      el("status").textContent = active ? "Removing..." : "Copying...";
      const response = await fetch(active ? "/api/unsort" : "/api/sort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: file.id, category }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        el("status").textContent = data.error || "Could not update file.";
        return;
      }
      state.files = data.payload.files;
      el("status").textContent = active ? "Removed from folder." : "Copied to folder.";
      render();
    }

    function moveSelection(direction) {
      const files = visibleFiles();
      const index = files.findIndex((file) => file.id === state.selectedId);
      if (index === -1) return;
      const next = files[index + direction];
      if (!next) return;
      state.selectedId = next.id;
      render();
      document.querySelector(\`.thumb[data-id="\${next.id}"]\`)?.scrollIntoView({ block: "nearest" });
    }

    el("search").addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
    });
    el("filter").addEventListener("change", (event) => {
      state.filter = event.target.value;
      render();
    });
    el("kind").addEventListener("change", (event) => {
      state.kind = event.target.value;
      render();
    });
    el("reload").addEventListener("click", load);
    el("open-output").addEventListener("click", async () => {
      await fetch("/api/open-output", { method: "POST" });
      el("status").textContent = "Opened output folder.";
    });

    window.addEventListener("keydown", (event) => {
      if (event.target.matches("input, select, textarea")) return;
      if (event.key === "ArrowRight") moveSelection(1);
      if (event.key === "ArrowLeft") moveSelection(-1);
      const category = state.categories.find((item) => item.shortcut === event.key);
      if (category) toggleCategory(category.key);
    });

    load();
  </script>
</body>
</html>`;
}

await fs.access(sourceDir);
await fs.mkdir(outputDir, { recursive: true });

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.listen(port, () => {
  console.log(`Sneaky Clean Photo Sorter`);
  console.log(`Source: ${sourceDir}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Open: http://localhost:${port}`);
});
