# Release

Status: READY

Repository setup:

```bash
gh repo create code-yeongyu/pi-task --public --source=. --push
gh repo edit code-yeongyu/pi-task --description "Task subagent extension for pi" --add-topic pi --add-topic senpi --add-topic subagents
```

Release setup:

```bash
git tag v0.1.1
git push origin v0.1.1
gh release create v0.1.1 --generate-notes
```
