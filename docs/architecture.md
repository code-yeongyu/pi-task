# Architecture

Status: IMPLEMENTED

`pi-task` uses the public pi SDK and extension APIs. The extension owns task lifecycle state, result persistence, process supervision, and UI projection.

Core rule: background task errors, abrupt process exits, resume state, and final responses must remain visible through `task_status`.

## Components

- `agents`: markdown agent registry with pi/senpi-compatible search paths.
- `permissions`: senpi-compatible last-match-wins rule evaluation for task policy.
- `runtime`: task state, result store, runners, resume reconciliation, and model fallback.
- `tools`: `task`, `task_status`, `task_cancel`.
- `ui`: compact status and widget rendering.

## Runtime Modes

In-process mode is the default. `InProcessRunner` creates a child `AgentSession` with `createAgentSession()`, records the child session id, injects the selected subagent prompt into the task prompt, and returns the last assistant text as the final response.

Process mode uses `ProcessTaskRunner` and `ProcessRunner`. It launches a separate `senpi`/current-runtime process in JSON print mode, includes task id, parent/root session ids, and subagent type in the prompt, records the child pid, parses the final assistant response from JSON lines, and reports `killed` when the process exits by signal.

`CompositeTaskRunner` routes by `task.executionMode`, so both modes share persistence, logging, cancellation, status UI, and fallback handling.

## Agent Definition And Task Policy

Markdown agents are loaded from project and user `.pi` / `.senpi` locations, including `~/.senpi/agents/agents`. Code can also define agents by importing `defineAgent()` or `registerAgent()` from `pi-task`.

Nested tasks are enforced before a task record is created:

- Top-level parent sessions may create depth-1 tasks.
- Default `maxDepth` is `1`.
- A parent agent's `allowedSubagents` permits the named target even beyond depth.
- Frontmatter task permissions can allow or deny `task:<agent>` or `task` patterns.
- Denied delegations return a `denied` status and do not start a runner.

## Persistence And Resume

Task records are atomically written to `~/.senpi/task/tasks/<task-id>.json`. Final responses and errors remain available through `task_status` after the task finishes.

On `session_start`, `TaskManager.resume()` reloads persisted task records. Completed terminal tasks are restored as resumed. Running process tasks are reconciled by pid and heartbeat state; missing pids, dead pids, or stale heartbeats become `lost` with an explanation. Running in-process tasks from a previous process also become `lost` because their memory-local child loop cannot be reattached.

Task JSONL logs are written to `~/.senpi/task/logs/<task-id>.jsonl`; token/password/secret/authorization/api-key-like fields are redacted.

## Pi Event Mapping

`pi-task` centralizes event registrations in an event bridge:

- `session_start`: reload persisted task records, reconcile process-mode tasks, restore status UI, and append a compact `pi-task.event`.
- `session_shutdown`: append shutdown state and refresh UI.
- `agent_start` / `agent_end`: append parent lifecycle markers.
- `tool_call` / `tool_result`: append tool lifecycle markers without treating event order as authoritative state.
- `model_select`: refresh inherited parent model context.
- `before_agent_start`: inject concise task guidance once.

Detailed logs are file-backed JSONL records. Compact summaries use `pi.appendEntry()` so resume can reconstruct parent-visible task history.

## Public API Boundary

Runtime code must use `@mariozechner/pi-coding-agent` public exports only. If a public SDK capability is insufficient for native child sessions, `pi-task` reports an explicit unsupported state instead of importing private internals.

## Limitations

## TUI Surface

`syncTaskStatusToUi()` renders a footer status (`tasks:N run:N done:N err:N`) and a below-editor widget for active tasks. `/tasks` shows all known tasks. `/task-kill` opens pi's selector/confirmation UI for cancellation; that inherits pi TUI keyboard handling and mouse handling where the installed TUI exposes it. `task_cancel` provides model/tool-call cancellation in all modes.
