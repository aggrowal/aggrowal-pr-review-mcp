import { describe, it, expect } from "vitest";
import { formatReviewAsMarkdown } from "../src/review/format-markdown.js";
import type { ReviewReport } from "../src/review-contract/types.js";

function makeReport(overrides?: Partial<ReviewReport>): ReviewReport {
  return {
    schemaVersion: 1,
    project: "test-project",
    branch: { head: "feature/auth", base: "main" },
    stack: { language: "typescript", frameworks: ["express"] },
    verdict: "NEEDS_DISCUSSION",
    contractCompliance: { status: "PASS" },
    trackCoverage: [
      {
        trackId: "correctness",
        overallStatus: "needs_improvement",
        headings: [
          {
            id: "A",
            title: "Contract Correctness",
            status: "looks_good",
            passedSubpoints: [1, 2, 3],
            failedSubpoints: [],
            why: "all pointers are positive",
          },
          {
            id: "B",
            title: "Data Integrity",
            status: "needs_improvement",
            passedSubpoints: [4, 5],
            failedSubpoints: [6],
            why: "missing uniqueness check on email field",
          },
        ],
      },
    ],
    strengths: [
      "Good input validation on the registration endpoint",
      "Proper error handling in the auth middleware",
    ],
    issues: [
      {
        status: "needs_improvement",
        trackId: "correctness",
        file: "src/auth/register.ts",
        lines: "12-15",
        summary: "Missing uniqueness check on email",
        why: "Duplicate registrations could create conflicting records",
        betterImplementation: "Add a unique constraint or check-before-insert logic",
      },
      {
        status: "nudge",
        trackId: "correctness",
        summary: "Consider adding rate limiting to the login endpoint",
        why: "Brute force attempts are not bounded",
      },
    ],
    summary: "The auth implementation is solid but needs a uniqueness check on email registration.",
    ...overrides,
  };
}

describe("formatReviewAsMarkdown", () => {
  it("produces well-structured markdown", () => {
    const md = formatReviewAsMarkdown({
      review: makeReport(),
      provider: "mcp_client_sampling",
      model: "claude-sonnet-4-20250514",
      attempts: 1,
      latencyMs: 3200,
    });

    expect(md).toContain("# PR Review: test-project");
    expect(md).toContain("**feature/auth** -> **main**");
    expect(md).toContain("## Verdict: NEEDS DISCUSSION");
    expect(md).toContain("## Strengths");
    expect(md).toContain("Good input validation");
    expect(md).toContain("## Needs Improvement");
    expect(md).toContain("Missing uniqueness check on email");
    expect(md).toContain("src/auth/register.ts:12-15");
    expect(md).toContain("## Nudges");
    expect(md).toContain("rate limiting");
    expect(md).toContain("## Track Coverage");
    expect(md).toContain("### correctness");
    expect(md).toContain("2/3 passed");
    expect(md).toContain("mcp_client_sampling");
    expect(md).toContain("3200ms");
  });

  it("handles APPROVE verdict with no issues", () => {
    const md = formatReviewAsMarkdown({
      review: makeReport({
        verdict: "APPROVE",
        issues: [],
      }),
      provider: "anthropic",
      model: "claude-3-haiku",
      attempts: 1,
      latencyMs: 1500,
    });

    expect(md).toContain("## Verdict: APPROVE");
    expect(md).not.toContain("## Blockers");
    expect(md).not.toContain("## Needs Improvement");
    expect(md).not.toContain("## Nudges");
  });

  it("shows blocker section for REQUEST_CHANGES", () => {
    const md = formatReviewAsMarkdown({
      review: makeReport({
        verdict: "REQUEST_CHANGES",
        issues: [
          {
            status: "blocker",
            trackId: "security-generic",
            file: "src/auth.ts",
            summary: "Hardcoded API key",
            why: "Secret exposed in source code",
          },
        ],
      }),
      provider: "openai",
      model: "gpt-4o",
      attempts: 2,
      latencyMs: 5000,
    });

    expect(md).toContain("## Verdict: REQUEST CHANGES");
    expect(md).toContain("## Blockers");
    expect(md).toContain("Hardcoded API key");
    expect(md).toContain("2 attempts");
  });
});
