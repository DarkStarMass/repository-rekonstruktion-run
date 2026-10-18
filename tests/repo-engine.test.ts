import assert from "node:assert/strict";
import test from "node:test";
import {
  EngineError,
  MODEL_SPECS_AS_OF,
  PROMPT_FILE_CAP,
  ZIP_LIMITS,
  assertZipBudget,
  buildAiPrompt,
  filesForExport,
  htmlAnchorId,
  htmlSkeleton,
  parseGithubUrl,
  pythonSkeleton,
  scanSecrets,
  splitGithubHint,
  type RepoFile,
} from "../src/lib/repo-engine.ts";

function file(path: string, content: string): RepoFile {
  return {
    path,
    size: content.length,
    type: "text/plain",
    encoding: "text",
    content,
  };
}

test("parses owner/repo, branch trees, and blob URLs", () => {
  const root = parseGithubUrl("https://github.com/DarkStarMass/repository-rekonstruktion-run.git");
  assert.deepEqual(root, {
    owner: "DarkStarMass",
    repo: "repository-rekonstruktion-run",
    mode: "root",
    hint: undefined,
  });
  const tree = parseGithubUrl("https://github.com/o/r/tree/main/src/lib");
  assert.equal(tree?.mode, "tree");
  assert.equal(tree?.hint, "main/src/lib");
  const blob = parseGithubUrl("https://github.com/o/r/blob/main/src/my%20file.ts");
  assert.equal(blob?.hint, "main/src/my file.ts");
  assert.equal(parseGithubUrl("https://example.com/o/r"), null);
});

test("splits a default-branch hint without probing", () => {
  assert.deepEqual(splitGithubHint("main", "main/src/lib", "tree"), {
    branch: "main",
    subdir: "src/lib",
  });
  assert.deepEqual(splitGithubHint("main", "main/src/app.ts", "blob"), {
    branch: "main",
    subdir: "src",
    filePath: "src/app.ts",
  });
  assert.equal(splitGithubHint("main", "feature/name/src", "tree"), null);
  assert.deepEqual(splitGithubHint("main", "abc1234/docs", "tree"), {
    branch: "abc1234",
    subdir: "docs",
  });
});

test("HTML anchors survive spaces and slashes", () => {
  const path = "src/my file.ts";
  const html = htmlSkeleton([file(path, "hello")], "local", "demo");
  const id = htmlAnchorId(path);
  assert.equal(id, "src%2Fmy%20file.ts");
  assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, new RegExp(`href="#${id}"`));
  assert.doesNotMatch(html, /href="#src\/my file\.ts"/);
});

test("chunks on file boundaries and keeps the tree in chunk 1", () => {
  const files = [
    file("a.txt", `START_A\n${"a".repeat(1500)}\nEND_A`),
    file("b.txt", `START_B\n${"b".repeat(1500)}\nEND_B`),
    file("c.txt", `START_C\n${"c".repeat(PROMPT_FILE_CAP + 50)}\nEND_C`),
  ];
  const pack = buildAiPrompt(files, "local", "TeraAI", { TeraAI: 1_000 });
  assert.ok(pack.chunks.length > 1);
  assert.match(pack.chunks[0], /File tree/);
  assert.match(pack.chunks[0], /START_A/);
  assert.match(pack.chunks[0], /END_A/);
  for (const later of pack.chunks.slice(1)) {
    assert.doesNotMatch(later, /File tree/);
    assert.doesNotMatch(later, /System instruction/);
  }
  const joined = pack.chunks.join("\n");
  assert.match(joined, /START_B/);
  assert.match(joined, /END_B/);
  assert.match(joined, new RegExp(`truncated: showing ${PROMPT_FILE_CAP} of`));
  assert.equal(MODEL_SPECS_AS_OF, "2026-10-18");
});

test("secret scan omits env files and token patterns unless asked", () => {
  const files = [
    file(".env", "TOKEN=1"),
    file("config/.env.local", "SECRET=1"),
    file("src/app.ts", "const key = 'ghp_abcdefghijklmnopqrstuvwxyz123456'"),
    file("README.md", "no secrets here, just a readme"),
  ];
  const hits = scanSecrets(files).map((hit) => hit.path).sort();
  assert.deepEqual(hits, [".env", "config/.env.local", "src/app.ts"]);
  const safe = filesForExport(files, false).map((item) => item.path);
  assert.deepEqual(safe, ["README.md"]);
  assert.equal(filesForExport(files, true).length, 4);
  const prompt = buildAiPrompt(filesForExport(files, false), "local", "Grok").text;
  assert.doesNotMatch(prompt, /ghp_/);
  assert.doesNotMatch(prompt, /\.env/);
});

test("python embed is opt-in", () => {
  const files = [file("src/a.py", "print('hi')")];
  assert.doesNotMatch(pythonSkeleton(files, "local", "folder"), /FILE_CONTENTS/);
  assert.match(
    pythonSkeleton(files, "local", "folder", { embedContents: true }),
    /FILE_CONTENTS/,
  );
  assert.match(
    pythonSkeleton(files, "local", "folder", { embedContents: true }),
    /print\('hi'\)/,
  );
});

test("zip budget rejects oversized entries before they accumulate", () => {
  assert.throws(() => assertZipBudget(0, 0, ZIP_LIMITS.maxEntryBytes + 1), (error: unknown) => {
    return error instanceof EngineError && error.code === "zip-entry";
  });
  assert.throws(() => assertZipBudget(ZIP_LIMITS.maxFiles, 0, 10), (error: unknown) => {
    return error instanceof EngineError && error.code === "zip-files";
  });
  assert.throws(
    () => assertZipBudget(1, ZIP_LIMITS.maxTotalBytes - 5, 20),
    (error: unknown) => error instanceof EngineError && error.code === "zip-bytes",
  );
});
