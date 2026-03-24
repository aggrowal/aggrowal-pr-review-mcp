import { execSync } from "child_process";
import type { Logger } from "../logger.js";
import type { BranchContext, PrEnrichment } from "../types.js";

export interface DiffEnrichmentOptions {
  enabled?: boolean;
  provider?: "git" | "github";
  maxCommits?: number;
}

export interface DiffEnrichmentProvider {
  id: string;
  enrich(
    context: BranchContext,
    logger: Logger,
    options: Required<DiffEnrichmentOptions>
  ): PrEnrichment | undefined;
}

class GitEnrichmentProvider implements DiffEnrichmentProvider {
  readonly id = "git";

  enrich(
    context: BranchContext,
    logger: Logger,
    options: Required<DiffEnrichmentOptions>
  ): PrEnrichment | undefined {
    const commitRange = `${context.baseBranch}..${context.headBranch}`;
    const logCmd = `git log --format=%s%n%b%x1e "${commitRange}" --max-count=${options.maxCommits}`;
    logger.debug("Enrichment: collecting git metadata", {
      provider: this.id,
      commitRange,
      maxCommits: options.maxCommits,
    });

    try {
      const raw = execSync(logCmd, {
        cwd: context.repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      if (!raw) return undefined;

      const entries = raw
        .split("\u001e")
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (entries.length === 0) return undefined;

      const [firstEntry] = entries;
      const firstLines = firstEntry.split("\n");
      const title = firstLines[0]?.trim();
      const description = firstLines
        .slice(1)
        .map((line) => line.trimEnd())
        .join("\n")
        .trim();

      return {
        prTitle: title || undefined,
        prDescription: description || undefined,
        prUrl: buildCompareUrl(
          context.repoUrl,
          context.baseBranch,
          context.headBranch
        ),
      };
    } catch (error) {
      logger.warn("Enrichment: git metadata collection failed", {
        provider: this.id,
        detail: String(error),
      });
      return undefined;
    }
  }
}

class GitHubEnrichmentProvider implements DiffEnrichmentProvider {
  readonly id = "github";

  enrich(
    context: BranchContext,
    logger: Logger,
    _options: Required<DiffEnrichmentOptions>
  ): PrEnrichment | undefined {
    logger.debug("Enrichment: fetching PR metadata via gh CLI", {
      provider: this.id,
      branch: context.headBranch,
    });

    try {
      execSync("gh --version", {
        cwd: context.repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      logger.warn("Enrichment: gh CLI not found, falling back to git enrichment");
      return new GitEnrichmentProvider().enrich(context, logger, _options);
    }

    try {
      const ghFields = "number,title,body,url,labels";
      const ghCmd = `gh pr view "${context.headBranch}" --json ${ghFields}`;
      const raw = execSync(ghCmd, {
        cwd: context.repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15_000,
      }).trim();

      if (!raw) {
        logger.warn("Enrichment: gh pr view returned empty, falling back to git");
        return new GitEnrichmentProvider().enrich(context, logger, _options);
      }

      const data = JSON.parse(raw) as {
        number?: number;
        title?: string;
        body?: string;
        url?: string;
        labels?: { name: string }[];
      };

      const enrichment: PrEnrichment = {
        prNumber: data.number,
        prTitle: data.title || undefined,
        prDescription: data.body || undefined,
        prUrl: data.url || buildCompareUrl(
          context.repoUrl,
          context.baseBranch,
          context.headBranch
        ),
        labels: data.labels?.map((l) => l.name).filter(Boolean),
      };

      logger.info("Enrichment: GitHub PR metadata collected", {
        prNumber: enrichment.prNumber,
        hasTitle: !!enrichment.prTitle,
        hasDescription: !!enrichment.prDescription,
        labels: enrichment.labels?.length ?? 0,
      });

      return enrichment;
    } catch (error) {
      const detail = String(error);
      if (detail.includes("no pull requests found") || detail.includes("Could not resolve")) {
        logger.info("Enrichment: no open PR found for branch, falling back to git");
      } else {
        logger.warn("Enrichment: gh pr view failed, falling back to git", {
          detail,
        });
      }
      return new GitEnrichmentProvider().enrich(context, logger, _options);
    }
  }
}

const PROVIDERS: Record<string, DiffEnrichmentProvider> = {
  git: new GitEnrichmentProvider(),
  github: new GitHubEnrichmentProvider(),
};

export function enrichDiffContext(
  context: BranchContext,
  logger: Logger,
  options?: DiffEnrichmentOptions
): PrEnrichment | undefined {
  const normalized: Required<DiffEnrichmentOptions> = {
    enabled: options?.enabled ?? false,
    provider: options?.provider ?? "git",
    maxCommits: options?.maxCommits ?? 5,
  };
  if (!normalized.enabled) return undefined;

  const provider = PROVIDERS[normalized.provider];
  if (!provider) {
    logger.warn("Enrichment: unknown provider requested", {
      provider: normalized.provider,
    });
    return undefined;
  }

  return provider.enrich(context, logger, normalized);
}

function buildCompareUrl(
  repoUrl: string,
  baseBranch: string,
  headBranch: string
): string | undefined {
  const normalized = normalizeRepoUrl(repoUrl);
  if (!normalized) return undefined;
  return `${normalized}/compare/${encodeURIComponent(
    baseBranch
  )}...${encodeURIComponent(headBranch)}`;
}

function normalizeRepoUrl(repoUrl: string): string | undefined {
  if (!repoUrl) return undefined;
  if (repoUrl.startsWith("http://") || repoUrl.startsWith("https://")) {
    return repoUrl.replace(/\.git$/, "");
  }

  const sshMatch = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(repoUrl.trim());
  if (!sshMatch) return undefined;
  return `https://${sshMatch[1]}/${sshMatch[2]}`;
}
