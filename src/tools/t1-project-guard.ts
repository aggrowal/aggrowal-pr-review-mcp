import { execSync } from "child_process";
import { basename } from "path";
import { getProjectConfig } from "../config.js";
import type { Logger } from "../logger.js";

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
  detail?: string;
}

export type ProjectGuardResult = ProjectGuardOk | ProjectGuardError;

interface AutoDetectedConfig {
  repoUrl: string;
  mainBranch: string;
}

function autoDetectProjectConfig(repoRoot: string, logger: Logger): AutoDetectedConfig | null {
  let repoUrl: string | undefined;
  try {
    repoUrl = execSync("git remote get-url origin", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    logger.debug("T1: no origin remote found");
    return null;
  }

  if (!repoUrl) return null;

  let mainBranch = "main";
  try {
    const headRef = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const match = /refs\/remotes\/origin\/(.+)$/.exec(headRef);
    if (match) {
      mainBranch = match[1];
    }
  } catch {
    for (const candidate of ["main", "master"]) {
      try {
        execSync(`git rev-parse --verify "origin/${candidate}"`, {
          cwd: repoRoot,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        mainBranch = candidate;
        break;
      } catch {
        continue;
      }
    }
  }

  return { repoUrl, mainBranch };
}

/**
 * T1 -- Project Guard
 *
 * Validates that the working directory is inside a git repo whose folder name
 * matches a configured project. Falls back to auto-detection from git remote
 * when no explicit config exists.
 */
export function runProjectGuard(
  cwd: string,
  logger: Logger,
  configPath?: string
): ProjectGuardResult {
  let repoRoot: string;
  const gitCmd = "git rev-parse --show-toplevel";
  logger.debug(`T1: running "${gitCmd}"`, { cwd });
  try {
    repoRoot = execSync(gitCmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const stderr = e instanceof Error ? (e as any).stderr?.toString?.() ?? String(e) : String(e);
    logger.error("T1: git rev-parse failed", { cwd, stderr });
    return {
      ok: false,
      reason: "Not inside a git repository.",
      hint:
        "Navigate to a git repository directory, or initialize one with: git init",
      detail: `Command "${gitCmd}" failed in ${cwd}: ${stderr}`,
    };
  }

  logger.debug("T1: repo root resolved", { repoRoot });

  const projectName = basename(repoRoot);
  logger.debug("T1: looking up project config", { projectName, configPath });

  const projectConfig = getProjectConfig(projectName, configPath);
  if (projectConfig) {
    logger.debug("T1: project config found", {
      projectName,
      repoUrl: projectConfig.repoUrl,
      mainBranch: projectConfig.mainBranch,
    });

    return {
      ok: true,
      repoRoot,
      projectName,
      mainBranch: projectConfig.mainBranch,
      repoUrl: projectConfig.repoUrl,
    };
  }

  logger.info("T1: no explicit config, auto-detecting from git remote", { projectName });
  const autoDetected = autoDetectProjectConfig(repoRoot, logger);
  if (!autoDetected) {
    return {
      ok: false,
      reason: `Project "${projectName}" is not configured and auto-detection failed.`,
      hint:
        `Run configure_project with name: "${projectName}" to register this project.\n` +
        `Or add a git remote: git remote add origin <url>`,
      detail: `Looked up "${projectName}" in config and tried git remote auto-detection.`,
    };
  }

  logger.info("T1: auto-detected project config", {
    projectName,
    repoUrl: autoDetected.repoUrl,
    mainBranch: autoDetected.mainBranch,
  });

  return {
    ok: true,
    repoRoot,
    projectName,
    mainBranch: autoDetected.mainBranch,
    repoUrl: autoDetected.repoUrl,
  };
}
