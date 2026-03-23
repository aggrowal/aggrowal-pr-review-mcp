import { execSync } from "child_process";
import { basename } from "path";
import { getProjectConfig } from "../config.js";

export interface ProjectGuardOk {
  ok: true;
  repoRoot: string;
  projectName: string;
  mainBranch: string;
  repoUrl: string;
}

export interface ProjectGuardError {
  ok: false;
  reason: string;
  hint: string;
}

export type ProjectGuardResult = ProjectGuardOk | ProjectGuardError;

/**
 * T1 -- Project Guard
 *
 * Validates that the working directory is inside a git repo whose folder name
 * matches a configured project. Fails fast with actionable hints on any mismatch.
 */
export function runProjectGuard(
  cwd: string,
  configPath?: string
): ProjectGuardResult {
  // Step 1: confirm cwd is inside a git repo
  let repoRoot: string;
  try {
    repoRoot = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return {
      ok: false,
      reason: "Not inside a git repository.",
      hint:
        "Navigate to a git repository directory, or initialize one with: git init",
    };
  }

  // Step 2: derive project name from repo folder name
  const projectName = basename(repoRoot);

  // Step 3: look up project in config
  const projectConfig = getProjectConfig(projectName, configPath);
  if (!projectConfig) {
    return {
      ok: false,
      reason: `Project "${projectName}" is not configured.`,
      hint:
        `Run configure_project with name: "${projectName}" to register this project.\n` +
        `The project name must match the git repo folder name exactly.`,
    };
  }

  return {
    ok: true,
    repoRoot,
    projectName,
    mainBranch: projectConfig.mainBranch,
    repoUrl: projectConfig.repoUrl,
  };
}
