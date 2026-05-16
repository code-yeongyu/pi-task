# pi-task

Task subagent extension for the pi coding agent.

`pi-task` registers `task`, `task_status`, and `task_cancel` so parent agents can start foreground or background subagents, inspect final responses, see internal errors, cancel work, and reconcile process-mode tasks after resume.

## Features

- Default in-process child agent sessions through the public pi SDK.
- Optional separate process mode with pid reporting and external-kill detection.
- Background task state, final responses, and errors retrievable with `task_status`.
- Session resume reconciliation through `~/.senpi/task/tasks/*.json`.
- JSONL task logs under `~/.senpi/task/logs/*.jsonl` with secret-like fields redacted.
- Agent frontmatter loading from `.pi`, `.senpi`, `~/.pi/agent`, `~/.senpi/agent`, and `~/.senpi/agents`.
- Model fallback for `models: [provider/a, provider/b]`.
- TUI footer/widget status plus `/tasks`, `/task-kill`, and a keyboard shortcut.

See [docs/spec.md](docs/spec.md), [docs/architecture.md](docs/architecture.md), and [docs/qa-results.md](docs/qa-results.md).

## Agent Example

```md
---
description: Find facts with read-only tools
background: true
executionMode: in-process
models:
  - openai/gpt-5.5-fast
  - anthropic/claude-opus-4-7
allowedSubagents:
  - github-librarian
  - web-librarian
tools:
  read: allow
  bash:
    "rg *": allow
---
You are a careful finder. Return concise evidence with file paths.
```

Place agents in paths such as `~/.senpi/agents/agents/finder.md` or project `.senpi/agents/finder.md`.

## Development

```bash
npm install
npm test
npm run typecheck
npm run check
npm pack --dry-run
senpi -e ./src/index.ts
```

## Local Install

```bash
node scripts/qa-senpi-install.mjs --force
```

This installs a local symlink at `~/.senpi/agent/extensions/pi-task`.

## License

[MIT](LICENSE).
