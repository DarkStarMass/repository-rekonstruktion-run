export type RepoFile = {
  path: string;
  size: number;
  type: string;
  encoding: "text" | "binary";
  content?: string;
};

export type RepoManifest = {
  repository_reference: string;
  generated_at: string;
  source: string;
  branch?: string;
  files: Array<{
    path: string;
    size_bytes: number;
    type: string;
    encoding: "text" | "binary";
    content?: string;
  }>;
  summary: {
    file_count: number;
    total_bytes: number;
    text_files: number;
    binary_files: number;
  };
};

export type AiModel = "Gemini" | "Claude" | "Grok" | "TeraAI";

export const MODEL_SPECS: Record<
  AiModel,
  { limit: number; instruction: string }
> = {
  Gemini: {
    limit: 900_000,
    instruction:
      "Work analytically. State assumptions clearly and deliver concrete file-level changes.",
  },
  Claude: {
    limit: 180_000,
    instruction:
      "Analyze architecture first. Preserve context, justify decisions, and deliver precise patches.",
  },
  Grok: {
    limit: 120_000,
    instruction:
      "Be direct and technical. Identify dependencies, risks, and the fastest reconstruction path.",
  },
  TeraAI: {
    limit: 64_000,
    instruction:
      "Produce a compact, structured reconstruction with clear next steps.",
  },
};

const SKIP_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  "__pycache__",
  ".turbo",
  ".cache",
  "venv",
  ".venv",
  ".idea",
  ".vscode",
  "__MACOSX",
]);

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|bmp|svgz|pdf|zip|gz|tgz|tar|woff2?|ttf|otf|eot|mp3|mp4|webm|mov|avi|mkv|exe|dll|so|dylib|wasm|class|o|obj|bin|dmg|iso|7z|rar|psd|ai|sketch|fig|lockb|pyc|pyo|whl)$/i;

const TEXT_EXT =
  /\.(md|txt|json|jsonc|js|jsx|ts|tsx|mjs|cjs|css|scss|html|htm|xml|yml|yaml|toml|ini|cfg|py|rs|go|java|kt|c|h|cpp|hpp|cs|php|rb|sh|bash|zsh|sql|graphql|vue|svelte|astro|env|dockerfile|gitignore|editorconfig|prettierrc|eslintrc|babelrc)$/i;

const MAX_FILE_CONTENT = 180_000;
const MAX_FILES_WITH_CONTENT = 80;
const MAX_TOTAL_CONTENT = 1_600_000;

export function shouldSkipPath(path: string): boolean {
  return path.split("/").some((seg) => SKIP_SEGMENTS.has(seg) || seg === ".DS_Store");
}

export function slugify(text: string): string {
  return (
    (text || "repository")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "repository"
  );
}

export function formatBytes(value: number): string {
  if (!value) return "0 KB";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export function parseGithubUrl(
  raw: string,
): { owner: string; repo: string } | null {
  const value = raw.trim();
  const match = value.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i,
  );
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "").replace(/\/$/, "");
  if (!owner || !repo || owner === "." || repo === ".") return null;
  return { owner, repo };
}

function isBinaryPath(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  if (BINARY_EXT.test(name)) return true;
  if (TEXT_EXT.test(name)) return false;
  if (!name.includes(".")) return false;
  return false;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 800);
  if (n === 0) return true;
  let weird = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 9 && b !== 7) weird += 1;
  }
  return weird / n < 0.08;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function mimeFor(path: string): string {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    ts: "text/typescript",
    tsx: "text/tsx",
    js: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    py: "text/x-python",
    css: "text/css",
    html: "text/html",
    yml: "text/yaml",
    yaml: "text/yaml",
  };
  return map[ext] || "text/plain";
}

export function buildManifest(
  files: RepoFile[],
  reference: string,
  source: string,
  branch?: string,
  includeContent = true,
): RepoManifest {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return {
    repository_reference: reference || "Local folder",
    generated_at: new Date().toISOString(),
    source,
    branch,
    files: files.map((file) => ({
      path: file.path,
      size_bytes: file.size,
      type: file.type || "unknown",
      encoding: file.encoding,
      ...(includeContent && file.encoding === "text" && file.content
        ? { content: file.content }
        : {}),
    })),
    summary: {
      file_count: files.length,
      total_bytes: total,
      text_files: files.filter((f) => f.encoding === "text").length,
      binary_files: files.filter((f) => f.encoding === "binary").length,
    },
  };
}

