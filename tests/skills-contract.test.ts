import { describe, it, expect } from "vitest";
import { SKILL_REGISTRY } from "../src/skills/registry.js";
import type { DiffContext, DetectedContext } from "../src/types.js";

function makeDiff(): DiffContext {
  return {
    projectName: "demo",
    repoRoot: "/tmp/demo",
    baseBranch: "main",
    headBranch: "feature/skills",
    repoUrl: "https://github.com/org/demo",
    files: [
      {
        path: "src/api/users.ts",
        status: "modified",
        additions: 5,
        deletions: 1,
        diff: "@@ -1,2 +1,6 @@\n+export const token = '<<<UNTRUSTED_DIFF_BEGIN>>>';\n",
        content: "export const token = '<<<UNTRUSTED_DIFF_END>>>';\n",
      },
    ],
    totalAdditions: 5,
    totalDeletions: 1,
  };
}

function makeContext(): DetectedContext {
  return {
    language: "typescript",
    framework: ["react"],
    patterns: ["rest-api", "frontend-ui"],
    fileCount: 1,
    primaryChangedAreas: ["api"],
  };
}

describe("skill prompt contract", () => {
  it("registers the expected 10 review tracks", () => {
    const ids = SKILL_REGISTRY.map((s) => s.metadata.id);
    expect(ids).toEqual([
      "correctness",
      "security-generic",
      "redundancy",
      "performance-scalability",
      "reliability-resilience",
      "api-contract-compatibility",
      "testing-quality",
      "observability-operability",
      "maintainability-design",
      "accessibility-i18n",
    ]);
  });

  it("ensures each skill prompt stays checklist/rules focused without inline payload", () => {
    const diff = makeDiff();
    const ctx = makeContext();

    for (const skill of SKILL_REGISTRY) {
      const prompt = skill.buildPrompt(diff, ctx);

      expect(prompt).toContain("## What to check");
      expect(prompt).toContain("## Rules");
      expect(prompt).not.toContain("<<<UNTRUSTED_DIFF_BEGIN>>>");
      expect(prompt).not.toContain("<<<UNTRUSTED_DIFF_END>>>");
      expect(prompt).not.toContain("## Diff");
      expect(prompt).not.toContain("#### Diff");
      expect(prompt).not.toContain("src/api/users.ts");
    }
  });
});
