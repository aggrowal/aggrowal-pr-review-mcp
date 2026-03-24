# Platform Setup Guide

This guide covers how to configure `aggrowal-pr-review-mcp` on each supported MCP host platform.

## How Execution Modes Work

The server supports three execution modes that determine how the LLM review call is made:

| Mode | Behavior | When to use |
|------|----------|-------------|
| `client_sampling` (default) | Forces use of the host's model via MCP sampling protocol | Chat-first/keyless operation in IDE clients |
| `auto` | Tries MCP sampling (host model) first, falls back to provider API when sampling is unavailable | Mixed-client environments where you want continuity |
| `provider_api` | Forces a direct Anthropic/OpenAI API call | When the host does not support sampling |

With default `client_sampling`, the review uses the model already available in your chat context and does not require provider API keys.
If you opt into `auto`, sampling is attempted first, and provider fallback requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

---

## Cursor

Cursor supports MCP sampling, so the default `client_sampling` mode uses your active Cursor model for the review.

### Configuration

Create or edit `.cursor/mcp.json` in your project root (or your global Cursor config):

```json
{
  "mcpServers": {
    "pr-review": {
      "command": "npx",
      "args": ["-y", "aggrowal-pr-review-mcp"],
      "env": {}
    }
  }
}
```

If you want provider fallback, set `executionMode` to `auto` and add an API key:

```json
{
  "mcpServers": {
    "pr-review": {
      "command": "npx",
      "args": ["-y", "aggrowal-pr-review-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### Usage

In the Cursor chat, type:

```
@pr_review branch: feature/my-branch
```

Cursor will route the review through its active model. Progress logs appear in the MCP output panel.

---

## Claude Code (claude CLI)

Claude Code supports MCP servers via the `claude mcp add` command or by editing `.claude/mcp_servers.json`.

### Configuration (CLI)

```bash
claude mcp add pr-review -- npx -y aggrowal-pr-review-mcp
```

To pass an API key for provider fallback:

```bash
claude mcp add pr-review \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -- npx -y aggrowal-pr-review-mcp
```

### Configuration (JSON)

Create or edit `.claude/mcp_servers.json` in your home directory:

```json
{
  "pr-review": {
    "command": "npx",
    "args": ["-y", "aggrowal-pr-review-mcp"],
    "env": {
      "ANTHROPIC_API_KEY": "sk-ant-..."
    }
  }
}
```

### Usage

In a Claude Code session:

```
use pr_review with branch: feature/my-branch
```

Claude Code uses its own model context for sampling. The default `client_sampling` mode works out of the box.

---

## Windsurf

Windsurf supports MCP servers via its configuration file.

### Configuration

Add to your Windsurf MCP configuration (typically `~/.windsurf/mcp.json` or project-level):

```json
{
  "mcpServers": {
    "pr-review": {
      "command": "npx",
      "args": ["-y", "aggrowal-pr-review-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

---

## Generic MCP Client (non-sampling hosts)

For MCP hosts that do not support the `createMessage` sampling protocol, use direct provider API calls:

### Configuration

1. Set up the MCP server with your host's config format, pointing to `npx -y aggrowal-pr-review-mcp`.

2. Set environment variables for the LLM provider:

```bash
# For Anthropic (default)
ANTHROPIC_API_KEY=sk-ant-...

# For OpenAI
OPENAI_API_KEY=sk-...
PR_REVIEW_PROVIDER=openai
```

3. Create the server config at `~/.pr-review-mcp/config.json`:

```json
{
  "version": 1,
  "projects": {},
  "reviewRuntime": {
    "executionMode": "provider_api",
    "provider": "anthropic"
  }
}
```

`executionMode: "provider_api"` skips sampling and always uses the configured provider API.
If you prefer `auto` for mixed environments, keep provider keys configured so fallback can run when sampling is unavailable.

---

## Environment Variables Reference

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | API key for Anthropic provider | (none) |
| `OPENAI_API_KEY` | API key for OpenAI provider | (none) |
| `PR_REVIEW_PROVIDER` | Override provider (`anthropic` or `openai`) | `anthropic` |
| `PR_REVIEW_MODEL` | Override model name | Provider default |
| `PR_REVIEW_TIMEOUT_MS` | LLM request timeout in milliseconds | `45000` |
| `PR_REVIEW_LOG` | Log level (`debug`, `info`, `warn`, `error`) | `info` |
| `PR_REVIEW_MAX_OUTPUT_TOKENS` | Max output tokens for provider API | Provider default |
| `PR_REVIEW_TEMPERATURE` | Temperature for LLM generation | Provider default |

---

## First-Time Project Setup

Before your first review, either:

**Option A: Auto-detection (recommended)**
Just run `@pr_review branch: feature/xyz` from inside your repo. The server auto-detects the project from `git remote`.

**Option B: Explicit configuration**
```
configure_project
  name: my-repo
  repoUrl: https://github.com/org/my-repo
  mainBranch: main
```

The project config is stored at `~/.pr-review-mcp/config.json` and persists across sessions.
