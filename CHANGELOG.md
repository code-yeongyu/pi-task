# Changelog

## 0.1.3

- Remove extension API type assertions flagged by the TypeScript no-excuse gate.
- Replace nondeterministic async sleeps in tests with deterministic synchronization.
- Add behavioral cancellation coverage and record GPT-5.2 xhigh no-slop verification.

## 0.1.2

- Stream process-mode pid and heartbeat updates while tasks are still running.
- Parse full YAML frontmatter so nested `tools:` permission policies are honored.
- Record independent verifier status in QA documentation.

## 0.1.1

- Enforce nested task depth, allowed subagent overrides, and frontmatter task permissions.
- Add code-defined agent registration helpers.

## 0.1.0

- Initial task subagent extension package.
