import type { SkillMetadata, DiffContext, DetectedContext } from "../../types.js";

export const metadata: SkillMetadata = {
  id: "security-generic",
  name: "Security (generic)",
  description: "Secrets, injection, auth gaps, insecure defaults, crypto weaknesses.",
  requires: {
    language: ["*"],
    framework: ["*"],
  },
  produces: "security",
};

export function buildPrompt(diff: DiffContext, ctx: DetectedContext): string {
  const fileDiffs = diff.files
    .filter((f) => f.status !== "deleted")
    .map((f) => {
      const header = `### ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`;
      return `${header}\n\`\`\`\n${f.diff}\n\`\`\``;
    })
    .join("\n\n");

  return `You are reviewing code for **security vulnerabilities** in a ${ctx.language} project.
Analyze ONLY the changed lines (added/modified) in the diff below.

## What to check

1. **Hardcoded secrets** -- API keys, passwords, tokens, private keys, connection strings committed in source
2. **Injection** -- SQL injection (string concatenation in queries), command injection (unsanitized shell input), XSS (unescaped user input in HTML), template injection
3. **Authentication / authorization** -- missing auth checks on endpoints, privilege escalation paths, broken access control
4. **Insecure deserialization** -- parsing untrusted JSON/YAML/XML without validation, pickle.loads on user input
5. **Weak cryptography** -- MD5/SHA1 for security purposes, ECB mode, hardcoded IVs, Math.random for security
6. **CORS / headers** -- overly permissive CORS (origin: *), missing security headers, exposed stack traces
7. **Path traversal** -- user-controlled file paths without sanitization, directory traversal via ..
8. **Unsafe eval / exec** -- eval(), exec(), Function(), child_process with unsanitized input
9. **Dependency concerns** -- importing known-vulnerable patterns, disabled security features

## Rules

- Only flag issues with a **realistic attack vector**. Do not flag theoretical concerns that have no plausible exploitation path in context.
- For each finding, describe the specific attack scenario.
- Positive findings are encouraged when the code demonstrates good security practices (input validation, parameterized queries, etc.).

## Diff

${fileDiffs}

## Output format

For each finding, output:
- Polarity: positive | improvement
- Severity (improvements only): critical | high | medium | low
- File: <path>
- Lines: <start>-<end>
- Summary: one-line description
- Detail: full explanation with the attack scenario
- Suggestion (improvements only): the fix`;
}
