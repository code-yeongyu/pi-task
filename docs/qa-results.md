# QA Results

Status: PASSED

Command-backed evidence from May 16, 2026:

- `npm test`: passed, 19 files / 41 tests.
- `npm run check`: passed, `tsgo --noEmit` and `biome check .`.
- `bun --install=fallback /Users/yeongyu/.config/opencode/skills/typescript-programmer/scripts/check-no-excuse-rules.ts src test scripts`: passed, no no-excuse violations.
- `npm run qa:import`: passed, `import ok`.
- `npm run qa:process-kill`: passed, child pid was reported and direct `SIGTERM` produced `killed`.
- `npm run qa:senpi-install`: passed dry-run for `~/.senpi/agent/extensions/pi-task`.
- `npm pack --dry-run`: passed, `pi-task-0.1.3.tgz`, 40 files.

Manual QA scenario note:

- `/var/folders/nj/hqfr8ndn5q56cqw7jqgbrck40000gn/T/ulw-scenarios.XXXXXX.md.WidgZz2Lwo`

Residual notes:

- `pi` is not installed on this machine; `senpi` is installed and is the verified host command.
- Full interactive mouse QA depends on the installed pi TUI selector behavior. The extension uses `ctx.ui.select()` and `ctx.ui.confirm()` so keyboard support is covered by public API and mouse support follows the host TUI.
- Codex-hosted external verifier agents were requested three times, but each attempt was blocked by the Codex account usage limit before an independent pass/fail result could be produced.
- A separate read-only `senpi` verifier process produced one fail report, the reported blockers were fixed, and the rerun produced `VERIFIER PASS`.
- An actual `openai/gpt-5.2` xhigh read-only `senpi` judge first failed on flaky sleeps and cancellation coverage; those blockers were fixed, and the rerun produced `GPT-5.2 XHIGH PASS`.
