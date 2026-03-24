import type { DiffContext, ChangedFile } from "../types.js";
import type { Logger } from "../logger.js";

export interface TokenBudgetConfig {
  maxPromptChars: number;
  maxFiles: number;
  maxTotalLines: number;
}

export interface BudgetResult {
  ok: true;
  diff: DiffContext;
  truncated: boolean;
  droppedFiles: string[];
  droppedFullContent: string[];
  truncatedDiffs: string[];
}

export interface BudgetError {
  ok: false;
  reason: string;
  hint: string;
}

export type BudgetCheckResult = BudgetResult | BudgetError;

const OVERHEAD_CHARS_PER_TRACK = 3_500;
const STATIC_OVERHEAD_CHARS = 8_000;

export function applyTokenBudget(
  diff: DiffContext,
  matchedTrackCount: number,
  budget: TokenBudgetConfig,
  logger: Logger
): BudgetCheckResult {
  const totalLines = diff.totalAdditions + diff.totalDeletions;

  if (diff.files.length > budget.maxFiles) {
    logger.error("Budget: file count exceeds limit", {
      files: diff.files.length,
      maxFiles: budget.maxFiles,
    });
    return {
      ok: false,
      reason: `PR changes ${diff.files.length} files, exceeding the limit of ${budget.maxFiles}.`,
      hint: "Split the PR into smaller changes, or increase tokenBudget.maxFiles in config.",
    };
  }

  if (totalLines > budget.maxTotalLines) {
    logger.warn("Budget: total changed lines exceeds limit", {
      totalLines,
      maxTotalLines: budget.maxTotalLines,
    });
    return {
      ok: false,
      reason: `PR has ${totalLines} changed lines (+${diff.totalAdditions}/-${diff.totalDeletions}), exceeding the limit of ${budget.maxTotalLines}.`,
      hint: "Split the PR into smaller changes, or increase tokenBudget.maxTotalLines in config.",
    };
  }

  const trackOverhead = matchedTrackCount * OVERHEAD_CHARS_PER_TRACK;
  const payloadBudget = budget.maxPromptChars - STATIC_OVERHEAD_CHARS - trackOverhead;

  if (payloadBudget <= 0) {
    return {
      ok: true,
      diff,
      truncated: false,
      droppedFiles: [],
      droppedFullContent: [],
      truncatedDiffs: [],
    };
  }

  const currentPayloadChars = estimatePayloadChars(diff.files);

  if (currentPayloadChars <= payloadBudget) {
    logger.debug("Budget: payload within budget", {
      payloadChars: currentPayloadChars,
      payloadBudget,
    });
    return {
      ok: true,
      diff,
      truncated: false,
      droppedFiles: [],
      droppedFullContent: [],
      truncatedDiffs: [],
    };
  }

  logger.warn("Budget: payload exceeds budget, truncating", {
    payloadChars: currentPayloadChars,
    payloadBudget,
  });

  return truncateDiff(diff, payloadBudget, logger);
}

function estimatePayloadChars(files: ChangedFile[]): number {
  let total = 0;
  for (const f of files) {
    total += f.path.length + 80;
    total += f.diff.length;
    if (f.content && f.status !== "deleted" && f.status !== "added") {
      total += f.content.length;
    }
  }
  return total;
}

function truncateDiff(
  diff: DiffContext,
  payloadBudget: number,
  logger: Logger
): BudgetResult {
  const droppedFullContent: string[] = [];
  const truncatedDiffs: string[] = [];
  const droppedFiles: string[] = [];

  const files = diff.files
    .map((f) => ({ ...f, content: f.content }))
    .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));

  // Phase 1: drop full-file content for modified files (keep diffs)
  for (const f of files) {
    if (f.content && f.status !== "deleted" && f.status !== "added") {
      f.content = undefined;
      droppedFullContent.push(f.path);
    }
  }

  if (estimatePayloadChars(files) <= payloadBudget) {
    logger.info("Budget: fit within budget after dropping full-file content", {
      droppedCount: droppedFullContent.length,
    });
    return {
      ok: true,
      diff: { ...diff, files },
      truncated: true,
      droppedFiles,
      droppedFullContent,
      truncatedDiffs,
    };
  }

  // Phase 2: truncate large diffs (keep first N lines + tail marker)
  const maxDiffLines = 200;
  for (const f of files) {
    const lines = f.diff.split("\n");
    if (lines.length > maxDiffLines) {
      const omitted = lines.length - maxDiffLines;
      f.diff = lines.slice(0, maxDiffLines).join("\n") +
        `\n... (${omitted} lines truncated for token budget)`;
      truncatedDiffs.push(f.path);
    }
  }

  if (estimatePayloadChars(files) <= payloadBudget) {
    logger.info("Budget: fit within budget after truncating large diffs", {
      truncatedCount: truncatedDiffs.length,
    });
    return {
      ok: true,
      diff: { ...diff, files },
      truncated: true,
      droppedFiles,
      droppedFullContent,
      truncatedDiffs,
    };
  }

  // Phase 3: drop files with smallest changes until we fit
  const sorted = [...files].sort(
    (a, b) => (a.additions + a.deletions) - (b.additions + b.deletions)
  );

  const keptPaths = new Set(files.map((f) => f.path));
  for (const f of sorted) {
    if (estimatePayloadChars(files.filter((x) => keptPaths.has(x.path))) <= payloadBudget) {
      break;
    }
    keptPaths.delete(f.path);
    droppedFiles.push(f.path);
  }

  const keptFiles = files.filter((f) => keptPaths.has(f.path));
  const keptAdditions = keptFiles.reduce((s, f) => s + f.additions, 0);
  const keptDeletions = keptFiles.reduce((s, f) => s + f.deletions, 0);

  logger.info("Budget: dropped files to fit budget", {
    droppedFileCount: droppedFiles.length,
    keptFileCount: keptFiles.length,
  });

  return {
    ok: true,
    diff: {
      ...diff,
      files: keptFiles,
      totalAdditions: keptAdditions,
      totalDeletions: keptDeletions,
    },
    truncated: true,
    droppedFiles,
    droppedFullContent,
    truncatedDiffs,
  };
}