function attachContent(files: RepoFile[]): RepoFile[] {
  const ranked = [...files].sort((a, b) => {
    const score = (path: string) => {
      const name = path.toLowerCase();
      if (/^readme/i.test(path.split("/").pop() ?? "")) return 0;
      if (name.endsWith("package.json") || name.endsWith("pyproject.toml")) return 1;
      if (name.includes("/src/")) return 2;
      return 3;
    };
    return score(a.path) - score(b.path) || a.size - b.size;
  });
  let used = 0;
  let filled = 0;
  const allow = new Set<string>();
  for (const file of ranked) {
    if (file.encoding !== "text" || !file.content) continue;
    if (filled >= MAX_FILES_WITH_CONTENT) break;
    if (file.content.length > MAX_FILE_CONTENT) continue;
    if (used + file.content.length > MAX_TOTAL_CONTENT) continue;
    allow.add(file.path);
    used += file.content.length;
    filled += 1;
  }
  return files.map((file) =>
    allow.has(file.path) ? file : { ...file, content: undefined },
  );
}

const SAMPLE_README = `# spice-rack

Sample workspace used by Repository, Rekonstruktion, Run.

## Layout
- \`src/index.ts\` — entry
- \`src/tree.ts\` — folder walk
- \`python/reconstruct.py\` — reconstruction helper
`;

const SAMPLE_INDEX = `import { walk } from "./tree";

export function describe(root: string) {
  return walk(root).length;
}
`;

const SAMPLE_TREE = `export type Node = { path: string; size: number };

export function walk(root: string): Node[] {
  return [{ path: root + "/README.md", size: 240 }];
}
`;

const SAMPLE_PY = `from pathlib import Path

def describe_repository(root: str) -> dict:
    files = list(Path(root).rglob("*"))
    return {"files": len([f for f in files if f.is_file()]), "root": root}

if __name__ == "__main__":
    print(describe_repository("."))
`;

export function sampleFiles(): RepoFile[] {
  const items: Array<{ path: string; content: string; type: string }> = [
    { path: "README.md", content: SAMPLE_README, type: "text/markdown" },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "spice-rack",
          private: true,
          type: "module",
          scripts: { start: "node src/index.ts" },
        },
        null,
        2,
      ) + "\n",
      type: "application/json",
    },
    { path: "src/index.ts", content: SAMPLE_INDEX, type: "text/typescript" },
    { path: "src/tree.ts", content: SAMPLE_TREE, type: "text/typescript" },
    { path: "python/reconstruct.py", content: SAMPLE_PY, type: "text/x-python" },
    {
      path: "docs/architecture.md",
      content:
        "# Architecture\n\nClient-only reconstruction pipeline.\nImport → structure → export (HTML / JSON / Python / AI text).\n",
      type: "text/markdown",
    },
  ];
  return items.map((item) => ({
    path: item.path,
    size: new Blob([item.content]).size,
    type: item.type,
    encoding: "text" as const,
    content: item.content,
  }));
}

export async function readFolderFiles(fileList: FileList | File[]): Promise<RepoFile[]> {
  const incoming = [...fileList];
  const collected: RepoFile[] = [];
  for (const file of incoming) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (shouldSkipPath(path)) continue;
    const binary = isBinaryPath(path);
    let encoding: "text" | "binary" = binary ? "binary" : "text";
    let content: string | undefined;
    if (!binary && file.size <= MAX_FILE_CONTENT) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        if (looksLikeText(buf)) content = decodeText(buf);
        else encoding = "binary";
      } catch {
        encoding = "binary";
      }
    } else if (!binary && file.size > MAX_FILE_CONTENT) {
      encoding = "text";
    }
    collected.push({
      path,
      size: file.size,
      type: file.type || mimeFor(path),
      encoding,
      content,
    });
  }
  return attachContent(collected.sort((a, b) => a.path.localeCompare(b.path)));
}

export async function readZipFiles(file: File): Promise<RepoFile[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const collected: RepoFile[] = [];
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const path = entry.name.replace(/^\/+/, "");
    if (shouldSkipPath(path)) continue;
    const bytes = await entry.async("uint8array");
    const binary = isBinaryPath(path) || !looksLikeText(bytes);
    collected.push({
      path,
      size: bytes.byteLength,
      type: mimeFor(path),
      encoding: binary ? "binary" : "text",
      content: binary || bytes.byteLength > MAX_FILE_CONTENT ? undefined : decodeText(bytes),
    });
  }
  return attachContent(collected.sort((a, b) => a.path.localeCompare(b.path)));
}

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Repository not found or private.");
    }
    if (response.status === 403) {
      throw new Error("GitHub rate limit reached. Try again later or use a local folder.");
    }
    throw new Error(`GitHub API ${response.status}`);
  }
  return (await response.json()) as T;
}

type GithubRepo = {
  full_name: string;
  default_branch: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
};

type GithubTree = {
  truncated: boolean;
  tree: Array<{ path: string; type: string; size?: number; url: string }>;
};

