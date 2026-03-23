// ---- Git / Branch ----

export interface BranchContext {
  projectName: string;
  repoRoot: string;
  baseBranch: string;
  headBranch: string;
  repoUrl: string;
}

// ---- Diff ----

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
  additions: number;
  deletions: number;
  diff: string;
  content?: string;
}

export interface PrEnrichment {
  prNumber?: number;
  prTitle?: string;
  prDescription?: string;
  prUrl?: string;
  existingComments?: {
    author: string;
    body: string;
    file?: string;
    line?: number;
  }[];
  reviewers?: string[];
  labels?: string[];
}

export interface DiffContext extends BranchContext {
  files: ChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
  enrichment?: PrEnrichment;
}

// ---- Orchestrator / Skill system ----

export interface DetectedContext {
  language: string;
  framework: string[];
  patterns: string[];
  fileCount: number;
  primaryChangedAreas: string[];
}

export type SkillRequires = {
  language?: string[];
  framework?: string[];
  patterns?: string[];
};

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  requires: SkillRequires;
  produces: string;
}

export interface SkillModule {
  metadata: SkillMetadata;
  buildPrompt: (diff: DiffContext, ctx: DetectedContext) => string;
}

// ---- Review output ----

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Polarity = "positive" | "improvement";

export interface ReviewFinding {
  polarity: Polarity;
  severity?: Severity;
  track: string;
  file?: string;
  lines?: string;
  summary: string;
  detail: string;
  suggestion?: string;
}

export type Verdict = "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION";
