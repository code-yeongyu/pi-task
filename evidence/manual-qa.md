# Manual QA Evidence

Date: 2026-05-16

Scenario note path:

```text
/var/folders/nj/hqfr8ndn5q56cqw7jqgbrck40000gn/T/ulw-scenarios.XXXXXX.md.WidgZz2Lwo
```

Verified manually:

- `npm run qa:import` loads the extension default export.
- `npm run qa:process-kill` records pid and reports `killed` after direct external `SIGTERM`.
- `npm run qa:senpi-install` resolves the local install symlink target.
- `npm test` now covers 19 files / 37 tests, including nested task policy and code-defined agents.
- `senpi --help` confirms `senpi install <source>` and `--extension/-e` host support.
- `command -v pi` returned no binary on this machine, so local host checks use `senpi`.

Automated gates are summarized in `docs/qa-results.md`.