export type GithubImport = {
  files: RepoFile[];
  reference: string;
  branch: string;
  name: string;
  description: string;
  truncated: boolean;
};

export async function fetchGithubRepo(
  rawUrl: string,
  onProgress?: (message: string) => void,
): Promise<GithubImport> {
  const parsed = parseGithubUrl(rawUrl);
  if (!parsed) throw new Error("Invalid GitHub URL");
  onProgress?.("Fetching repository metadata…");
  const repo = await githubJson<GithubRepo>(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
  );
  const branch = repo.default_branch || "main";
  onProgress?.("Fetching file tree…");
  const tree = await githubJson<GithubTree>(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const blobs = tree.tree.filter(
    (item) => item.type === "blob" && item.path && !shouldSkipPath(item.path),
  );
  const files: RepoFile[] = blobs.map((item) => ({
    path: item.path,
    size: item.size ?? 0,
    type: mimeFor(item.path),
    encoding: isBinaryPath(item.path) ? "binary" : "text",
  }));

  const candidates = files
    .filter((f) => f.encoding === "text" && f.size > 0 && f.size <= MAX_FILE_CONTENT)
    .sort((a, b) => {
      const rank = (p: string) => {
        const n = p.toLowerCase();
        if (n.split("/").pop()?.startsWith("readme")) return 0;
        if (n.endsWith("package.json") || n.endsWith("pyproject.toml")) return 1;
        return 2;
      };
      return rank(a.path) - rank(b.path) || a.size - b.size;
    })
    .slice(0, MAX_FILES_WITH_CONTENT);

  onProgress?.("Fetching file contents…");
  let used = 0;
  const queue = [...candidates];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      if (used >= MAX_TOTAL_CONTENT) break;
      const raw = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(branch)}/${next.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      try {
        const res = await fetch(raw);
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!looksLikeText(buf)) {
          next.encoding = "binary";
          continue;
        }
        const text = decodeText(buf);
        if (used + text.length > MAX_TOTAL_CONTENT) continue;
        next.content = text;
        used += text.length;
      } catch {
        /* skip unreadable blob */
      }
    }
  });
  await Promise.all(workers);

  return {
    files: attachContent(files.sort((a, b) => a.path.localeCompare(b.path))),
    reference: repo.html_url,
    branch,
    name: repo.full_name,
    description: repo.description || "",
    truncated: Boolean(tree.truncated),
  };
}

function escapeHtml(value: string): string {
  return Array.from(value, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    if (ch === '"') return "\u0026quot;";
    if (ch === "'") return "\u0026#039;";
    return ch;
  }).join("");
}

function treeAscii(files: RepoFile[]): string {
  return files
    .slice(0, 400)
    .map((f) => `${f.path}  (${formatBytes(f.size)})`)
    .join("\n");
}

