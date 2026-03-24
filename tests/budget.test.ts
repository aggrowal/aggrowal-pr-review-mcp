import { describe, it, expect } from "vitest";
import { applyTokenBudget, type TokenBudgetConfig } from "../src/budget/index.js";
import type { DiffContext, ChangedFile } from "../src/types.js";
import { createNullLogger } from "../src/logger.js";

const logger = createNullLogger();

function makeFile(overrides: Partial<ChangedFile> & { path: string }): ChangedFile {
  return {
    status: "modified",
    additions: 10,
    deletions: 5,
    diff: "diff content\n".repeat(20),
    content: "full file\n".repeat(50),
    ...overrides,
  };
}

function makeDiff(files: ChangedFile[]): DiffContext {
  return {
    projectName: "test",
    repoRoot: "/tmp/test",
    baseBranch: "main",
    headBranch: "feature/test",
    repoUrl: "https://github.com/org/test",
    files,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
  };
}

const DEFAULT_BUDGET: TokenBudgetConfig = {
  maxPromptChars: 400_000,
  maxFiles: 100,
  maxTotalLines: 15_000,
};

describe("applyTokenBudget", () => {
  it("passes through small diffs unchanged", () => {
    const diff = makeDiff([
      makeFile({ path: "a.ts" }),
      makeFile({ path: "b.ts" }),
    ]);

    const result = applyTokenBudget(diff, 9, DEFAULT_BUDGET, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.truncated).toBe(false);
      expect(result.diff.files).toHaveLength(2);
    }
  });

  it("rejects when file count exceeds maxFiles", () => {
    const files = Array.from({ length: 110 }, (_, i) =>
      makeFile({ path: `file-${i}.ts`, additions: 1, deletions: 0 })
    );
    const diff = makeDiff(files);

    const result = applyTokenBudget(diff, 9, { ...DEFAULT_BUDGET, maxFiles: 100 }, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("110 files");
      expect(result.hint).toContain("maxFiles");
    }
  });

  it("rejects when total lines exceeds maxTotalLines", () => {
    const files = [
      makeFile({ path: "big.ts", additions: 8000, deletions: 8000 }),
    ];
    const diff = makeDiff(files);

    const result = applyTokenBudget(diff, 9, { ...DEFAULT_BUDGET, maxTotalLines: 15_000 }, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("16000 changed lines");
    }
  });

  it("drops full-file content when over prompt char budget", () => {
    const bigContent = "x".repeat(50_000);
    const files = [
      makeFile({ path: "a.ts", content: bigContent, diff: "small diff" }),
      makeFile({ path: "b.ts", content: bigContent, diff: "small diff" }),
    ];
    const diff = makeDiff(files);

    const result = applyTokenBudget(
      diff,
      9,
      { ...DEFAULT_BUDGET, maxPromptChars: 60_000 },
      logger
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.truncated).toBe(true);
      expect(result.droppedFullContent.length).toBeGreaterThan(0);
      for (const f of result.diff.files) {
        expect(f.content).toBeUndefined();
      }
    }
  });

  it("truncates large diffs when dropping content is not enough", () => {
    const bigDiff = "diff line here something\n".repeat(500);
    const files = [
      makeFile({ path: "a.ts", content: undefined, diff: bigDiff, status: "added" }),
      makeFile({ path: "b.ts", content: undefined, diff: bigDiff, status: "added" }),
      makeFile({ path: "c.ts", content: undefined, diff: bigDiff, status: "added" }),
    ];
    const diff = makeDiff(files);

    const payloadSize = files.reduce((s, f) => s + f.diff.length + 80, 0);
    const tightBudget = Math.floor(payloadSize * 0.4);

    const result = applyTokenBudget(
      diff,
      9,
      { ...DEFAULT_BUDGET, maxPromptChars: tightBudget + 8_000 + 9 * 3_500 },
      logger
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.truncated).toBe(true);
      expect(result.truncatedDiffs.length + result.droppedFiles.length).toBeGreaterThan(0);
    }
  });

  it("preserves added file content (no full-file drop for added)", () => {
    const files = [
      makeFile({ path: "new.ts", status: "added", content: "new file content" }),
    ];
    const diff = makeDiff(files);

    const result = applyTokenBudget(diff, 9, DEFAULT_BUDGET, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.truncated).toBe(false);
    }
  });
});
