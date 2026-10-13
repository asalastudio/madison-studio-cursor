import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { applyHumanizer } from "./apply.ts";
import { requiresHumanizer, VISUAL_PROMPT_ARTIFACT } from "./policy.ts";
import {
  MODEL_CALL_PATTERNS,
  NON_MODEL_PATHS,
  UNWIRED_MODEL_PATHS,
  WIRED_GENERATION_PATHS,
  WIRED_SAVE_PATHS,
} from "./registry.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const BYPASS_PATTERN =
  /\bskipHumanizer\b|\bbypassHumanizer\b|\bskipHumanize\b|\bHUMANIZER_DISABLED\b|humanize\s*:\s*false/;

function readRepo(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    out.push(relative(ROOT, full));
  }
}

function scanModelCallers(): string[] {
  const files: string[] = [];
  for (const root of ["supabase/functions", "src", "scripts"]) {
    const absolute = join(ROOT, root);
    if (!statSync(absolute).isDirectory()) continue;
    walk(absolute, files);
  }
  return files
    .filter((path) => path !== "supabase/functions/_shared/humanizer/registry.ts")
    .filter((path) => MODEL_CALL_PATTERNS.some((pattern) => pattern.test(readRepo(path))))
    .sort();
}

describe("humanizer step", () => {
  it("loads the vendored skill and has no skip argument", () => {
    const skill = readRepo("supabase/functions/_shared/humanizer/SKILL.md");
    const license = readRepo("supabase/functions/_shared/humanizer/LICENSE");
    assert.match(skill, /name:\s*humanizer/);
    assert.match(skill, /Embedded mode/);
    assert.match(license, /MIT License/);
    assert.match(license, /Copyright \(c\) 2025 Siqi Chen/);

    const edge = readRepo("supabase/functions/_shared/humanizer/humanize.ts");
    const client = readRepo("src/lib/humanizer/humanizeGeneratedCopy.ts");
    assert.match(edge, /export async function humanizeGeneratedCopy\(text: string\)/);
    assert.match(edge, /SKILL\.md/);
    assert.match(edge, /applyHumanizer\(/);
    assert.match(client, /export async function humanizeGeneratedCopy\(text: string\)/);
    assert.match(client, /SKILL\.md\?raw/);
    assert.match(client, /applyHumanizer\(/);
    assert.doesNotMatch(edge, BYPASS_PATTERN);
    assert.doesNotMatch(client, BYPASS_PATTERN);
    assert.doesNotMatch(readRepo("supabase/functions/_shared/humanizer/apply.ts"), BYPASS_PATTERN);
    assert.doesNotMatch(readRepo("supabase/functions/_shared/humanizer/policy.ts"), BYPASS_PATTERN);
  });

  it("rewrites prose and JSON and refuses to return a failed draft", async () => {
    let calls = 0;
    const prose = await applyHumanizer(
      "It's not just soft, it's a cloud.",
      "skill",
      async (input) => {
        calls += 1;
        assert.match(input.systemPrompt, /embedded mode/i);
        assert.match(input.userPrompt, /SUBJECT LINE/);
        assert.match(input.userPrompt, /It's not just soft/);
        return "The fabric feels soft.";
      },
    );
    assert.equal(prose, "The fabric feels soft.");
    assert.equal(calls, 1);

    const untouched = await applyHumanizer("  ", "skill", async () => {
      throw new Error("should not be called");
    });
    assert.equal(untouched, "  ");

    await assert.rejects(
      () => applyHumanizer("Hello from Madison.", "skill", async () => "  "),
      /empty copy/,
    );

    const json = await applyHumanizer(
      JSON.stringify({ headline: "It's not just a candle, it's a ritual.", count: 2, note: "" }),
      "skill",
      async (input) => {
        const payload = input.userPrompt.slice(input.userPrompt.indexOf("{"));
        const parsed = JSON.parse(payload) as { headline: string; count: number; note: string };
        parsed.headline = "The candle is a small evening ritual.";
        return "```json\n" + JSON.stringify(parsed) + "\n```";
      },
    );
    assert.deepEqual(JSON.parse(json), {
      headline: "The candle is a small evening ritual.",
      count: 2,
      note: "",
    });

    await assert.rejects(
      () => applyHumanizer(
        JSON.stringify({ headline: "Keep this", count: 2 }),
        "skill",
        async () => JSON.stringify({ headline: "Only the headline" }),
      ),
      /changed keys/,
    );

    await assert.rejects(
      () => applyHumanizer(
        JSON.stringify({ headline: "Keep this" }),
        "skill",
        async () => JSON.stringify({ headline: "" }),
      ),
      /erased copy/,
    );
  });

  it("humanizes customer copy and leaves image-prompt requests alone", () => {
    assert.equal(requiresHumanizer({}), true);
    assert.equal(requiresHumanizer({ artifact: "copy" }), true);
    assert.equal(requiresHumanizer({ forcePromptOutput: false, isImageStudioConsult: false }), true);
    assert.equal(requiresHumanizer({ artifact: VISUAL_PROMPT_ARTIFACT }), false);
    assert.equal(requiresHumanizer({ forcePromptOutput: true }), false);
    assert.equal(requiresHumanizer({ isImageStudioConsult: true }), false);
    assert.equal(requiresHumanizer({ artifact: "visual-prompt-extra" }), true);
  });

  it("fails when a model caller is not classified or a copy path skips humanize", () => {
    const scanned = scanModelCallers();
    const wired = new Set<string>(WIRED_GENERATION_PATHS);
    const unwired = new Set(UNWIRED_MODEL_PATHS.map((entry) => entry.path));
    const classified = new Set<string>([...wired, ...unwired]);

    const unexpected = scanned.filter((path) => !classified.has(path));
    const missing = [...classified].filter((path) => !scanned.includes(path));
    assert.deepEqual(unexpected, [], `unclassified model caller:\n${unexpected.join("\n")}`);
    assert.deepEqual(missing, [], `registered path does not call a model:\n${missing.join("\n")}`);

    for (const path of [...WIRED_GENERATION_PATHS, ...WIRED_SAVE_PATHS]) {
      const source = readRepo(path);
      assert.match(source, /humanizeGeneratedCopy\(/, `${path} returns copy without humanizeGeneratedCopy`);
      assert.doesNotMatch(source, BYPASS_PATTERN, `${path} contains a humanizer bypass`);
    }

    for (const entry of UNWIRED_MODEL_PATHS) {
      assert.ok(entry.reason.trim().length > 40, `${entry.path} is missing a reason`);
      assert.doesNotMatch(readRepo(entry.path), BYPASS_PATTERN);
    }

    for (const entry of NON_MODEL_PATHS) {
      assert.ok(statSync(join(ROOT, entry.path)).isFile(), entry.path);
      const source = readRepo(entry.path);
      assert.equal(
        MODEL_CALL_PATTERNS.some((pattern) => pattern.test(source)),
        false,
        `${entry.path} now calls a model and must be classified as wired or unwired`,
      );
      assert.ok(entry.reason.trim().length > 40, `${entry.path} is missing a reason`);
    }
  });

  it("allows the visual-prompt artifact only on the image-prompt caller", () => {
    const files: string[] = [];
    for (const root of ["supabase/functions", "src", "scripts"]) {
      walk(join(ROOT, root), files);
    }
    const hits = files.filter((path) => /["']visual-prompt["']/.test(readRepo(path)));
    assert.deepEqual(hits.sort(), [
      "src/lib/agents/contentToVisualPrompts.ts",
      "supabase/functions/_shared/humanizer/policy.ts",
    ]);
  });

  it("does not humanize the image-prompt template inside the generator", () => {
    const source = readRepo("src/lib/agents/generator.ts");
    const start = source.indexOf("export function generateImagePrompt");
    const end = source.indexOf("function getDefaultPromptTemplate");
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(source.slice(start, end), /humanizeGeneratedCopy/);
  });
});
