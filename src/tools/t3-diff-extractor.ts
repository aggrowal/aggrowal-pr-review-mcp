import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { BranchContext, ChangedFile, DiffContext } from "../types.js";

export interface DiffExtractorOk {
  ok: true;
  diff: DiffContext;
}

export interface DiffExtractorError {
  ok: false;
  reason: string;
  hint: string;
}

export type DiffExtractorResult = DiffExtractorOk | DiffExtractorError;

/**
 * T3 -- Diff Extractor
 *
 * Uses local git to build a complete picture of what changed between
 * baseBranch and headBranch. Diffs against the merge-base (the point where
 * the branch diverged from base) to avoid false positives from unrelated
 * commits that landed on base after the branch was cut.
 */
export function runDiffExtractor(
  context: BranchContext
): DiffExtractorResult {
  const { repoRoot, baseBranch, headBranch } = context;

  // Step 1: find merge-base
  let mergeBase: string;
  try {
    mergeBase = execSync(
      `git merge-base "${baseBranch}" "${headBranch}"`,
      { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch {
    return {
      ok: false,
      reason: `Could not find a common ancestor between "${baseBranch}" and "${headBranch}".`,
      hint: `Make sure both branches share history. Try: git fetch origin ${baseBranch}`,
    };
  }

  // Step 2: get name-status
  let nameStatus: string;
  try {
    nameStatus = execSync(
      `git diff --name-status "${mergeBase}" "${headBranch}"`,
      { cwd: repoRoot, encoding: "utf-8" }
    );
  } catch (e) {
    return {
      ok: false,
      reason: "Failed to list changed files.",
      hint: String(e),
    };
  }

  if (!nameStatus.trim()) {
    return {
      ok: false,
      reason: `No differences found between "${baseBranch}" and "${headBranch}".`,
      hint: "The branches may be identical or the head branch has no new commits.",
    };
  }

  // Step 3: get full diff with context lines
  let fullDiff: string;
  try {
    fullDiff = execSync(
      `git diff -U6 "${mergeBase}" "${headBranch}"`,
      { cwd: repoRoot, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );
  } catch (e) {
    return { ok: false, reason: "Failed to generate diff.", hint: String(e) };
  }

  // Step 4: get numstat for addition/deletion counts
  let numStatRaw: string;
  try {
    numStatRaw = execSync(
      `git diff --numstat "${mergeBase}" "${headBranch}"`,
      { cwd: repoRoot, encoding: "utf-8" }
    );
  } catch {
    numStatRaw = "";
  }

  const numStatMap = parseNumStat(numStatRaw);

  // Step 5: parse file list and build ChangedFile[]
  const files: ChangedFile[] = [];
  const lines = nameStatus.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const parts = line.split("\t");
    const statusCode = parts[0].trim();
    const filePath = parts[1].trim();
    const oldPath = statusCode.startsWith("R") ? parts[1].trim() : undefined;
    const actualPath = statusCode.startsWith("R")
      ? parts[2]?.trim() ?? filePath
      : filePath;

    const status = resolveStatus(statusCode);
    const stats = numStatMap.get(actualPath) ?? { additions: 0, deletions: 0 };

    const fileDiff = sliceFileDiff(fullDiff, actualPath, oldPath);

    let content: string | undefined;
    if (status !== "deleted") {
      const absPath = join(repoRoot, actualPath);
      if (existsSync(absPath)) {
        try {
          content = readFileSync(absPath, "utf-8");
        } catch {
          // Binary or unreadable
        }
      } else {
        try {
          content = execSync(
            `git show "${headBranch}:${actualPath}"`,
            { cwd: repoRoot, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
          );
        } catch {
          /* ignore */
        }
      }
    }

    files.push({
      path: actualPath,
      status,
      oldPath: status === "renamed" ? oldPath : undefined,
      additions: stats.additions,
      deletions: stats.deletions,
      diff: fileDiff,
      content,
    });
  }

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return {
    ok: true,
    diff: {
      ...context,
      files,
      totalAdditions,
      totalDeletions,
      enrichment: undefined,
    },
  };
}

// ---- Helpers ----

function resolveStatus(code: string): ChangedFile["status"] {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code.startsWith("R")) return "renamed";
  return "modified";
}

function parseNumStat(
  raw: string
): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    const [add, del, path] = line.split("\t");
    if (path) {
      map.set(path.trim(), {
        additions: parseInt(add, 10) || 0,
        deletions: parseInt(del, 10) || 0,
      });
    }
  }
  return map;
}

function sliceFileDiff(
  fullDiff: string,
  filePath: string,
  oldPath?: string
): string {
  const sections = fullDiff.split(/(?=^diff --git )/m);
  for (const section of sections) {
    if (
      section.includes(`b/${filePath}`) ||
      (oldPath && section.includes(`a/${oldPath}`))
    ) {
      return section.trim();
    }
  }
  return "";
}
