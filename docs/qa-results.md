# QA Results

Status: PASSED

Command-backed evidence from May 16, 2026:

- `npm test`: passed, 17 files / 30 tests.
- `npm run check`: passed, `tsgo --noEmit` and `biome check .`.
- `npm run qa:import`: passed, `import ok`.
- `npm run qa:process-kill`: passed, child pid was reported and direct `SIGTERM` produced `killed`.
- `npm run qa:senpi-install`: passed dry-run for `~/.senpi/agent/extensions/pi-task`.
- `npm pack --dry-run`: passed, `pi-task-0.1.0.tgz`, 36 files.

Manual QA scenario note:

- `/var/folders/nj/hqfr8ndn5q56cqw7jqgbrck40000gn/T/ulw-scenarios.XXXXXX.md.WidgZz2Lwo`

Residual notes:

- `pi` is not installed on this machine; `senpi` is installed and is the verified host command.
- Full interactive mouse QA depends on the installed pi TUI selector behavior. The extension uses `ctx.ui.select()` and `ctx.ui.confirm()` so keyboard support is covered by public API and mouse support follows the host TUI.
