import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TaskType } from "./chat.js";
import { modelForTask } from "./chat.js";
import {
  ALLOWED_OVERRIDE_MODELS,
  CLAUDE_HAIKU,
  CLAUDE_OPUS,
  CLAUDE_SONNET,
  MODEL_BY_TASK,
  resolveModelForTask,
} from "./models.js";

const AI_DIR = dirname(fileURLToPath(import.meta.url));
const KNOWN_MODELS = new Set([CLAUDE_SONNET, CLAUDE_OPUS, CLAUDE_HAIKU]);

describe("model table (FEAT-58)", () => {
  it("verified model IDs match the Anthropic catalog", () => {
    expect(CLAUDE_SONNET).toBe("claude-sonnet-5");
    expect(CLAUDE_OPUS).toBe("claude-opus-4-8");
    expect(CLAUDE_HAIKU).toBe("claude-haiku-4-5-20251001");
  });

  it("every TaskType resolves to a known model", () => {
    for (const taskType of Object.values(TaskType)) {
      const model = resolveModelForTask(taskType);
      expect(KNOWN_MODELS.has(model), `${taskType} → ${model}`).toBe(true);
    }
  });

  it("modelForTask delegates to the table for every TaskType", () => {
    for (const taskType of Object.values(TaskType)) {
      expect(modelForTask(taskType)).toBe(resolveModelForTask(taskType));
    }
  });

  it("Opus 4.8 pilot covers exactly evaluate + learnerSynthesis", () => {
    const opusTasks = Object.entries(MODEL_BY_TASK)
      .filter(([, model]) => model === CLAUDE_OPUS)
      .map(([task]) => task)
      .sort();
    expect(opusTasks).toEqual(["evaluate", "learnerSynthesis"]);
  });

  it("generate / chat stay on Haiku; unlisted tasks default to Haiku", () => {
    expect(resolveModelForTask("generate")).toBe(CLAUDE_HAIKU);
    expect(resolveModelForTask("chat")).toBe(CLAUDE_HAIKU);
    expect(resolveModelForTask("not-a-real-task")).toBe(CLAUDE_HAIKU);
  });

  it("the override allowlist is exactly the distinct set the table can return", () => {
    expect([...ALLOWED_OVERRIDE_MODELS].sort()).toEqual(
      [...new Set(Object.values(MODEL_BY_TASK))].sort(),
    );
  });

  it("no orphan Claude model literals outside the table", () => {
    // The table (models.ts) is the only place Claude model strings live in the
    // functions AI layer. Grep every .ts (excluding tests + models.ts itself)
    // for a quoted `"claude-…"` literal — there should be none.
    const literal = /["'`]claude-[a-z0-9.-]+["'`]/i;
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "__stubs__" || entry === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!entry.endsWith(".ts")) continue;
        if (entry.endsWith(".test.ts") || entry === "models.ts") continue;
        const src = readFileSync(full, "utf8");
        for (const [i, line] of src.split(/\r?\n/).entries()) {
          if (literal.test(line)) offenders.push(`${full}:${i + 1}: ${line.trim()}`);
        }
      }
    };
    walk(AI_DIR);

    expect(offenders, `orphan model literals:\n${offenders.join("\n")}`).toEqual([]);
  });
});
