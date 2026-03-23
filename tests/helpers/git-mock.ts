import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export interface MockRepo {
  path: string;
  cleanup: () => void;
}

/**
 * Creates a temporary git repo with an initial commit on "main".
 * Returns the repo path and a cleanup function.
 */
export function createMockRepo(): MockRepo {
  const repoPath = mkdtempSync(join(tmpdir(), "pr-review-test-"));

  execSync("git init", { cwd: repoPath, stdio: "pipe" });
  execSync("git checkout -b main", { cwd: repoPath, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: repoPath,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', { cwd: repoPath, stdio: "pipe" });

  writeFileSync(join(repoPath, "README.md"), "# test\n");
  execSync("git add -A && git commit -m 'initial commit'", {
    cwd: repoPath,
    stdio: "pipe",
  });

  return {
    path: repoPath,
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  };
}

/**
 * Creates a new branch in the repo and checks it out.
 */
export function createBranch(repoPath: string, branchName: string): void {
  execSync(`git checkout -b "${branchName}"`, {
    cwd: repoPath,
    stdio: "pipe",
  });
}

/**
 * Switches to an existing branch.
 */
export function checkoutBranch(repoPath: string, branchName: string): void {
  execSync(`git checkout "${branchName}"`, {
    cwd: repoPath,
    stdio: "pipe",
  });
}

/**
 * Writes files and commits them. Keys are relative paths, values are content.
 */
export function addFiles(
  repoPath: string,
  files: Record<string, string>,
  commitMessage = "add files"
): void {
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(repoPath, relPath);
    const dir = join(absPath, "..");
    mkdirSync(dir, { recursive: true });
    writeFileSync(absPath, content);
  }
  execSync("git add -A", { cwd: repoPath, stdio: "pipe" });
  execSync(`git commit -m "${commitMessage}"`, {
    cwd: repoPath,
    stdio: "pipe",
  });
}
