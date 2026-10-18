"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { FolderSearch, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber, t, type Locale } from "@/lib/i18n";
import {
  MODEL_SPECS,
  MODEL_SPECS_AS_OF,
  buildAiPrompt,
  buildManifest,
  exportAiChunks,
  exportZip,
  fetchGithubRepo,
  filesForExport,
  formatBytes,
  htmlSkeleton,
  parseGithubUrl,
  pythonSkeleton,
  readFolderFiles,
  readZipFiles,
  sampleFiles,
  scanSecrets,
  slugify,
  triggerDownload,
  EngineError,
  type AiModel,
  type RepoFile,
} from "@/lib/repo-engine";
import { useAppStore, type ViewId } from "@/lib/store";

function CodePreview({ code, empty }: { code: string; empty: string }) {
  const clipped = code.length > 80_000 ? `${code.slice(0, 80_000)}\n\n…` : code;
  return (
    <pre className="max-h-[min(520px,55vh)] min-h-[210px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-code p-5 font-mono text-xs leading-relaxed text-code-text">
      {clipped || empty}
    </pre>
  );
}

function HelpBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel mt-6 rounded-md bg-sage p-5">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function importMessage(error: unknown, lang: Locale): string {
  const code = error instanceof EngineError ? error.code : "";
  if (code === "zip-files") return t(lang, "import.zipTooMany");
  if (code === "zip-bytes") return t(lang, "import.zipTooBig");
  if (code === "zip-entry") return t(lang, "import.zipEntry");
  if (code === "empty-path") return t(lang, "import.emptyPath");
  const message = error instanceof Error ? error.message : "unknown";
  return t(lang, "import.error", { message });
}

function SecretNotice({ files }: { files: RepoFile[] }) {
  const lang = useAppStore((s) => s.lang);
  const includeSecrets = useAppStore((s) => s.includeSecrets);
  const setIncludeSecrets = useAppStore((s) => s.setIncludeSecrets);
  const hits = useMemo(() => scanSecrets(files), [files]);
  if (!hits.length) return null;
  return (
    <div className="mt-4 rounded-md border border-signal bg-sage p-4" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{t(lang, "secrets.title")}</h3>
        <span className="font-mono text-xs">{t(lang, "secrets.count", { count: hits.length })}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t(lang, "secrets.body")}</p>
      <ul className="mt-3 max-h-36 space-y-1 overflow-auto font-mono text-xs">
        {hits.map((hit) => (
          <li key={`${hit.path}:${hit.label}`}>
            {hit.path} · {t(lang, hit.kind === "filename" ? "secrets.file" : "secrets.pattern")}
          </li>
        ))}
      </ul>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={includeSecrets}
          onChange={(event) => setIncludeSecrets(event.target.checked)}
        />
        {t(lang, "secrets.include")}
      </label>
    </div>
  );
}

