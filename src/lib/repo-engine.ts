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

/** Reviewed against published context windows. Override per browser in the AI view. */
export const MODEL_SPECS_AS_OF = "2026-10-18";

export const MODEL_SPECS: Record<AiModel, { limit: number; instruction: string }> = {
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
    instruction: "Produce a compact, structured reconstruction with clear next steps.",
  },
};

export type ModelLimitOverrides = Partial<Record<AiModel, number>>;

export function modelLimit(model: AiModel, overrides?: ModelLimitOverrides): number {
  const custom = overrides?.[model];
  if (typeof custom === "number" && Number.isFinite(custom) && custom >= 1_000) {
    return Math.floor(custom);
  }
  return MODEL_SPECS[model].limit;
}

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
export const PROMPT_FILE_CAP = 8_000;

export const ZIP_LIMITS = {
  maxFiles: 400,
  maxTotalBytes: 12 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024,
} as const;

export class EngineError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message || code);
    this.name = "EngineError";
    this.code = code;
  }
}

export function assertZipBudget(count: number, totalBytes: number, entryBytes: number): void {
  if (entryBytes > ZIP_LIMITS.maxEntryBytes) throw new EngineError("zip-entry");
  if (count >= ZIP_LIMITS.maxFiles) throw new EngineError("zip-files");
  if (totalBytes + Math.max(0, entryBytes) > ZIP_LIMITS.maxTotalBytes) {
    throw new EngineError("zip-bytes");
  }
}

const SECRET_NAME =
  /(?:^|\/)(?:\.env(?:\.[^/]*)?|.*\.(?:pem|p12|pfx|keystore)$|(?:id_rsa|id_ed25519|id_dsa|id_ecdsa)(?:\.pub)?$|credentials\.json|secrets?\.(?:json|ya?ml|toml|txt)$|service-account.*\.json|\.npmrc|\.pypirc|\.netrc|\.aws\/credentials|\.kube\/config)$/i;

const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "private-key", re: /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/ },
  { label: "github-token", re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "google-api-key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { label: "openai-style-key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  {
    label: "secret-assignment",
    re: /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  },
];

export type SecretHit = {
  path: string;
  kind: "filename" | "pattern";
  label: string;
};

export function scanSecrets(files: RepoFile[]): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const file of files) {
    if (SECRET_NAME.test(file.path)) {
      hits.push({ path: file.path, kind: "filename", label: "filename" });
      continue;
    }
    if (!file.content) continue;
    const sample = file.content.slice(0, 200_000);
    for (const rule of SECRET_PATTERNS) {
      if (rule.re.test(sample)) {
        hits.push({ path: file.path, kind: "pattern", label: rule.label });
        break;
      }
    }
  }
  return hits;
}

/** Drop likely secrets unless the visitor explicitly opts in. */
export function filesForExport(files: RepoFile[], includeSecrets = false): RepoFile[] {
  if (includeSecrets) return files;
  const blocked = new Set(scanSecrets(files).map((hit) => hit.path));
  return files.filter((file) => !blocked.has(file.path));
}

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

export type GithubLocation = {
  owner: string;
  repo: string;
  mode: "root" | "tree" | "blob";
  hint?: string;
};

