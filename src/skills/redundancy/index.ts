import type { SkillMetadata, DiffContext, DetectedContext } from "../../types.js";

export const metadata: SkillMetadata = {
  id: "redundancy",
  name: "Redundancy",
  description: "Duplication, dead code, unused imports, over-engineering.",
  requires: {
    language: ["*"],
    framework: ["*"],
  },
  produces: "redundancy",
};

const UNTRUSTED_BEGIN = "<<<UNTRUSTED_DIFF_BEGIN>>>";
const UNTRUSTED_END = "<<<UNTRUSTED_DIFF_END>>>";

function escapeSentinels(raw: string): string {
  return raw
    .replaceAll(UNTRUSTED_BEGIN, "<<_UNTRUSTED_DIFF_BEGIN_>>")
    .replaceAll(UNTRUSTED_END, "<<_UNTRUSTED_DIFF_END_>>");
}

export function buildPrompt(diff: DiffContext, ctx: DetectedContext): string {
  const fileEntries = diff.files
    .filter((f) => f.status !== "deleted")
    .map((f) => {
      const parts: string[] = [];
      parts.push(`### ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`);
      parts.push("#### Diff");
      parts.push(`${UNTRUSTED_BEGIN}\n${escapeSentinels(f.diff)}\n${UNTRUSTED_END}`);
      if (f.content) {
        parts.push("#### Full file");
        parts.push(`${UNTRUSTED_BEGIN}\n${escapeSentinels(f.content)}\n${UNTRUSTED_END}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");

  return `You are reviewing code for **redundancy and waste** in a ${ctx.language} project.
Analyze the diff and full file contents below. The full file is provided so you can detect duplication against existing code.

## What to check

1. **Code duplication** -- new code that duplicates logic already present in the same file or another changed file. Look for copy-paste patterns with minor variations.
2. **Dead code** -- functions, variables, classes, or branches that are defined but never called/used within the visible scope
3. **Unused imports** -- modules imported but not referenced in the file
4. **Leftover debug code** -- console.log, print(), debugger statements, TODO/FIXME/HACK comments that ship to production
5. **Over-engineering** -- abstractions without a second use case, unnecessary indirection layers, premature generalization
6. **Reinvented utilities** -- reimplementing what the language stdlib or a project dependency already provides (e.g., hand-rolling array dedup when Set exists)

## Rules

- For duplication, reference both the new code and the existing code it duplicates. Provide file paths and line ranges for both.
- Do not flag intentional repetition where abstraction would reduce clarity (e.g., similar test cases).
- Positive findings are encouraged when the code avoids common redundancy traps (good use of shared utilities, clean imports, etc.).

## Changed files

${fileEntries}

## Output format

For each finding, output:
- Polarity: positive | improvement
- Severity (improvements only): critical | high | medium | low
- File: <path>
- Lines: <start>-<end>
- Summary: one-line description
- Detail: full explanation
- Suggestion (improvements only): the fix`;
}
