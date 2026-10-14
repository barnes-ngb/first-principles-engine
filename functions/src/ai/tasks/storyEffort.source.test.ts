/**
 * Every story `callClaude` passes a reasoning effort (UX-455).
 *
 * `EFFORT_BY_TASK` is not applied automatically: each call site passes
 * `effort: resolveEffortForTask(...)` itself, and before UX-455 no story call
 * site did — so all four ran at the API default (high), where thinking counts
 * against `max_tokens` and a long book for the youngest reader ran out of room
 * before the last page. A fifth story call added without an `effort` would
 * reopen exactly that, silently, so this scans the source rather than trusting
 * a list.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EFFORT_BY_TASK, ReasoningEffort } from "../models.js";

const here = dirname(fileURLToPath(import.meta.url));
const STORY_TASK_FILES = ["generateStory.ts", "reviseStory.ts", "revisePage.ts"] as const;

/** The argument object of every `callClaude({ … })` in `source`, by brace balance. */
export function callClaudeArgBlocks(source: string): string[] {
  const blocks: string[] = [];
  const marker = "callClaude({";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return blocks;
    const open = at + marker.length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) throw new Error("unbalanced callClaude({ … }) argument");
    blocks.push(source.slice(open, end + 1));
    from = end + 1;
  }
}

/** A block passes an effort when it names the `effort` property at its own top level. */
function passesEffort(block: string): boolean {
  return /(^|[\s,{])effort\s*[:,}\n]/.test(block);
}

/** Every `callClaude` block in `source` that does NOT pass an effort. */
export function callsWithoutEffort(source: string): string[] {
  return callClaudeArgBlocks(source).filter((b) => !passesEffort(b));
}

describe("story calls pass a reasoning effort (UX-455)", () => {
  const sources = STORY_TASK_FILES.map((f) => ({
    file: f,
    source: readFileSync(join(here, f), "utf8"),
  }));

  it("finds the four story calls — a scan that finds nothing proves nothing", () => {
    const counts = Object.fromEntries(
      sources.map(({ file, source }) => [file, callClaudeArgBlocks(source).length]),
    );
    expect(counts).toEqual({ "generateStory.ts": 2, "reviseStory.ts": 1, "revisePage.ts": 1 });
  });

  it.each(STORY_TASK_FILES)("%s: every callClaude passes `effort`", (file) => {
    const { source } = sources.find((s) => s.file === file)!;
    expect(callsWithoutEffort(source)).toEqual([]);
  });

  it("positive control: removing one effort line fails the check", () => {
    const { source } = sources.find((s) => s.file === "revisePage.ts")!;
    const stripped = source.replace(/\n\s*effort,\n/, "\n");
    expect(stripped).not.toBe(source);
    expect(callsWithoutEffort(stripped)).toHaveLength(1);
    const gen = sources.find((s) => s.file === "generateStory.ts")!.source;
    const genStripped = gen.replace(/\n\s*effort: fixEffort,\n/, "\n");
    expect(genStripped).not.toBe(gen);
    expect(callsWithoutEffort(genStripped)).toHaveLength(1);
  });

  it("each story call resolves its effort from its own EFFORT_BY_TASK key, at LOW", () => {
    const keys = ["generateStory", "generateStoryFix", "reviseStory", "revisePage"];
    for (const key of keys) expect(EFFORT_BY_TASK[key]).toBe(ReasoningEffort.Low);
    const all = sources.map((s) => s.source).join("\n");
    for (const key of keys) expect(all).toContain(`resolveEffortForTask("${key}")`);
  });
});
