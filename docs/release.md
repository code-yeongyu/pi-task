# Release

Status: COMPLETED

Repository setup:

```bash
gh repo create code-yeongyu/pi-task --public --source=. --push
gh repo edit code-yeongyu/pi-task --description "Task subagent extension for pi" --add-topic pi --add-topic senpi --add-topic subagents
```

Release setup:

```bash
git tag v0.1.2
git push origin v0.1.2
gh release create v0.1.2 --generate-notes
```

Current public repository:

- `https://github.com/code-yeongyu/pi-task`
- Visibility: public.
- Latest tag: `v0.1.2`.
- Latest release: `https://github.com/code-yeongyu/pi-task/releases/tag/v0.1.2`.
- CI status: latest `main` push succeeded on GitHub Actions.
- Release workflow status: latest `v0.1.2` release workflow succeeded. The npm publish step is configured to skip when `NODE_AUTH_TOKEN` is not present.
