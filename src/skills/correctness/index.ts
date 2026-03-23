import type { SkillMetadata, DiffContext, DetectedContext } from "../../types.js";

export const metadata: SkillMetadata = {
  id: "correctness",
  name: "Correctness",
  description: "Logic errors, edge cases, error handling, async correctness, type safety.",
  requires: {
    language: ["*"],
    framework: ["*"],
  },
  produces: "correctness",
};

export function buildPrompt(diff: DiffContext, ctx: DetectedContext): string {
  const fileDiffs = diff.files
    .filter((f) => f.status !== "deleted")
    .map((f) => {
      const header = `### ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`;
      return `${header}\n\`\`\`\n${f.diff}\n\`\`\``;
    })
    .join("\n\n");

  return `You are reviewing code for **correctness** in a ${ctx.language} project.
Analyze ONLY the changed lines (added/modified) in the diff below. Do not flag issues in deleted code.

## What to check

1. **Logic errors** -- wrong conditions, inverted checks, off-by-one, incorrect operator precedence
2. **Null / undefined handling** -- missing null checks before member access, optional chaining gaps, uninitialized variables
3. **Error handling** -- uncaught exceptions, swallowed errors with empty catch blocks, missing error propagation
4. **Async correctness** -- missing await, unhandled promise rejections, race conditions, concurrent mutation of shared state
5. **Type safety** -- unsafe casts, implicit any, incorrect generics, narrowing gaps
6. **Boundary conditions** -- empty arrays/strings, zero-length input, integer overflow, division by zero
7. **Control flow** -- unreachable code after early return, missing break in switch, fallthrough bugs

## Rules

- Only flag issues where the code is **demonstrably wrong** or has a **concrete failure scenario**. Do not flag style preferences.
- For each finding, you MUST provide the specific file, line range, and a concrete scenario that triggers the bug.
- Positive findings (things done well) are encouraged when the code handles edge cases correctly.

## Diff

${fileDiffs}

## Output format

For each finding, output:
- Polarity: positive | improvement
- Severity (improvements only): critical | high | medium | low
- File: <path>
- Lines: <start>-<end>
- Summary: one-line description
- Detail: full explanation with the concrete failure scenario
- Suggestion (improvements only): the fix`;
}
