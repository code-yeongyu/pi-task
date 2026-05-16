# External Verifier Checklist

Status: READY FOR EXTERNAL VERIFICATION

The verifier must inspect code, docs, tests, QA evidence, Git history, and local install output.

Approval requires:

- `task`, `task_status`, and `task_cancel` are registered.
- Background final responses and errors are retrievable.
- Resume preserves terminal state.
- Abrupt process disappearance is detected and explained.
- Pi lifecycle/tool events are mapped in code and task logs redact sensitive fields.
- Process mode records pid and external kill evidence.
- In-process is the default.
- Permissions, default depth, allowed-subagent override, agent schema, code-defined agents, and model fallback match `docs/spec.md`.