export function parseGithubUrl(raw: string): GithubLocation | null {
  const value = raw.trim();
  const match = value.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/(tree|blob)\/([^?#]+))?(?:[?#].*)?$/i,
  );
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  if (!owner || !repo || owner === "." || repo === ".") return null;
  const mode = (match[3]?.toLowerCase() as "tree" | "blob" | undefined) ?? "root";
  const hint = match[4] ? safeDecode(match[4]).replace(/\/+$/, "") : undefined;
  return { owner, repo, mode, hint: hint || undefined };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function splitGithubHint(
  defaultBranch: string,
  hint: string | undefined,
  mode: GithubLocation["mode"],
): { branch: string; subdir: string; filePath?: string } | null {
  const branch = defaultBranch || "main";
  if (!hint || mode === "root") return { branch, subdir: "" };
  if (hint === branch || hint.startsWith(`${branch}/`)) {
    const rest = hint === branch ? "" : hint.slice(branch.length + 1);
    return mode === "blob" ? blobSplit(branch, rest) : { branch, subdir: rest };
  }
  const first = hint.split("/")[0] ?? "";
  if (/^[0-9a-f]{7,40}$/i.test(first)) {
    const rest = hint.split("/").slice(1).join("/");
    return mode === "blob" ? blobSplit(first, rest) : { branch: first, subdir: rest };
  }
  return null;
}

function blobSplit(branch: string, rest: string): { branch: string; subdir: string; filePath?: string } {
  const parts = rest.split("/").filter(Boolean);
  const file = parts[parts.length - 1];
  return {
    branch,
    subdir: parts.slice(0, -1).join("/"),
    filePath: file ? parts.join("/") : undefined,
  };
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
  return files.map((file) => (allow.has(file.path) ? file : { ...file, content: undefined }));
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
      content:
        JSON.stringify(
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
    const path =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
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

type ZipEntry = {
  dir: boolean;
  name: string;
  uncompressedSize?: number;
  async: (type: "uint8array") => Promise<Uint8Array>;
};

export async function readZipFiles(file: File): Promise<RepoFile[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const collected: RepoFile[] = [];
  let total = 0;
  const entries = Object.values(zip.files) as ZipEntry[];
  for (const entry of entries) {
    if (entry.dir) continue;
    const path = entry.name.replace(/^\/+/, "");
    if (shouldSkipPath(path)) continue;
    const declared = entry.uncompressedSize ?? 0;
    assertZipBudget(collected.length, total, declared || 0);
    if (!declared && file.size > ZIP_LIMITS.maxTotalBytes) {
      throw new EngineError("zip-bytes");
    }
    const bytes = await entry.async("uint8array");
    if (!declared) assertZipBudget(collected.length, total, bytes.byteLength);
    if (bytes.byteLength > ZIP_LIMITS.maxEntryBytes) throw new EngineError("zip-entry");
    total += bytes.byteLength;
    if (total > ZIP_LIMITS.maxTotalBytes) throw new EngineError("zip-bytes");
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

function githubHeaders(token?: string, accept?: string): Headers {
  const headers = new Headers({
    Accept: accept || "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const trimmed = token?.trim();
  if (trimmed) headers.set("Authorization", `Bearer ${trimmed}`);
  return headers;
}

async function githubFailure(response: Response): Promise<EngineError> {
  if (response.status === 401) return new EngineError("github-auth", "GitHub token was rejected.");
  if (response.status === 403 || response.status === 429) {
    return new EngineError(
      "github-rate",
      "GitHub rate limit reached. Add a token or use a local folder.",
    );
  }
  if (response.status === 404) {
    return new EngineError("github-missing", "Repository not found or private.");
  }
  return new EngineError("github-status", `GitHub API ${response.status}`);
}

async function githubJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (!response.ok) throw await githubFailure(response);
  return (await response.json()) as T;
}

type GithubRepo = {
  full_name: string;
  default_branch: string;
  description: string | null;
  html_url: string;
};

type GithubTree = {
  truncated: boolean;
  tree: Array<{ path: string; type: string; size?: number }>;
};

export type GithubImport = {
  files: RepoFile[];
  reference: string;
  branch: string;
  subdir: string;
  name: string;
  description: string;
  truncated: boolean;
};

async function loadTree(
  owner: string,
  repo: string,
  ref: string,
  token?: string,
): Promise<GithubTree | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) throw await githubFailure(response);
  return (await response.json()) as GithubTree;
}

export async function fetchGithubRepo(
  rawUrl: string,
  onProgress?: (message: string) => void,
  options?: { token?: string },
): Promise<GithubImport> {
  const parsed = parseGithubUrl(rawUrl);
  if (!parsed) throw new EngineError("github-url", "Invalid GitHub URL");
  const token = options?.token;
  onProgress?.("Fetching repository metadata…");
  const repo = await githubJson<GithubRepo>(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
    token,
  );
  const defaultBranch = repo.default_branch || "main";
  let resolved = splitGithubHint(defaultBranch, parsed.hint, parsed.mode);
  onProgress?.("Fetching file tree…");
  let tree: GithubTree | null = null;
  if (resolved) {
    tree = await loadTree(parsed.owner, parsed.repo, resolved.branch, token);
    if (!tree) throw new EngineError("github-missing", "Branch or path was not found.");
  } else {
    const parts = (parsed.hint ?? "").split("/").filter(Boolean);
    const attempts = Math.min(parts.length, 6);
    for (let i = attempts; i >= 1; i -= 1) {
      const branch = parts.slice(0, i).join("/");
      const rest = parts.slice(i).join("/");
      const found = await loadTree(parsed.owner, parsed.repo, branch, token);
      if (!found) continue;
      tree = found;
      resolved =
        parsed.mode === "blob" ? blobSplit(branch, rest) : { branch, subdir: rest };
      break;
    }
    if (!resolved || !tree) {
      throw new EngineError("github-missing", "Branch or path was not found.");
    }
  }
  const location = resolved;
  if (!location || !tree) {
    throw new EngineError("github-missing", "Branch or path was not found.");
  }

  const blobs = tree.tree.filter(
    (item) => item.type === "blob" && item.path && !shouldSkipPath(item.path),
  );
  let files: RepoFile[] = blobs.map((item) => ({
    path: item.path,
    size: item.size ?? 0,
    type: mimeFor(item.path),
    encoding: isBinaryPath(item.path) ? "binary" : "text",
  }));
  if (location.filePath) {
    files = files.filter((file) => file.path === location.filePath);
  } else if (location.subdir) {
    const prefix = `${location.subdir.replace(/\/$/, "")}/`;
    files = files.filter((file) => file.path === location.subdir || file.path.startsWith(prefix));
  }
  if (!files.length) throw new EngineError("empty-path", "No files under that GitHub path.");

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
      try {
        const buf = await fetchGithubBlob(
          parsed.owner,
          parsed.repo,
          location.branch,
          next.path,
          token,
        );
        if (!buf) continue;
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
    branch: location.branch,
    subdir: location.subdir,
    name: repo.full_name,
    description: repo.description || "",
    truncated: Boolean(tree.truncated),
  };
}

async function fetchGithubBlob(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token?: string,
): Promise<Uint8Array | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  if (token?.trim()) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
    const response = await fetch(url, {
      headers: githubHeaders(token, "application/vnd.github.raw"),
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`;
  const response = await fetch(raw);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
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

/** HTML5 ids cannot contain spaces. Percent-encoding keeps the anchor stable. */
export function htmlAnchorId(path: string): string {
  return encodeURIComponent(path);
}

function treeAscii(files: RepoFile[]): string {
  return files
    .slice(0, 400)
    .map((f) => `${f.path}  (${formatBytes(f.size)})`)
    .join("\n");
}

export function htmlSkeleton(files: RepoFile[], reference: string, name: string): string {
  const project = slugify(name || reference.split("/").pop() || "local-repository");
  const shown = files.slice(0, 250);
  const rows = shown
    .map((file) => {
      const id = escapeHtml(htmlAnchorId(file.path));
      const body =
        file.encoding === "text" && file.content
          ? `<pre>${escapeHtml(file.content.slice(0, 12_000))}${
              file.content.length > 12_000
                ? `\n\n[truncated: showing 12000 of ${file.content.length} characters]`
                : ""
            }</pre>`
          : `<p class="muted">${file.encoding === "binary" ? "binary" : "no preview"} · ${formatBytes(file.size)}</p>`;
      return `<article id="${id}"><h2>${escapeHtml(file.path)}</h2>${body}</article>`;
    })
    .join("\n");
  const links = shown
    .map((file) => {
      const id = escapeHtml(htmlAnchorId(file.path));
      return `<li><a href="#${id}">${escapeHtml(file.path)}</a> <span>${formatBytes(file.size)}</span></li>`;
    })
    .join("\n");
  const overflow =
    files.length > shown.length
      ? `<p class="muted">Showing ${shown.length} of ${files.length} files.</p>`
      : "";
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
    ${overflow}
    <ul>${links}</ul>
    ${rows}
  </main>
</body>
</html>`;
}

export function pythonSkeleton(
  files: RepoFile[],
  reference: string,
  source: string,
  options?: { embedContents?: boolean; branch?: string },
): string {
  const manifest = buildManifest(files, reference, source, options?.branch, false);
  const paths =
    files.slice(0, 40).map((file) => `# - ${file.path}`).join("\n") || "# No files imported yet.";
  const embedded = options?.embedContents
    ? `\nFILE_CONTENTS = ${JSON.stringify(
        Object.fromEntries(
          files
            .filter((file) => file.encoding === "text" && file.content)
            .map((file) => [file.path, file.content as string]),
        ),
        null,
        2,
      )}\n`
    : "";
  return `"""Rekonstruktions-Startpunkt.
Created by Repository, Rekonstruktion, Run.
File contents are embedded only when that export option is on.
"""

PROJECT_MANIFEST = ${JSON.stringify(manifest, null, 2)}
${embedded}

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

function promptFileBlock(file: RepoFile): string | null {
  if (file.encoding !== "text" || !file.content) return null;
  const fullLength = file.content.length;
  const truncated = fullLength > PROMPT_FILE_CAP;
  const body = truncated ? file.content.slice(0, PROMPT_FILE_CAP) : file.content;
  const note = truncated
    ? `\n\n[truncated: showing ${PROMPT_FILE_CAP} of ${fullLength} characters]`
    : "";
  return `### ${file.path}\n\n\`\`\`\n${body}${note}\n\`\`\``;
}

export function buildAiPrompt(
  files: RepoFile[],
  reference: string,
  model: AiModel,
  overrides?: ModelLimitOverrides,
): { text: string; chunks: string[]; estimatedTokens: number; limit: number } {
  const spec = MODEL_SPECS[model];
  const limit = modelLimit(model, overrides);
  const budget = Math.max(2_000, Math.floor(limit * 0.72) * 4);
  const entries =
    files.map((file) => `- \`${file.path}\` (${formatBytes(file.size)})`).join("\n") ||
    "- No local files selected yet.";
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
  const blocks = files
    .map(promptFileBlock)
    .filter((block): block is string => Boolean(block));
  const manifestBlock = `\n## Manifest\n\n\`\`\`json\n${JSON.stringify(buildManifest(files, reference, "client", undefined, false), null, 2)}\n\`\`\`\n`;
  const single = `${header}${blocks.length ? `\n## File contents\n\n${blocks.join("\n\n")}\n` : ""}${manifestBlock}`;
  if (single.length <= budget) {
    const estimatedTokens = Math.ceil(single.length / 4);
    return { text: single, chunks: [single], estimatedTokens, limit };
  }

  const chunks: string[] = [];
  const continuation = `# Continuation for ${model}

> Continuation chunk. The system instruction and file tree appear only in chunk 1.
`;
  let current = `${header}\n## File contents\n\n`;
  let started = false;
  const flush = () => {
    const trimmed = current.trimEnd();
    if (trimmed) chunks.push(trimmed);
  };

  for (const block of blocks) {
    const addition = `${started ? "\n\n" : ""}${block}`;
    if (started && current.length + addition.length > budget) {
      flush();
      current = `${continuation}\n## File contents\n\n${block}`;
      started = true;
    } else {
      current += addition;
      started = true;
    }
  }

  const withManifest = `${current.trimEnd()}${manifestBlock}`;
  if (withManifest.length <= budget) {
    current = withManifest;
    flush();
  } else {
    if (current.trim() && current.trim() !== continuation.trim()) flush();
    chunks.push(`${continuation.trimEnd()}${manifestBlock}`.trimEnd());
  }

  const stamped = chunks.map(
    (chunk, index) => `<!-- chunk ${index + 1}/${chunks.length} -->\n${chunk}`,
  );
  const text = stamped.join("\n\n---\n\n");
  return {
    text,
    chunks: stamped,
    estimatedTokens: Math.ceil(text.length / 4),
    limit,
  };
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

export type ExportOptions = {
  includeSecrets?: boolean;
  embedContents?: boolean;
  branch?: string;
};

export async function exportZip(
  kind: "html" | "json" | "python",
  files: RepoFile[],
  reference: string,
  source: string,
  options?: ExportOptions,
): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const safe = filesForExport(files, options?.includeSecrets);
  const name = slugify(reference.split("/").pop() || "repository-rekonstruktion");
  const manifest = buildManifest(safe, reference, source, options?.branch, false);
  zip.file("repository-manifest.json", JSON.stringify(manifest, null, 2));
  if (kind === "html") {
    zip.file("index.html", htmlSkeleton(safe, reference, name));
    const folder = zip.folder("files");
    for (const file of safe) {
      if (file.encoding === "text" && file.content && folder) {
        folder.file(file.path, file.content);
      }
    }
  }
  if (kind === "json") {
    zip.file(
      "repository.json",
      JSON.stringify(buildManifest(safe, reference, source, options?.branch, true), null, 2),
    );
  }
  if (kind === "python") {
    zip.file(
      "main.py",
      pythonSkeleton(safe, reference, source, {
        embedContents: options?.embedContents,
        branch: options?.branch,
      }),
    );
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