export function HomeView() {
  const lang = useAppStore((s) => s.lang);
  const files = useAppStore((s) => s.files);
  const status = useAppStore((s) => s.status);
  const statusDetail = useAppStore((s) => s.statusDetail);
  const githubUrl = useAppStore((s) => s.githubUrl);
  const history = useAppStore((s) => s.history);
  const setGithubUrl = useAppStore((s) => s.setGithubUrl);
  const setStatus = useAppStore((s) => s.setStatus);
  const ingest = useAppStore((s) => s.ingest);
  const addHistory = useAppStore((s) => s.addHistory);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const branch = useAppStore((s) => s.branch);
  const subdir = useAppStore((s) => s.subdir);
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const el = folderRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "true");
    el.setAttribute("directory", "true");
    (el as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
  }, []);

  const total = files.reduce((sum, file) => sum + file.size, 0);

  async function onGithub(event: FormEvent) {
    event.preventDefault();
    const value = githubUrl.trim();
    if (!parseGithubUrl(value)) {
      setStatus("error", t(lang, "import.invalidUrl"));
      return;
    }
    setStatus("loading", t(lang, "import.loading"));
    try {
      const result = await fetchGithubRepo(value, (msg) => setStatus("loading", msg), {
        token,
      });
      ingest({
        files: result.files,
        source: "github",
        repoName: result.name,
        branch: result.branch,
        subdir: result.subdir,
        githubUrl: result.reference,
        detail: result.truncated
          ? t(lang, "import.githubPartial")
          : t(lang, "import.githubOk", { count: result.files.length }),
      });
      addHistory("action.github", "—", "ok");
    } catch (error) {
      setStatus("error", importMessage(error, lang));
      addHistory("action.githubRef", "—", "error");
    }
  }

  async function onFolder(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list?.length) return;
    setStatus("loading", t(lang, "import.loading"));
    try {
      const next = await readFolderFiles(list);
      ingest({
        files: next,
        source: "folder",
        detail: t(lang, "import.folderOk", { count: next.length }),
      });
      addHistory("action.folder", "—", "ok");
    } catch (error) {
      setStatus("error", importMessage(error, lang));
      addHistory("action.folder", "—", "error");
    }
  }

  async function onZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus("loading", t(lang, "import.loading"));
    try {
      const next = await readZipFiles(file);
      ingest({
        files: next,
        source: "zip",
        repoName: file.name,
        detail: t(lang, "import.zipOk", { count: next.length }),
      });
      addHistory("action.zip", "—", "ok");
    } catch (error) {
      setStatus("error", importMessage(error, lang));
      addHistory("action.zip", "—", "error");
    }
  }

  function onSample() {
    const next = sampleFiles();
    ingest({
      files: next,
      source: "sample",
      repoName: "spice-rack",
      githubUrl: "",
      detail: t(lang, "import.sampleOk"),
    });
    addHistory("action.sample", "—", "ok");
  }

  const stateLabel =
    status === "loading"
      ? t(lang, "analysis.loading")
      : status === "error"
        ? t(lang, "analysis.error")
        : files.length
          ? t(lang, "analysis.analyzed")
          : t(lang, "analysis.ready");

  return (
    <section className="view-enter mx-auto max-w-6xl">
      <header className="mb-8">
        <p className="mb-3 font-mono text-xs font-bold tracking-[0.18em] text-signal uppercase">
          {t(lang, "home.eyebrow")}
        </p>
        <h2 className="text-2xl leading-tight font-extrabold tracking-tight">
          {t(lang, "home.heading")}
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">{t(lang, "home.intro")}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="panel rounded-md p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">{t(lang, "import.title")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t(lang, "import.help")}</p>
            </div>
            <FolderSearch className="shrink-0" size={26} />
          </div>
          <form className="mt-6 space-y-3" onSubmit={(event) => void onGithub(event)}>
            <label className="block text-sm font-semibold" htmlFor="github-url">
              {t(lang, "import.githubLabel")}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="github-url"
                className="field font-mono text-sm"
                type="url"
                autoComplete="url"
                placeholder={t(lang, "import.githubPlaceholder")}
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                suppressHydrationWarning
              />
              <button
                className="action shrink-0 rounded-md px-4 py-3 font-bold whitespace-nowrap"
                type="submit"
                disabled={status === "loading"}
              >
                {t(lang, "import.githubButton")}
              </button>
            </div>
            <label className="mt-4 block text-sm font-semibold" htmlFor="github-token">
              {t(lang, "import.tokenLabel")}
            </label>
            <input
              id="github-token"
              className="field font-mono text-sm"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(lang, "import.tokenPlaceholder")}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <p className="text-sm leading-relaxed text-muted">{t(lang, "import.tokenHelp")}</p>
          </form>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-xs font-bold text-muted">{t(lang, "import.or")}</span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="action inline-flex min-h-11 items-center rounded-md px-4 py-3 font-bold"
              onClick={() => folderRef.current?.click()}
            >
              {t(lang, "import.folder")}
            </button>
            <button
              type="button"
              className="quiet inline-flex min-h-11 items-center rounded-md px-4 py-3 font-bold"
              onClick={() => zipRef.current?.click()}
            >
              {t(lang, "import.zip")}
            </button>
            <button
              type="button"
              id="sample-button"
              className="quiet inline-flex min-h-11 items-center rounded-md px-4 py-3 font-bold"
              onClick={onSample}
            >
              {t(lang, "import.sample")}
            </button>
          </div>
          <input
            ref={folderRef}
            className="sr-only"
            type="file"
            multiple
            onChange={(event) => void onFolder(event)}
          />
          <input
            ref={zipRef}
            className="sr-only"
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => void onZip(event)}
          />
          <p className="mt-4 text-sm leading-relaxed text-muted">{t(lang, "import.privacy")}</p>
          <SecretNotice files={files} />
          <p id="import-status" className="mt-4 text-sm font-semibold" aria-live="polite">
            {status === "loading" ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" /> {statusDetail}
              </span>
            ) : (
              statusDetail
            )}
          </p>
        </section>
        <aside className="panel rounded-md bg-sage p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{t(lang, "analysis.title")}</h3>
            <span className="inline-block size-2.5 rounded-full bg-emerald-600" aria-hidden />
          </div>
          <dl className="mt-6 space-y-4">
            <div className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-sm text-muted">{t(lang, "analysis.files")}</dt>
              <dd id="file-count" className="font-mono font-bold tabular-nums">
                {files.length}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-sm text-muted">{t(lang, "analysis.size")}</dt>
              <dd className="font-mono font-bold tabular-nums">{formatBytes(total)}</dd>
            </div>
            {branch ? (
              <div className="flex justify-between gap-4 border-b border-line pb-3">
                <dt className="text-sm text-muted">{t(lang, "analysis.ref")}</dt>
                <dd className="max-w-[60%] truncate text-right font-mono text-xs font-bold">
                  {branch}
                  {subdir ? `/${subdir}` : ""}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-muted">{t(lang, "analysis.state")}</dt>
              <dd className="font-mono text-sm font-bold">{stateLabel}</dd>
            </div>
          </dl>
          <div className="mt-5 max-h-40 overflow-auto font-mono text-xs">
            {files.slice(0, 8).map((file) => (
              <div
                key={file.path}
                className="flex justify-between gap-3 border-b border-dashed border-line py-2"
              >
                <span className="truncate">{file.path}</span>
                <span className="tabular-nums">{formatBytes(file.size)}</span>
              </div>
            ))}
            {files.length > 8 ? (
              <div className="pt-2 opacity-70">
                {t(lang, "analysis.more", { count: files.length - 8 })}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
      <section className="panel mt-7 rounded-md p-5 sm:p-7">
        <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h3 className="text-lg font-bold">{t(lang, "history.title")}</h3>
            <p className="mt-1 text-sm text-muted">{t(lang, "history.help")}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs">
              {t(lang, "history.count", { count: history.length })}
            </span>
            {history.length ? (
              <button
                type="button"
                className="quiet rounded-md px-3 py-2 text-xs font-bold"
                onClick={() => {
                  clearHistory();
                  toast(t(lang, "toast.historyCleared"));
                }}
              >
                {t(lang, "history.clear")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead className="border-b border-line font-mono text-xs uppercase">
              <tr>
                <th className="pb-3 pr-3 text-muted">{t(lang, "history.time")}</th>
                <th className="pb-3 pr-3 text-muted">{t(lang, "history.action")}</th>
                <th className="pb-3 pr-3 text-muted">{t(lang, "history.model")}</th>
                <th className="pb-3 text-muted">{t(lang, "history.status")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-3 font-mono text-xs">
                    {formatDate(lang, row.timestamp)}
                  </td>
                  <td className="py-3 pr-3">{t(lang, row.action)}</td>
                  <td className="py-3 pr-3 font-mono text-xs">{row.model}</td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-block size-2.5 rounded-full ${
                          row.status === "ok" ? "bg-emerald-600" : "bg-signal"
                        }`}
                      />
                      {t(lang, row.status === "ok" ? "history.ok" : "history.err")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.length === 0 ? (
          <p className="py-6 text-sm text-muted italic">{t(lang, "history.empty")}</p>
        ) : null}
      </section>
    </section>
  );
}

export function ExportView({ kind }: { kind: "html" | "json" | "python" }) {
  const lang = useAppStore((s) => s.lang);
  const files = useAppStore((s) => s.files);
  const githubUrl = useAppStore((s) => s.githubUrl);
  const source = useAppStore((s) => s.source);
  const branch = useAppStore((s) => s.branch);
  const includeSecrets = useAppStore((s) => s.includeSecrets);
  const embedPython = useAppStore((s) => s.embedPython);
  const setEmbedPython = useAppStore((s) => s.setEmbedPython);
  const addHistory = useAppStore((s) => s.addHistory);
  const reference = githubUrl || "Local folder";
  const safe = useMemo(() => filesForExport(files, includeSecrets), [files, includeSecrets]);
  const preview = useMemo(() => {
    if (kind === "html") return htmlSkeleton(safe, reference, reference);
    if (kind === "python") {
      return pythonSkeleton(safe, reference, source || "client", {
        embedContents: embedPython,
        branch: branch || undefined,
      });
    }
    return JSON.stringify(
      buildManifest(safe, reference, source || "client", branch || undefined, true),
      null,
      2,
    );
  }, [kind, safe, reference, source, embedPython, branch]);

  async function onExport() {
    await exportZip(kind, files, reference, source || "client", {
      includeSecrets,
      embedContents: kind === "python" && embedPython,
      branch: branch || undefined,
    });
    addHistory(`action.${kind}`, "—", "ok");
    toast(t(lang, "toast.zip"));
  }

  return (
    <section className="view-enter mx-auto max-w-5xl">
      <p className="mb-3 font-mono text-xs font-bold tracking-[0.18em] text-signal uppercase">
        {t(lang, `${kind}.eyebrow`)}
      </p>
      <h2 className="text-2xl font-extrabold">{t(lang, `${kind}.title`)}</h2>
      <HelpBanner title={t(lang, `${kind}.helpTitle`)} body={t(lang, `${kind}.help`)} />
      <SecretNotice files={files} />
      <div className="panel mt-6 rounded-md p-5 sm:p-7">
        {kind === "python" ? (
          <label className="mb-4 flex min-h-11 items-start gap-3 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={embedPython}
              onChange={(event) => setEmbedPython(event.target.checked)}
            />
            <span>
              <span className="font-semibold">{t(lang, "python.embed")}</span>
              <span className="mt-1 block text-muted">{t(lang, "python.embedHelp")}</span>
            </span>
          </label>
        ) : null}
        <CodePreview code={preview} empty={t(lang, "common.noData")} />
        <button
          type="button"
          className="action mt-5 inline-flex min-h-11 items-center rounded-md px-5 py-3 font-bold"
          onClick={() => void onExport()}
        >
          {t(lang, `${kind}.download`)}
        </button>
      </div>
    </section>
  );
}

export function AiView() {
  const lang = useAppStore((s) => s.lang);
  const files = useAppStore((s) => s.files);
  const githubUrl = useAppStore((s) => s.githubUrl);
  const model = useAppStore((s) => s.model);
  const aiChunk = useAppStore((s) => s.aiChunk);
  const setModel = useAppStore((s) => s.setModel);
  const setAiChunk = useAppStore((s) => s.setAiChunk);
  const includeSecrets = useAppStore((s) => s.includeSecrets);
  const modelLimits = useAppStore((s) => s.modelLimits);
  const setModelLimit = useAppStore((s) => s.setModelLimit);
  const resetModelLimits = useAppStore((s) => s.resetModelLimits);
  const addHistory = useAppStore((s) => s.addHistory);
  const safe = useMemo(() => filesForExport(files, includeSecrets), [files, includeSecrets]);
  const pack = useMemo(
    () => buildAiPrompt(safe, githubUrl || "Local folder", model, modelLimits),
    [safe, githubUrl, model, modelLimits],
  );
  const current = pack.chunks[Math.min(aiChunk, pack.chunks.length - 1)] ?? pack.text;

  async function copy() {
    try {
      await navigator.clipboard.writeText(current);
      addHistory("action.aiCopy", model, "ok");
      toast(t(lang, "toast.copy"));
    } catch {
      toast(t(lang, "toast.copyFail"));
    }
  }

  function download() {
    if (pack.chunks.length > 1) {
      void exportAiChunks(model, pack.chunks).then(() => {
        addHistory("action.aiDownload", model, "ok");
        toast(t(lang, "toast.zip"));
      });
      return;
    }
    triggerDownload(
      new Blob([current], { type: "text/plain;charset=utf-8" }),
      `${slugify(model)}-repository-prompt.txt`,
    );
    addHistory("action.aiDownload", model, "ok");
    toast(t(lang, "toast.txt"));
  }

  return (
    <section className="view-enter mx-auto max-w-5xl">
      <p className="mb-3 font-mono text-xs font-bold tracking-[0.18em] text-signal uppercase">
        {t(lang, "ai.eyebrow")}
      </p>
      <h2 className="text-2xl font-extrabold">{t(lang, "ai.title")}</h2>
      <HelpBanner title={t(lang, "ai.helpTitle")} body={t(lang, "ai.help")} />
      <SecretNotice files={files} />
      <div className="panel mt-6 rounded-md p-5 sm:p-7">
        <label className="mb-2 block font-bold" htmlFor="model-select">
          {t(lang, "ai.model")}
        </label>
        <select
          id="model-select"
          className="field max-w-sm"
          value={model}
          onChange={(event) => setModel(event.target.value as AiModel)}
        >
          {(["Gemini", "Claude", "Grok", "TeraAI"] as AiModel[]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">{t(lang, "ai.planning")}</span>
          <span className="font-mono text-sm">
            {t(lang, "ai.chunks", {
              chunks: pack.chunks.length,
              plural: pack.chunks.length === 1 ? "" : "s",
              tokens: formatNumber(lang, pack.estimatedTokens),
              limit: formatNumber(lang, pack.limit),
            })}
          </span>
        </div>
        {pack.chunks.length > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {pack.chunks.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`rounded-md px-3 py-2 font-mono text-xs font-bold ${
                  index === aiChunk ? "action" : "quiet"
                }`}
                onClick={() => setAiChunk(index)}
              >
                {t(lang, "ai.chunkOf", {
                  current: index + 1,
                  total: pack.chunks.length,
                })}
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-muted">{t(lang, "ai.englishNote")}</p>
        <div className="mt-4 rounded-md border border-line p-4">
          <p className="text-sm leading-relaxed text-muted">
            {t(lang, "ai.limitsDate", { date: MODEL_SPECS_AS_OF })}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["Gemini", "Claude", "Grok", "TeraAI"] as AiModel[]).map((value) => (
              <label key={value} className="text-sm font-semibold" htmlFor={`limit-${value}`}>
                {t(lang, "ai.limitFor", { model: value })}
                <input
                  id={`limit-${value}`}
                  className="field mt-1"
                  type="number"
                  min={1000}
                  inputMode="numeric"
                  value={modelLimits[value] ?? MODEL_SPECS[value].limit}
                  onChange={(event) => setModelLimit(value, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="quiet mt-3 inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-bold"
            onClick={resetModelLimits}
          >
            {t(lang, "ai.resetLimits")}
          </button>
        </div>
        <div className="mt-4">
          <CodePreview code={current} empty={t(lang, "common.noData")} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="quiet inline-flex min-h-11 items-center rounded-md px-5 py-3 font-bold"
            onClick={() => void copy()}
          >
            {t(lang, "ai.copy")}
          </button>
          <button
            type="button"
            className="action inline-flex min-h-11 items-center rounded-md px-5 py-3 font-bold"
            onClick={download}
          >
            {pack.chunks.length > 1 ? t(lang, "ai.downloadZip") : t(lang, "ai.download")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function InfoView() {
  const lang = useAppStore((s) => s.lang);
  return (
    <section className="view-enter mx-auto max-w-4xl">
      <p className="mb-3 font-mono text-xs font-bold tracking-[0.18em] text-signal uppercase">
        {t(lang, "info.eyebrow")}
      </p>
      <h2 className="text-2xl font-extrabold">{t(lang, "info.title")}</h2>
      <div className="panel mt-6 rounded-md p-6 leading-relaxed">
        <h3 className="text-lg font-bold">{t(lang, "info.sub")}</h3>
        <p className="mt-3 text-muted">{t(lang, "info.body")}</p>
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-lg font-bold">{t(lang, "info.privacyTitle")}</h3>
          <p className="mt-3 text-muted">{t(lang, "info.privacyBody")}</p>
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-lg font-bold">{t(lang, "info.secretsTitle")}</h3>
          <p className="mt-3 text-muted">{t(lang, "info.secretsBody")}</p>
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-lg font-bold">{t(lang, "info.viewsTitle")}</h3>
          <p className="mt-3 text-muted">{t(lang, "info.viewsBody")}</p>
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-lg font-bold">{t(lang, "info.themesTitle")}</h3>
          <p className="mt-3 text-muted">{t(lang, "info.themesBody")}</p>
        </div>
      </div>
    </section>
  );
}

export function ActiveView({ view }: { view: ViewId }) {
  if (view === "html") return <ExportView kind="html" />;
  if (view === "json") return <ExportView kind="json" />;
  if (view === "python") return <ExportView kind="python" />;
  if (view === "ai") return <AiView />;
  if (view === "info") return <InfoView />;
  return <HomeView />;
}