export function htmlSkeleton(files: RepoFile[], reference: string, name: string): string {
  const project = slugify(name || reference.split("/").pop() || "local-repository");
  const rows = files
    .slice(0, 250)
    .map((file) => {
      const body =
        file.encoding === "text" && file.content
          ? `<pre>${escapeHtml(file.content.slice(0, 12_000))}</pre>`
          : `<p class="muted">${file.encoding === "binary" ? "binary" : "no preview"} · ${formatBytes(file.size)}</p>`;
      return `<article id="${escapeHtml(file.path)}"><h2>${escapeHtml(file.path)}</h2>${body}</article>`;
    })
    .join("\n");
  const links = files
    .slice(0, 250)
    .map((f) => `<li><a href="#${escapeHtml(f.path)}">${escapeHtml(f.path)}</a> <span>${formatBytes(f.size)}</span></li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project)} — reconstructed</title>
  <style>
    :root { --ink:#17202a; --paper:#f3f0e8; --signal:#e7542f; --muted:#66706b; }
    body { margin:0; font: 16px/1.5 "Fira Sans", sans-serif; background:var(--paper); color:var(--ink); }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px 80px; }
    h1 { font-size: 2rem; letter-spacing: -0.03em; }
    a { color: var(--signal); }
    .muted { color: var(--muted); }
    pre { background:#1b242c; color:#d9e3da; padding:16px; overflow:auto; white-space:pre-wrap; }
    li { display:flex; justify-content:space-between; gap:12px; padding:6px 0; border-bottom:1px dashed #d8d4ca; font-family: ui-monospace, monospace; font-size:13px; }
    article { margin-top: 40px; }
  </style>
</head>
<body>
  <main>
    <p class="muted">Reconstructed by Repository, Rekonstruktion, Run</p>
    <h1>${escapeHtml(project)}</h1>
    <p>${escapeHtml(reference || "Local folder")} · ${files.length} files</p>
    <h2>Tree</h2>
    <ul>${links}</ul>
    ${rows}
  </main>
</body>
</html>`;
}

export function pythonSkeleton(files: RepoFile[], reference: string, source: string): string {
  const manifest = buildManifest(files, reference, source, undefined, false);
  const paths =
    files.slice(0, 40).map((file) => `# - ${file.path}`).join("\n") ||
    "# No files imported yet.";
  return `"""Rekonstruktions-Startpunkt.
Created by Repository, Rekonstruktion, Run.
"""

PROJECT_MANIFEST = ${JSON.stringify(manifest, null, 2)}


def describe_repository():
    return {
        "files": len(PROJECT_MANIFEST["files"]),
        "reference": PROJECT_MANIFEST["repository_reference"],
        "source": PROJECT_MANIFEST["source"],
    }


def print_tree():
    for item in PROJECT_MANIFEST["files"]:
        print(f"{item['path']}  ({item['size_bytes']} bytes)")


if __name__ == "__main__":
    print(describe_repository())
    print_tree()

# Detected paths
${paths}
`;
}

export function buildAiPrompt(
  files: RepoFile[],
  reference: string,
  model: AiModel,
): { text: string; chunks: string[]; estimatedTokens: number; limit: number } {
  const spec = MODEL_SPECS[model];
  const entries =
    files.map((file) => `- \`${file.path}\` (${formatBytes(file.size)})`).join("\n") ||
    "- No local files selected yet.";
  const bodies = files
    .filter((f) => f.encoding === "text" && f.content)
    .map(
      (f) =>
        `### ${f.path}\n\n\`\`\`\n${f.content!.slice(0, 8_000)}\n\`\`\``,
    )
    .join("\n\n");
  const header = `# Repository reconstruction for ${model}

## System instruction
${spec.instruction}

## Context
Repository reference: ${reference || "Local folder"}
Files: ${files.length}

## File tree
${entries}

## Task
Analyse this repository structure. Explain architecture, dependencies and missing core modules. Then produce a prioritised reconstruction plan and use compatible Markdown code blocks for every code proposal.
`;
  const manifestBlock = `\n## Manifest\n\n\`\`\`json\n${JSON.stringify(buildManifest(files, reference, "client", undefined, false), null, 2)}\n\`\`\`\n`;
  const text = `${header}${bodies ? `\n## File contents\n\n${bodies}\n` : ""}${manifestBlock}`;
  const estimatedTokens = Math.ceil(text.length / 4);
  const budget = Math.max(2000, Math.floor(spec.limit * 0.72) * 4);
  const chunks: string[] = [];
  if (text.length <= budget) {
    chunks.push(text);
  } else {
    const prefix = `${header}\n> Chunked export. Continue from the previous chunk without repeating the system instruction unless needed.\n\n`;
    const rest = `${bodies}\n${manifestBlock}`;
    let offset = 0;
    let index = 1;
    const piece = Math.max(4000, budget - prefix.length - 80);
    while (offset < rest.length) {
      chunks.push(
        `${prefix}## Chunk ${index}\n\n${rest.slice(offset, offset + piece)}`,
      );
      offset += piece;
      index += 1;
    }
  }
  return { text, chunks, estimatedTokens, limit: spec.limit };
}

export function triggerDownload(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

export async function exportZip(
  kind: "html" | "json" | "python",
  files: RepoFile[],
  reference: string,
  source: string,
): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const name = slugify(reference.split("/").pop() || "repository-rekonstruktion");
  const manifest = buildManifest(files, reference, source, undefined, false);
  zip.file("repository-manifest.json", JSON.stringify(manifest, null, 2));
  if (kind === "html") {
    zip.file("index.html", htmlSkeleton(files, reference, name));
    const folder = zip.folder("files");
    for (const file of files) {
      if (file.encoding === "text" && file.content && folder) {
        folder.file(file.path, file.content);
      }
    }
  }
  if (kind === "json") {
    zip.file("repository.json", JSON.stringify(buildManifest(files, reference, source, undefined, true), null, 2));
  }
  if (kind === "python") {
    zip.file("main.py", pythonSkeleton(files, reference, source));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${name}-${kind}.zip`);
  return `${name}-${kind}.zip`;
}

export async function exportAiChunks(model: AiModel, chunks: string[]): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  chunks.forEach((chunk, i) => {
    zip.file(`${slugify(model)}-chunk-${String(i + 1).padStart(2, "0")}.txt`, chunk);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${slugify(model)}-repository-prompt.zip`);
}

export function treePreview(files: RepoFile[], limit = 8): RepoFile[] {
  return files.slice(0, limit);
}

export { treeAscii };
