# Pi Task Permissions UI Session Scope

## TL;DR
> Summary:      Harden `pi-task` so task visibility, child sessions, permissions, process state, cancellation, and resume behavior match the new acceptance criteria without making child chats appear as normal resumable sessions.
> Deliverables:
> - Session-scoped footer/widget and explicit all/specific list/status surfaces.
> - Isolated in-process and process child contexts with frontmatter-driven tool constraints.
> - Durable task metadata for model, execution mode, pid, parent/root session, progress, errors, final responses, process exit facts, and model fallback.
> - TDD fix for the `cancelled -> failed` crash race.
> - Agent-executed QA evidence, local `~/.senpi` install check, LSP/typecheck/no-slop/GPT-5.2 verification gate.
> Effort:       Large
> Risk:         High — multiple behavior contracts interact: session persistence, UI scope, tool permissions, async cancellation, process supervision, and external `senpi` SDK semantics.

## Scope
### Must have
- Footer/widget must render only tasks whose `rootSessionId` belongs to the current top-level parent session; a new main session must not show stale persisted tasks from another root session.
- Explicit status/list surfaces must still support all tasks and specific tasks by id, including stale/persisted tasks from other parents when explicitly requested.
- Footer/widget and `task_status` must expose agent/subagent type, current model, model attempts/fallbacks, execution mode, pid, task status/state, task id, parent session, root session, child session id where present, progress, error, final response, and process exit/lost facts.
- In-process task children must use isolated, non-forked, non-resumable child sessions by default. They must not create session files discoverable by `/resume`.
- Process-mode task children must use `--no-session`, persist pid/exit/lost facts, support task-level resume through `pi-task` state where observable, and not create child sessions discoverable by `/resume`.
- Child task sessions must honor agent frontmatter `tools`, `permission`, `disallowedTools`, `allowedSubagents`, `maxDepth`, and task permissions by constraining active tools and blocking disallowed calls in child contexts.
- Process mode must pass `--tools` or `--no-tools` to match the same resolved child tool scope used by in-process mode.
- `task:<agent>` and `task` permissions must enable the `task` tool only when nested delegation is actually permitted; default max depth remains `1`, and `allowedSubagents` still overrides depth.
- The `InvalidTaskTransitionError: cancelled -> failed` race must be fixed with a failing-first test so cancellation followed by runner failure never crashes the parent session.
- Pi event system/status APIs must be used deliberately: `ctx.ui.setStatus`, `ctx.ui.setWidget`, `tool_call`, `tool_result`, `model_select`, task lifecycle logs, and model fallback logs must tell the same story.
- Local `~/.senpi` installation must be verified through the existing install script plus symlink assertion.

### User AS-IS Korean Requirements (verbatim)
```text
이 task 도구는 background, subagent type (category 는 없어도됨, 그리고 기본값이라는 개념도 있어야하는데, 이거는 ../free-code 참고하셈) 이런개념들이 있어야 하고,
~/.senpi/agents/agents 같은곳에서 opencode 와 비슷한 느낌으로 스키마를 잡아주시면 됩니다

그리고 task 도구는 설정에 따라서 in-process 로 서브에이전트 에이전트 루프를 만들지, 별도 프로세스로 서브에이전트 루프로 만들지를 결정할 수 있으며, 기본적으로는 인 프로세스로 돌아야 합니다.
그리고 free-code 가 그렇듯 화면에 잘 띄워지게 해주시고 현황이나 이런거를, 정보가 전반적으로 필요한 정보들이 뭐일지 고민하고 다른애들은 뭘 보여주는지를 고민하고 이게 실시간으로 화면에 잘 보여질 수 있도록 해주세요. 그리고 제가 부탁하고 싶은건, 만약 별도 프로세스 모드로 돌 경우, 별도 프로세스를 직접 죽이게 되면 그것이 잘 감지가 되어야 합니다. 그리고 pid 가 잘 떠야하고, 운영체제 상관없이 다 잘 돌아야합니다. 그런 설계를 해주셔야 합니다.
그리고 activity monitor 에서 어떤 서브에이전트가 어디를 통해서 어떤게 띄워졌고 어떤건지를 볼 수 있어야합니다

모드에 상관없이 서브에이전트를 tui 상에서 직접 죽일수도 있어야하고, 이는 키보드 마우스 다 잘 지원되어야 합니다 직관적인 ux 와 함께. 이것도 깊게 고려해주세요 외부 전문가 호출해서요.

오픈코드 마냥 parent session 이라는 개념이 있어서 이거를 추적 할 수 있어야하고, opencode 마냥 서브가 서브를 가질 수 도 있으나 이러한것들에 대한 깊이도 정할 수 있어야합니다(기본은 1) - 그리고 나중에는 뭐 에이전트 정책에 따라서 다른애들 얘네중에서만 호출할 수 있다 이런것도 agents 의 md frontmatter 에서 정의가 가능해야합니다. 예를들어서, finder 라는 에이전트가 있고 frontmatter 에 호출가능한 서브에이전트 목록이 정의돼있고, 그 안에 github-librarian, web-librarian 이렇게 정의되어있다면 이거는 무조건 호출이 가능함을 의미합니다. (뎁스가 1이더라도, 이것이 더 우선함)

그리고 도구 호출에 대한 권한 관리의 경우 퍼미션 관련 ../senpi 에 정의된게 있는데 이거가 있으면 같이 쓸 수 있도록 하게하는 그런느낌이었으면 좋겠고
백그라운드로 뭔가 에이전트들이 뒤에서 돌고있을경우 이거에 대한 상태값을 잘 표현해줄 수 있어야하며, 여전히 돌고있거나, 아니면 에이전트가 돌다가 내부적으로 에러가 났거나에 대한 것들도 잘 다룰수있도록 해주세요
그리고 model 의 경우 정의되지않으면 부모를 따라가지만, models: [a, b, c] 이렇게 정의한다면 a 가 돌다가 실패하면 폴백으로 b 로 전환되는 그런게 있어야 합니다. 전환의 경우 세션 도중에 모델을 바꿔서 재시도하는 느낌으로 되어야 합니다.

그리고 또한 설정에서 / 혹은 코드로써도 에이전트를 정의해줄수도 있는 느낌이어야해요 pi sdk extension api 뭐 이런거 다 보고 opencode 도 예시로 다 봐주세요

조사해야할게 많고 봐야할게 많고 하니, 일단은 explorer 를 병렬로 6개 뭐 이렇게 요소별로 잔뜩 본 뒤에 모두 합쳐서 합친 조사 내용을 기록하고, 플래닝에이전트 소환해서 플래닝하면서 스펙문서 확실히 적어두고 그 안에다가 제가 말한거 as is 로도 꼭 적어두고

qa 를 어떻게할것인지 qa plan 도 넣어주고 그 실제로 모듈만 임포트해서 어떻게 테스트할건지 이런것도 꼭 봐주시고요. 그리고 실제로 그거대로 qa 한 내용도 안에 다 기록을 해주셔야해요.
```

Key complaint to preserve:

```text
꼭 백그라운드 에이전트 잘 관리해주고 오류시에도 메인 에이전트가 잘 인지할 수 있게 해주고 최종응답도 잘 볼 수 있게해줘야함 그게 핵심이다
```

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not make in-process child sessions persistent by default or visible in `/resume`.
- Must not fork parent chat history into child sessions unless a future explicit option requests it. This plan does not add that option.
- Must not show tasks from other root sessions in the footer/widget.
- Must not hide task history from explicit `task_status <id>` or `/tasks --all`.
- Must not silently widen tool access when frontmatter is ambiguous. Unknown child permission must be blocked in non-interactive child contexts unless explicitly allowed by resolved active tools/rules.
- Must not import private `senpi` or `pi-mono` internals. Use public SDK/extension APIs, or mirror small semantics locally with tests.
- Must not change `senpi` core, `pi-mono`, or sibling extensions.
- Must not add broad compatibility layers, migration code, or unrelated refactors. Existing data compatibility is not a concern here.
- Must not use `as any`, `@ts-ignore`, `@ts-expect-error`, empty `catch`, shell `sleep`, destructive git commands, or real API calls in unit tests.

## Verification strategy
> Zero human intervention — all verification is agent-executed.
- Test decision: TDD + Vitest unit/integration tests, focused QA scripts, TypeScript strict check, Biome, LSP diagnostics, and one independent GPT-5.2 xhigh read-only review.
- QA policy: every task has agent-executed scenarios
- Evidence: `evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5–8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: task view scope and session-root filtering API
- Task 2: rich task display formatter and UI text contract
- Task 3: child tool-scope resolver for frontmatter permissions
- Task 4: cancellation race TDD and terminal-safe transitions
- Task 5: process metadata persistence contract
- Task 6: non-persistent isolated child session contract

Wave 2 (after Wave 1):
- Task 7: scoped footer/widget plus `/tasks` all/specific/session filters, depends [1, 2]
- Task 8: expanded `task_status` output and explicit status semantics, depends [1, 2, 5]
- Task 9: in-process child tool enforcement and permission gate, depends [3, 6]
- Task 10: process-mode `--tools`/`--no-tools` enforcement, depends [3, 5]
- Task 11: real-time event bridge/status synchronization and model fallback logging, depends [1, 2, 4]
- Task 12: process resume/lost/killed state exposure, depends [5, 10]

Wave 3 (after Wave 2):
- Task 13: task-level resume without `/resume` leakage, depends [6, 10, 12]
- Task 14: docs and release-facing acceptance updates, depends [7, 8, 9, 10, 11, 12, 13]
- Task 15: manual QA scripts and evidence capture, depends [7, 8, 9, 10, 12, 13]

Critical path: Task 3 → Task 9 → Task 13 → Task 15 → F3

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1 | none | 7, 8, 11 | 2, 3, 4, 5, 6 |
| 2 | none | 7, 8, 11 | 1, 3, 4, 5, 6 |
| 3 | none | 9, 10 | 1, 2, 4, 5, 6 |
| 4 | none | 11 | 1, 2, 3, 5, 6 |
| 5 | none | 8, 10, 12 | 1, 2, 3, 4, 6 |
| 6 | none | 9, 13 | 1, 2, 3, 4, 5 |
| 7 | 1, 2 | 14, 15 | 8, 9, 10, 11, 12 |
| 8 | 1, 2, 5 | 14, 15 | 7, 9, 10, 11, 12 |
| 9 | 3, 6 | 13, 14, 15 | 7, 8, 10, 11, 12 |
| 10 | 3, 5 | 12, 13, 14, 15 | 7, 8, 9, 11 |
| 11 | 1, 2, 4 | 14 | 7, 8, 9, 10, 12 |
| 12 | 5, 10 | 13, 14, 15 | 7, 8, 9, 11 |
| 13 | 6, 10, 12 | 14, 15 | none |
| 14 | 7, 8, 9, 10, 11, 12, 13 | F1, F4 | 15 |
| 15 | 7, 8, 9, 10, 12, 13 | F3 | 14 |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Task view scope and session-root filtering API

  What to do: Write failing tests first for scoped task lists. Add a small scope type, for example `TaskListScope`, and update `TaskManager.list()` or add `TaskManager.listForScope()` so callers can request current root session tasks, a specific root/parent session, a specific task id, or all tasks. Keep persisted records loaded so explicit all/id reads still work. Use `rootSessionId` as the footer/widget scope key for nested children.
  Must NOT do: Do not delete persisted tasks from other sessions. Do not make UI scope the same thing as storage scope.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [7, 8, 11] | Blocked by: []

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `src/runtime/task-manager.ts:81-87` — current unscoped `get()` and `list()`.
  - Pattern:  `src/runtime/task-manager.ts:97-105` — resume loads all persisted tasks.
  - API/Type: `src/runtime/types.ts:33-59` — `TaskRecord` already has `parentSessionId` and `rootSessionId`.
  - Test:     `test/runtime/result-store.test.ts:21-73` — persisted list/reload pattern.
  - Test:     `test/runtime/task-manager-persistence.test.ts:56-90` — resume from store pattern.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/task-manager-persistence.test.ts -t "#given tasks from multiple root sessions #when listing current root #then hides other roots but keeps all explicit"` passes and output is saved to `evidence/task-1-session-scope.log`.
  - [ ] `npm test -- test/runtime/task-manager-persistence.test.ts -t "#given persisted tasks from another root #when manager resumes #then explicit all can still list them"` passes.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: current root list hides stale tasks
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/task-manager-persistence.test.ts -t "#given tasks from multiple root sessions #when listing current root #then hides other roots but keeps all explicit" | tee evidence/task-1-session-scope.log
    Expected: command exits 0; scoped list contains only root A; all list contains root A and root B.
    Evidence: evidence/task-1-session-scope.log

  Scenario: explicit id ignores current UI scope
    Tool:     bash
    Steps:    npm test -- test/runtime/task-manager-persistence.test.ts -t "#given scoped manager #when getting a task by id from another root #then task_status can still find it" | tee evidence/task-1-specific-id.log
    Expected: command exits 0; explicit id lookup returns the task from the other root.
    Evidence: evidence/task-1-specific-id.log
  ```

  Commit: YES | Message: `feat(runtime): scope task lists by root session` | Files: [`src/runtime/task-manager.ts`, `src/runtime/types.ts`, `test/runtime/task-manager-persistence.test.ts`]

- [ ] 2. Rich task display formatter and UI text contract

  What to do: Write failing formatter tests first. Expand UI formatting helpers so footer/widget/list rows include task id, agent/subagent type, model or inherited model label, execution mode, pid, status/state, parent/root session ids, child session id where present, latest progress, last error, final-response summary, resume state, and model fallback attempts. Keep footer compact but informative; put richer facts in widget/list rows.
  Must NOT do: Do not put other-session tasks in widget rows. Do not dump full final responses into the footer; long final/error text belongs in `task_status`.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [7, 8, 11] | Blocked by: []

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `src/ui/status.ts:16-53` — current `shortTask`, `formatTaskList`, `formatFooterStatus`, `syncTaskStatusToUi`.
  - API/Type: `src/runtime/types.ts:33-59` — fields available for display.
  - Pattern:  `src/runtime/task-manager.ts:207-265` — final response, error, child session, pid, and model attempt lifecycle are persisted.
  - External: `https://pi.dev/packages/pi-subagents` — status metadata pattern: status record, event stream, output/error, final model, attempted models.
  - External: `https://dev.opencode.ai/docs/server/` — parent session and per-session status API precedent.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/ui/status.test.ts | tee evidence/task-2-ui-format.log` passes.
  - [ ] Test assertions prove widget lines contain `task_`, `agent:finder`, `model:provider/a`, `mode:process`, `pid:1234`, `state:running`, `parent:parent-a`, `root:root-a`, and latest progress/error/final snippets.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: active task row shows operational facts
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/ui/status.test.ts -t "#given active task with model pid and progress #when formatting widget #then row shows operational facts" | tee evidence/task-2-widget-active.log
    Expected: command exits 0; assertion checks task id, agent, model, mode, pid, state, parent/root, and progress.
    Evidence: evidence/task-2-widget-active.log

  Scenario: terminal task row summarizes error and final response
    Tool:     bash
    Steps:    npm test -- test/ui/status.test.ts -t "#given terminal tasks #when formatting list #then error and final summaries remain visible" | tee evidence/task-2-terminal-list.log
    Expected: command exits 0; assertion checks failed/lost/completed rows include error/final snippets without footer overflow.
    Evidence: evidence/task-2-terminal-list.log
  ```

  Commit: YES | Message: `feat(ui): render rich task status facts` | Files: [`src/ui/status.ts`, `test/ui/status.test.ts`]

- [ ] 3. Child tool-scope resolver for frontmatter permissions

  What to do: Write failing tests first for resolving child active tools from `AgentInfo.tools`, `AgentInfo.permission`, `disallowedTools`, `allowedSubagents`, `maxDepth`, current task depth, and target nested delegation rules. Add a pure helper such as `resolveChildToolScope()` in a new runtime module. The helper must return either unconstrained default tools, an explicit allowlist, or no-tools. It must include `task` only when the child can legally delegate further through `allowedSubagents`, `maxDepth`, or explicit `task` / `task:<agent>` allow rules. It must remove every name in `disallowedTools`.
  Must NOT do: Do not infer broad tool access from `ask`. In child non-interactive contexts, unresolved permission is not active permission. Do not let `allowedSubagents` bypass normal tool denial except for enabling `task` enough to call permitted nested agents.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [9, 10] | Blocked by: []

  References (executor has NO interview context — be exhaustive):
  - API/Type: `src/agents/schema.ts:4-21` — `AgentInfo` includes `tools`, `permission`, `allowedSubagents`, `disallowedTools`, `maxDepth`.
  - Pattern:  `src/permissions/rules.ts:13-40` — last-match-wins evaluator and `task:<agent>` helper.
  - Pattern:  `src/runtime/task-policy.ts:5-43` — default max depth `1`, allowlist override, task permission checks.
  - Test:     `test/agents/loader.test.ts:59-78` — nested `tools:` frontmatter becomes task permission rules.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/sdk.md:466-512` — `createAgentSession({ tools })`, `noTools: "all"`, `noTools: "builtin"`.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/src/cli/args.ts:104-112` and `:232-235` — CLI `--no-tools` and `--tools`.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/src/core/extensions/builtin/permission-system/evaluate.ts:14-28` — last-match-wins and pattern matching precedent.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/tool-scope.test.ts | tee evidence/task-3-tool-scope.log` passes.
  - [ ] Tests cover allowlist, deny override, `disallowedTools`, no tools, `task:<agent>`, `task` pattern, default depth `1`, `maxDepth > 1`, and `allowedSubagents` depth override.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: allowed tools become explicit child allowlist
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/tool-scope.test.ts -t "#given agent tool allows and disallowedTools #when resolving child scope #then allowlist excludes denied names" | tee evidence/task-3-allowlist.log
    Expected: command exits 0; allowlist includes allowed tools and excludes every disallowed tool.
    Evidence: evidence/task-3-allowlist.log

  Scenario: task tool is active only for permitted nesting
    Tool:     bash
    Steps:    npm test -- test/runtime/tool-scope.test.ts -t "#given depth one child #when no nested permission exists #then task tool is not active" | tee evidence/task-3-task-depth.log
    Expected: command exits 0; depth-1 default child has no `task`, while `allowedSubagents` or explicit `task:<agent>` enables it.
    Evidence: evidence/task-3-task-depth.log
  ```

  Commit: YES | Message: `feat(runtime): resolve child tool scope from agent permissions` | Files: [`src/runtime/tool-scope.ts`, `test/runtime/tool-scope.test.ts`]

- [ ] 4. Cancellation race TDD and terminal-safe transitions

  What to do: Write a failing test where a background runner receives abort, `manager.cancel()` transitions to `cancelled`, then the runner rejects with an error. Fix the parent crash by making the async runner catch/finalization path terminal-aware: if current task is already terminal, preserve it and log the runner failure as suppressed/late, never transition `cancelled -> failed`. Apply the same guard before final runner results and fallback transitions if a task has become terminal concurrently.
  Must NOT do: Do not allow a cancelled task to become failed. Do not swallow the late error entirely; keep it in logs or progress/error metadata without changing terminal status.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [11] | Blocked by: []

  References (executor has NO interview context — be exhaustive):
  - Bug:      `src/runtime/task-manager.ts:147-155` — catch path unconditionally transitions current task to `failed`.
  - Bug:      `src/runtime/task-manager.ts:292-300` — cancel transitions immediately to `cancelled`.
  - API/Type: `src/runtime/task-state.ts:16-27` — `cancelled` is terminal and has no outgoing transitions.
  - API/Type: `src/runtime/task-state.ts:65-68` — invalid transition throws `InvalidTaskTransitionError`.
  - Test:     `test/runtime/task-manager-persistence.test.ts:128-159` — current cancellation persistence coverage.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/task-manager.test.ts -t "#given cancelled task #when runner later rejects #then parent promise preserves cancelled without transition crash" | tee evidence/task-4-cancel-race.log` passes.
  - [ ] `npm test -- test/runtime/task-manager-persistence.test.ts -t "#given running task #when cancelled #then abort signal and persisted status are updated"` still passes.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: cancellation followed by runner failure preserves cancelled
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/task-manager.test.ts -t "#given cancelled task #when runner later rejects #then parent promise preserves cancelled without transition crash" | tee evidence/task-4-cancel-race.log
    Expected: command exits 0; promise resolves to status `cancelled`; no `InvalidTaskTransitionError` appears.
    Evidence: evidence/task-4-cancel-race.log

  Scenario: normal runner failure still fails
    Tool:     bash
    Steps:    npm test -- test/runtime/task-manager.test.ts -t "#given active task #when runner rejects without cancellation #then task becomes failed" | tee evidence/task-4-normal-failure.log
    Expected: command exits 0; non-cancelled runner rejection still produces status `failed`.
    Evidence: evidence/task-4-normal-failure.log
  ```

  Commit: YES | Message: `fix(runtime): preserve cancelled tasks on late runner failure` | Files: [`src/runtime/task-manager.ts`, `test/runtime/task-manager.test.ts`, `test/runtime/task-manager-persistence.test.ts`]

- [ ] 5. Process metadata persistence contract

  What to do: Write failing tests first for process pid, exit code, exit signal, heartbeat/lost reason, and clear process state strings. Extend `RunnerResult` and `TaskRecord` only as needed to persist process exit facts. Keep existing `pid`, `heartbeatAt`, `status`, and `lastError`; add fields such as `exitCode` and `exitSignal` only if tests need durable display of killed/failed process facts.
  Must NOT do: Do not invent a second status enum that conflicts with `TaskStatus`. If adding a display state, derive it from status plus process facts.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [8, 10, 12] | Blocked by: []

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `src/runtime/process-runner.ts:22-29` — low-level result already has `exitCode` and `exitSignal`.
  - Gap:      `src/runtime/task-manager.ts:246-256` — final transition persists pid/child/final/error but not exit facts.
  - Pattern:  `src/runtime/process-reconcile.ts:10-32` — missing pid/dead pid/stale heartbeat lost messages.
  - Pattern:  `scripts/qa-process-kill.mjs:6-30` — direct process-kill QA.
  - Constraint:`AGENTS.md:26-28` — process pids and abrupt disappearance must be reported truthfully.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/process-task-runner.test.ts test/runtime/task-state.test.ts | tee evidence/task-5-process-metadata.log` passes.
  - [ ] Tests assert killed process status includes pid and exit signal, failed process status includes exit code where available, and lost process includes stable error code/message.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: killed process facts persist
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/process-task-runner.test.ts -t "#given process killed by signal #when mapped to task result #then pid and signal remain visible" | tee evidence/task-5-killed-signal.log
    Expected: command exits 0; mapped result contains status `killed`, pid, and signal.
    Evidence: evidence/task-5-killed-signal.log

  Scenario: lost process facts remain clear
    Tool:     bash
    Steps:    npm test -- test/runtime/process-reconcile.test.ts | tee evidence/task-5-process-lost.log
    Expected: command exits 0; lost task has code `process_pid_missing` or `process_disappeared` with clear message.
    Evidence: evidence/task-5-process-lost.log
  ```

  Commit: YES | Message: `feat(runtime): persist process exit facts` | Files: [`src/runtime/types.ts`, `src/runtime/task-state.ts`, `src/runtime/task-manager.ts`, `src/runtime/process-task-runner.ts`, `test/runtime/task-state.test.ts`, `test/runtime/process-task-runner.test.ts`, `test/runtime/process-reconcile.test.ts`]

- [ ] 6. Non-persistent isolated child session contract

  What to do: Write failing tests first proving in-process child sessions are created with `SessionManager.inMemory(cwd)` by default and never fork from the parent session. Update the default in-process session creation path to use an in-memory session manager. Preserve `childSessionId` in the task record for task/activity tracking, but do not make that session discoverable by `/resume`.
  Must NOT do: Do not use `SessionManager.create(input.cwd)` for default child sessions. Do not use `forkFrom`, `continueRecent`, parent messages, or parent session file as child context.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [9, 13] | Blocked by: []

  References (executor has NO interview context — be exhaustive):
  - Bug:      `src/runtime/in-process-runner.ts:94-109` — current default uses `SessionManager.create(input.cwd)`, which can create persistent sessions.
  - Pattern:  `src/runtime/in-process-runner.ts:73-85` — child prompt is already isolated to subagent instructions and task prompt.
  - Pattern:  `src/runtime/in-process-runner.ts:133-171` — ancestry is tracked separately from chat persistence.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/sdk.md:684-687` — `SessionManager.inMemory()`.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/sdk.md:707-709` — `SessionManager.list()` / `listAll()` are what `/resume` uses conceptually.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/in-process-runner.test.ts -t "#given in-process child #when default session is created #then it uses in-memory non-forked persistence" | tee evidence/task-6-inmemory-child.log` passes.
  - [ ] Test asserts prompt contains task/subagent facts but no copied parent transcript marker.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: child session is in-memory by default
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/in-process-runner.test.ts -t "#given in-process child #when default session is created #then it uses in-memory non-forked persistence" | tee evidence/task-6-inmemory-child.log
    Expected: command exits 0; injected session factory receives/observes in-memory session manager semantics.
    Evidence: evidence/task-6-inmemory-child.log

  Scenario: child prompt does not fork parent transcript
    Tool:     bash
    Steps:    npm test -- test/runtime/in-process-runner.test.ts -t "#given parent transcript marker #when child prompt is built #then marker is absent" | tee evidence/task-6-no-fork.log
    Expected: command exits 0; child prompt includes subagent prompt and task prompt only.
    Evidence: evidence/task-6-no-fork.log
  ```

  Commit: YES | Message: `fix(runtime): keep in-process child sessions ephemeral` | Files: [`src/runtime/in-process-runner.ts`, `test/runtime/in-process-runner.test.ts`]

- [ ] 7. Scoped footer/widget plus `/tasks` all/specific/session filters

  What to do: Use the scope API and rich formatter to make `syncTaskStatusToUi()` accept the current root session id. Update event bridge/UI wiring to pass `ctx.sessionManager.getSessionId()` as the top-level root for non-child sessions. Extend `/tasks` parsing so default shows current root only, `/tasks --all` shows all known tasks, `/tasks --session <rootSessionId>` filters by root/parent session, and `/tasks <taskId>` shows a specific task. Update cancel picker to show only cancellable tasks in current root unless an explicit all/specific mode is added.
  Must NOT do: Do not let resumed persisted tasks from other roots appear in footer/widget. Do not remove `formatTaskList(manager.list())` behavior without replacing explicit all-list support.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [14, 15] | Blocked by: [1, 2]

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `src/ui/status.ts:43-53` — current UI sync uses global active list.
  - Bug:      `src/ui/status.ts:28-40` — footer counts `manager.list()` globally.
  - Bug:      `src/index.ts:25-29` — `/tasks` notification currently lists all tasks.
  - Pattern:  `src/index.ts:72-91` — command and shortcut wiring.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/extensions.md:2184-2216` — `ctx.ui.setStatus()` and `ctx.ui.setWidget()`.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/ui/status.test.ts test/index.test.ts | tee evidence/task-7-scoped-ui.log` passes.
  - [ ] Tests prove footer/widget use only current root, `/tasks --all` can list other roots, `/tasks <taskId>` can show stale task, and `/task-kill` default picker is current-root scoped.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: fresh session footer hides stale persisted tasks
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/ui/status.test.ts -t "#given resumed tasks from another root #when syncing current footer #then stale tasks are hidden" | tee evidence/task-7-footer-scope.log
    Expected: command exits 0; `setStatus` and `setWidget` receive only current-root task rows.
    Evidence: evidence/task-7-footer-scope.log

  Scenario: explicit all list shows stale tasks
    Tool:     bash
    Steps:    npm test -- test/index.test.ts -t "#given tasks from multiple roots #when tasks command uses all flag #then all tasks are notified" | tee evidence/task-7-tasks-all.log
    Expected: command exits 0; notify text contains tasks from current and stale roots.
    Evidence: evidence/task-7-tasks-all.log
  ```

  Commit: YES | Message: `feat(ui): scope task status to current session` | Files: [`src/ui/status.ts`, `src/index.ts`, `src/runtime/event-bridge.ts`, `test/ui/status.test.ts`, `test/index.test.ts`]

- [ ] 8. Expanded `task_status` output and explicit status semantics

  What to do: Expand `task_status` text and details to include all required task facts: `task_id`, `agent_type`, `status`, derived `state`, `execution_mode`, `model`, `model_attempts`, `pid`, `exit_code`, `exit_signal`, `parent_session_id`, `root_session_id`, `child_session_id`, `resume_state`, latest progress, full final response, and full error message/code. Keep `task_id` required for the tool, but document that it is explicit and can read any persisted task by id regardless of current UI scope.
  Must NOT do: Do not truncate final response or error in `task_status`; truncation is only for UI rows.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [14, 15] | Blocked by: [1, 2, 5]

  References (executor has NO interview context — be exhaustive):
  - Gap:      `src/tools/task-status.ts:5-49` — current details only include task id/status/pid and sparse text.
  - Pattern:  `src/runtime/types.ts:33-59` — task fields to expose.
  - Pattern:  `test/tools/task.test.ts:50-81` — background task can be polled by id.
  - Constraint:`README.md:5-12` — final responses, internal errors, process-mode reconciliation must be inspectable.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/tools/task-status.test.ts test/tools/task.test.ts | tee evidence/task-8-task-status.log` passes.
  - [ ] Tests assert `task_status` details object contains all required scalar fields and text includes full final response/error.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: completed task status includes final response and session facts
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/tools/task-status.test.ts -t "#given completed task #when status is requested #then final response and session facts are visible" | tee evidence/task-8-completed-status.log
    Expected: command exits 0; output includes final response, agent, model, mode, parent, root, and child session when present.
    Evidence: evidence/task-8-completed-status.log

  Scenario: failed process task status includes pid and error facts
    Tool:     bash
    Steps:    npm test -- test/tools/task-status.test.ts -t "#given failed process task #when status is requested #then pid exit and error facts are visible" | tee evidence/task-8-failed-process.log
    Expected: command exits 0; output includes pid, status/state, exit code or signal, error message, and resume state.
    Evidence: evidence/task-8-failed-process.log
  ```

  Commit: YES | Message: `feat(tools): expand task_status metadata` | Files: [`src/tools/task-status.ts`, `test/tools/task-status.test.ts`, `test/tools/task.test.ts`]

- [ ] 9. In-process child tool enforcement and permission gate

  What to do: Use the resolver from Task 3 in `InProcessRunner`. Extend `CreateSessionInput` to carry `tools?: string[]` and `noTools?: "all" | "builtin"`. Pass resolved `tools` or `noTools: "all"` into `createAgentSession()`. Add a child-local permission gate through public extension/event APIs where available, or a runner-level injected hook in tests, so disallowed tool calls are blocked with a clear permission message. Ensure `session.getActiveToolNames()`/`setActiveToolsByName()` behavior is used only if public on the session object. Keep child sessions ephemeral from Task 6.
  Must NOT do: Do not depend on private `senpi` permission-system internals. Do not let `ask` rules open access in non-interactive child contexts.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [13, 14, 15] | Blocked by: [3, 6]

  References (executor has NO interview context — be exhaustive):
  - Gap:      `src/runtime/in-process-runner.ts:35-44` — create session input lacks tools/noTools.
  - Gap:      `src/runtime/in-process-runner.ts:101-108` — `createAgentSession()` currently does not receive tools/noTools.
  - Pattern:  `src/runtime/in-process-runner.ts:123-173` — run lifecycle and child session id handling.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/src/core/sdk.ts:55-70` — public `noTools` and `tools` options.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/src/core/agent-session.ts:823` and `:2189-2191` — session active tool APIs are exposed through public extension runtime.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/extensions.md:674-688` — `tool_call` can block and mutate inputs.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/in-process-runner.test.ts test/runtime/tool-scope.test.ts | tee evidence/task-9-inprocess-tools.log` passes.
  - [ ] Tests assert `createSession` receives `tools` for allowlist, receives `noTools: "all"` for empty scope, and child `task` is active only when nested delegation is permitted.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: in-process child receives allowlisted tools
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/in-process-runner.test.ts -t "#given agent tool allowlist #when in-process child starts #then createAgentSession receives only allowed tools" | tee evidence/task-9-inprocess-allowlist.log
    Expected: command exits 0; observed child options contain exact tools and exclude disallowed names.
    Evidence: evidence/task-9-inprocess-allowlist.log

  Scenario: in-process child cannot delegate past default depth
    Tool:     bash
    Steps:    npm test -- test/runtime/in-process-runner.test.ts -t "#given depth one child without nested permission #when session starts #then task tool is disabled" | tee evidence/task-9-inprocess-task-disabled.log
    Expected: command exits 0; active tools do not include `task`.
    Evidence: evidence/task-9-inprocess-task-disabled.log
  ```

  Commit: YES | Message: `feat(runtime): constrain in-process child tools` | Files: [`src/runtime/in-process-runner.ts`, `src/runtime/tool-scope.ts`, `test/runtime/in-process-runner.test.ts`, `test/runtime/tool-scope.test.ts`]

- [ ] 10. Process-mode `--tools`/`--no-tools` enforcement

  What to do: Use the same child tool-scope resolver in `ProcessTaskRunner`. When scope is explicit allowlist, append `--tools` and the comma-separated list before the prompt. When scope is empty, append `--no-tools`. Keep `--no-session` always present. Preserve `--model` behavior. Add tests for argv order and quoting.
  Must NOT do: Do not pass both `--tools` and `--no-tools`. Do not drop `--no-session`. Do not build a shell command string; keep argv array with `shell: false`.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [12, 13, 14, 15] | Blocked by: [3, 5]

  References (executor has NO interview context — be exhaustive):
  - Gap:      `src/runtime/process-task-runner.ts:91-100` — current argv is `--mode json -p --no-session` plus optional model only.
  - Pattern:  `src/runtime/process-runner.ts:31-47` — process uses argv array and `shell: false`.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/src/cli/args.ts:104-112` — CLI parses `--no-tools` and `--tools`.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/src/cli/args.ts:232-235` — help text says `--tools` allowlists built-in, extension, and custom tools.
  - Test:     `test/runtime/process-task-runner.test.ts:7-53` — current argv/pid/final-response test pattern.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/process-task-runner.test.ts | tee evidence/task-10-process-tools.log` passes.
  - [ ] Tests assert process argv includes `--tools read,grep,task` for allowlist, includes `--no-tools` for empty scope, never includes child session persistence flags other than `--no-session`, and keeps model flag.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: process child receives tools allowlist
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/process-task-runner.test.ts -t "#given resolved child tool scope #when process task starts #then argv includes tools allowlist" | tee evidence/task-10-process-allowlist.log
    Expected: command exits 0; argv contains one `--tools` and exact comma-separated tool names.
    Evidence: evidence/task-10-process-allowlist.log

  Scenario: process child with no tools uses no-tools
    Tool:     bash
    Steps:    npm test -- test/runtime/process-task-runner.test.ts -t "#given empty child tool scope #when process task starts #then argv disables tools" | tee evidence/task-10-process-no-tools.log
    Expected: command exits 0; argv contains `--no-tools`, contains `--no-session`, and does not contain `--tools`.
    Evidence: evidence/task-10-process-no-tools.log
  ```

  Commit: YES | Message: `feat(runtime): constrain process child tools` | Files: [`src/runtime/process-task-runner.ts`, `src/runtime/tool-scope.ts`, `test/runtime/process-task-runner.test.ts`]

- [ ] 11. Real-time event bridge/status synchronization and model fallback logging

  What to do: Add a small manager change notification mechanism or UI status controller so async task lifecycle changes refresh `ctx.ui.setStatus` and `ctx.ui.setWidget` in real time using the last valid UI context and current root scope. Expand event bridge logging to include session id/root id where available, task lifecycle events, tool call/result, cancellation, process pid updates, and model fallback attempts. Ensure `model_select` parent model inheritance remains correct and fallback changes are visible in task progress/widget/logs.
  Must NOT do: Do not treat `tool_call` ordering as authoritative task state. `TaskManager` remains source of truth.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [14] | Blocked by: [1, 2, 4]

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `src/runtime/event-bridge.ts:27-73` — current event mapping.
  - Pattern:  `src/runtime/task-manager.ts:135-140` — `task_start` log data.
  - Pattern:  `src/runtime/task-manager.ts:177-241` — model attempt start/end/fallback logs.
  - Pattern:  `src/runtime/task-manager.ts:307-330` — runner update logs.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/extensions.md:674-688` — `tool_call` behavior.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/extensions.md:862-872` — context/session state caveat.
  - External: `https://github.com/code-yeongyu/oh-my-openagent/blob/dev/docs/reference/configuration.md` — `runtime_fallback.notify_on_fallback` precedent.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/event-bridge.test.ts test/runtime/task-manager.test.ts test/ui/status.test.ts | tee evidence/task-11-events-status.log` passes.
  - [ ] Tests assert UI sync is called on task start, pid/progress update, model fallback, cancellation, and terminal completion within current root scope.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: async progress refreshes widget
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/event-bridge.test.ts -t "#given manager update #when task progress changes #then scoped widget refreshes" | tee evidence/task-11-progress-widget.log
    Expected: command exits 0; fake UI records `setWidget` with latest progress for current root only.
    Evidence: evidence/task-11-progress-widget.log

  Scenario: model fallback is logged and visible
    Tool:     bash
    Steps:    npm test -- test/runtime/task-manager.test.ts -t "#given fallback models #when first model fails retryably #then fallback progress and logs are emitted" | tee evidence/task-11-model-fallback.log
    Expected: command exits 0; task progress/log includes fallback from first model to next model.
    Evidence: evidence/task-11-model-fallback.log
  ```

  Commit: YES | Message: `feat(runtime): sync scoped task UI on lifecycle events` | Files: [`src/runtime/task-manager.ts`, `src/runtime/event-bridge.ts`, `src/ui/status.ts`, `test/runtime/event-bridge.test.ts`, `test/runtime/task-manager.test.ts`, `test/ui/status.test.ts`]

- [ ] 12. Process resume/lost/killed state exposure

  What to do: Ensure resumed process tasks display and persist pid, heartbeat, exit/lost reason, and a clear state. Extend reconciliation tests for alive/fresh heartbeat, alive/stale heartbeat, dead pid, missing pid, killed by signal, and process runner cancellation. `task_status` and UI rows must distinguish `running`, `reconciled`, `killed`, `lost`, and `failed` with reason text.
  Must NOT do: Do not pretend a process is still running when pid is missing, dead, or heartbeat is stale. Do not mark an observable running process as terminal just because the parent session restarted.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [13, 14, 15] | Blocked by: [5, 10]

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `src/runtime/task-manager.ts:342-365` — resume reconciliation for process/in-process tasks.
  - Pattern:  `src/runtime/process-reconcile.ts:10-32` — process missing/dead/stale logic.
  - Pattern:  `src/runtime/process-runner.ts:85-121` — close result status mapping.
  - Test:     `test/runtime/process-reconcile.test.ts:6-32` — current reconciliation coverage.
  - Test:     `test/runtime/task-manager-persistence.test.ts:56-126` — resume and pid/heartbeat persistence.
  - Constraint:`AGENTS.md:26-28` — process pid and abrupt disappearance reporting.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/process-reconcile.test.ts test/runtime/task-manager-persistence.test.ts test/tools/task-status.test.ts | tee evidence/task-12-process-resume.log` passes.
  - [ ] Tests assert alive/fresh process remains running/reconciled; missing/dead/stale process becomes lost; killed process remains killed with pid/signal.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: alive process task remains observable after resume
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/task-manager-persistence.test.ts -t "#given running process with fresh heartbeat #when manager resumes #then task remains running and reconciled" | tee evidence/task-12-alive-process.log
    Expected: command exits 0; status is running/reconciled with same pid and heartbeat.
    Evidence: evidence/task-12-alive-process.log

  Scenario: stale process task becomes lost
    Tool:     bash
    Steps:    npm test -- test/runtime/process-reconcile.test.ts -t "#given stale heartbeat #when reconciling process task #then task becomes lost with disappeared reason" | tee evidence/task-12-stale-process.log
    Expected: command exits 0; status is `lost` with clear `process_disappeared` error.
    Evidence: evidence/task-12-stale-process.log
  ```

  Commit: YES | Message: `fix(runtime): expose truthful process resume state` | Files: [`src/runtime/process-reconcile.ts`, `src/runtime/task-manager.ts`, `src/tools/task-status.ts`, `src/ui/status.ts`, `test/runtime/process-reconcile.test.ts`, `test/runtime/task-manager-persistence.test.ts`, `test/tools/task-status.test.ts`]

- [ ] 13. Task-level resume without `/resume` leakage

  What to do: Add an integration-style test using a temporary session directory: start in-process and process tasks, verify in-process uses in-memory/non-session persistence and process uses `--no-session`, resume a new `TaskManager` from `ResultStore`, and verify `task_status` can find task records by id while `SessionManager.list()`/`listAll()` does not list child sessions. For process tasks, assert task-level state is resumable/observable through `pi-task` records where pid/heartbeat supports it.
  Must NOT do: Do not add a `/resume` integration that depends on interactive UI. Use public `SessionManager` APIs or file-system session directory assertions.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [14, 15] | Blocked by: [6, 10, 12]

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `src/runtime/result-store.ts:16-66` — task-level persistence.
  - Pattern:  `src/runtime/in-process-runner.ts:94-109` — child session creation.
  - Pattern:  `src/runtime/process-task-runner.ts:95-100` — process child `--no-session`.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/session-format.md:366-374` — `SessionManager.create/open/inMemory/list/listAll`.
  - External: `/Users/yeongyu/local-workspaces/senpi/packages/coding-agent/docs/sessions.md:25-38` — `/resume` lists previous sessions for current project.
  - External: `https://dev.opencode.ai/docs/agents/` — OpenCode child sessions are first-class; this plan intentionally does not copy that `/resume` discoverability.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm test -- test/runtime/task-resume-isolation.test.ts | tee evidence/task-13-resume-isolation.log` passes.
  - [ ] Tests prove child sessions do not appear in session listings but task ids remain queryable through `ResultStore`/`task_status`.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: in-process child is not resumable as chat
    Tool:     bash
    Steps:    mkdir -p evidence && npm test -- test/runtime/task-resume-isolation.test.ts -t "#given in-process task child #when session list is queried #then child session is absent but task state exists" | tee evidence/task-13-inprocess-resume-hidden.log
    Expected: command exits 0; session list excludes child id; task store contains task id and childSessionId metadata.
    Evidence: evidence/task-13-inprocess-resume-hidden.log

  Scenario: process child is task-resumable only
    Tool:     bash
    Steps:    npm test -- test/runtime/task-resume-isolation.test.ts -t "#given process task child #when manager resumes #then task_status works and session list has no child chat" | tee evidence/task-13-process-task-resume.log
    Expected: command exits 0; task_status returns persisted process task state; session list has no child process chat.
    Evidence: evidence/task-13-process-task-resume.log
  ```

  Commit: YES | Message: `test(runtime): prove task resume without child chat leakage` | Files: [`test/runtime/task-resume-isolation.test.ts`, `src/runtime/in-process-runner.ts`, `src/runtime/process-task-runner.ts`, `src/tools/task-status.ts`]

- [ ] 14. Docs and release-facing acceptance updates

  What to do: Update README, architecture, QA docs, and verifier docs to state the corrected semantics: scoped TUI, explicit all/status commands, isolated child contexts, no `/resume` leakage, tool scope rules, process pid/lost/killed facts, cancellation race fix, and model fallback visibility. Preserve the Korean AS-IS requirements already in `docs/spec.md`; add a short new section for the new acceptance criteria and evidence paths.
  Must NOT do: Do not claim live manual QA passed until Task 15 evidence exists. Do not rewrite old history-heavy docs beyond the changed behavior.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [F1, F4] | Blocked by: [7, 8, 9, 10, 11, 12, 13]

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `README.md:5-18` — feature list to correct.
  - Pattern:  `README.md:48-65` — dev/local install commands.
  - Pattern:  `docs/architecture.md:17-23` — runtime modes.
  - Pattern:  `docs/architecture.md:37-43` — persistence/resume.
  - Gap:      `docs/architecture.md:64-66` — current TUI surface is global/compact.
  - Pattern:  `docs/spec.md:5-52` — Korean AS-IS and product-critical emphasis.
  - Pattern:  `docs/verifier.md:9-37` — existing verifier expectations.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && rg -n "session-scoped|/tasks --all|--tools|--no-tools|/resume|cancelled -> failed|GPT-5.2" README.md docs | tee evidence/task-14-docs-rg.log` finds updated documentation entries.
  - [ ] `npm run check | tee evidence/task-14-check.log` passes after docs updates.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: docs mention corrected session scope
    Tool:     bash
    Steps:    mkdir -p evidence && rg -n "session-scoped|fresh main session|/tasks --all" README.md docs | tee evidence/task-14-session-docs.log
    Expected: command exits 0; docs mention scoped footer/widget and explicit all list.
    Evidence: evidence/task-14-session-docs.log

  Scenario: docs mention child isolation and permission scope
    Tool:     bash
    Steps:    rg -n "in-memory|--no-session|--tools|--no-tools|disallowedTools|allowedSubagents" README.md docs | tee evidence/task-14-permission-docs.log
    Expected: command exits 0; docs mention non-resumable child chats and tool constraints.
    Evidence: evidence/task-14-permission-docs.log
  ```

  Commit: YES | Message: `docs: document scoped task sessions and permissions` | Files: [`README.md`, `docs/architecture.md`, `docs/spec.md`, `docs/qa-plan.md`, `docs/qa-results.md`, `docs/verifier.md`]

- [ ] 15. Manual QA scripts and evidence capture

  What to do: Add or update QA scripts that run without user interaction and capture evidence for session scope, process kill, permission tool scope, task_status details, and local install. Existing scripts can be reused. Add scripts only when a unit test cannot exercise the behavior well enough. Run the scripts and update `docs/qa-results.md` with exact commands and pass/fail evidence paths.
  Must NOT do: Do not use shell `sleep`. Use polling loops, process events, or timeouts. Do not require interactive user input.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [F3] | Blocked by: [7, 8, 9, 10, 12, 13]

  References (executor has NO interview context — be exhaustive):
  - Pattern:  `scripts/qa-process-kill.mjs:1-30` — existing process-kill QA script.
  - Pattern:  `scripts/qa-senpi-install.mjs:1-40` — existing local install/symlink QA script.
  - Pattern:  `scripts/qa-import.mjs` — module import QA pattern.
  - Pattern:  `docs/qa-results.md:1-25` — existing QA results format and prior GPT-5.2 verifier record.
  - Constraint:`AGENTS.md:13-20` — official command list.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && npm run qa:import | tee evidence/task-15-import.log` passes.
  - [ ] `npm run qa:process-kill | tee evidence/task-15-process-kill.log` passes and reports pid -> killed.
  - [ ] `npm run qa:senpi-install | tee evidence/task-15-senpi-install-dry-run.log` passes.
  - [ ] `node scripts/qa-senpi-install.mjs --force | tee evidence/task-15-senpi-install-force.log && test -L ~/.senpi/agent/extensions/pi-task` passes.
  - [ ] Any new QA scripts pass and write evidence under `evidence/`.

  QA scenarios (MANDATORY — task incomplete without these):
  ```text
  Scenario: local senpi install symlink is valid
    Tool:     bash
    Steps:    mkdir -p evidence && npm run qa:senpi-install | tee evidence/task-15-senpi-install-dry-run.log && node scripts/qa-senpi-install.mjs --force | tee evidence/task-15-senpi-install-force.log && test -L ~/.senpi/agent/extensions/pi-task
    Expected: command exits 0; dry-run passes; force install prints installed ok; symlink exists.
    Evidence: evidence/task-15-senpi-install-force.log

  Scenario: process kill QA reports truthful killed state
    Tool:     bash
    Steps:    npm run qa:process-kill | tee evidence/task-15-process-kill.log
    Expected: command exits 0; output matches `process kill ok: pid <number> -> killed`.
    Evidence: evidence/task-15-process-kill.log
  ```

  Commit: YES | Message: `test(qa): capture task scope and process evidence` | Files: [`scripts/qa-process-kill.mjs`, `scripts/qa-senpi-install.mjs`, `scripts/qa-import.mjs`, `scripts/qa-session-scope.mjs`, `scripts/qa-permissions.mjs`, `docs/qa-results.md`, `evidence/*`]

## Final verification wave (MANDATORY — after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit — every task done, every acceptance criterion met
- [ ] F2. Code quality review — diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA — every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity — nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced
- [ ] F5. Independent GPT-5.2 xhigh verifier — read-only diff + plan audit emits APPROVE

F1 exact checks:
- `mkdir -p evidence && rg -n "^- \\[ \\]" plans/pi-task-permissions-ui-session-scope.md README.md docs/qa-results.md | tee evidence/f1-open-checkboxes.log`
- Expected: implementation tracker has no incomplete required acceptance check in the executor's working notes; any remaining plan checkboxes are in this plan file only and are mapped to completed evidence in `docs/qa-results.md`.

F2 exact checks:
- `npm test | tee evidence/f2-npm-test.log`
- `npm run typecheck | tee evidence/f2-typecheck.log`
- `npm run check | tee evidence/f2-check.log`
- LSP tool: diagnostics on `src`, `test`, and `scripts`; expected zero errors.
- `rg -n "as any|@ts-ignore|@ts-expect-error|TODO|sleep " src test scripts README.md docs | tee evidence/f2-no-slop-rg.log`
- Expected: no typecheck/check failures; no forbidden suppressions or shell sleep commands; any TODO hit must be pre-existing or documented as non-shipping.

F3 exact checks:
- `npm run qa:import | tee evidence/f3-qa-import.log`
- `npm run qa:process-kill | tee evidence/f3-qa-process-kill.log`
- `npm run qa:senpi-install | tee evidence/f3-qa-senpi-install-dry-run.log`
- `node scripts/qa-senpi-install.mjs --force | tee evidence/f3-qa-senpi-install-force.log && test -L ~/.senpi/agent/extensions/pi-task`
- Any new QA script from Task 15 must also be run and documented in `docs/qa-results.md`.

F4 exact checks:
- `git diff --stat | tee evidence/f4-diff-stat.log`
- `git diff -- src test scripts README.md docs package.json | tee evidence/f4-diff.patch`
- Expected: diff touches only files named by task commits; no unrelated refactors, no generated credential/home config, no private `senpi` core edits.

F5 exact checks:
- Use a separate read-only GPT-5.2 xhigh verifier over the final diff and this plan. If using local `senpi`, run:
  `senpi --no-session --model openai/gpt-5.2 --thinking xhigh -p "Read plans/pi-task-permissions-ui-session-scope.md and the current git diff. Verify every acceptance criterion is implemented and tested. Output APPROVE or BLOCK with file:line findings only." | tee evidence/f5-gpt-5.2-verifier.md`
- Expected: evidence contains `APPROVE` and no blocking findings. If GPT-5.2 is unavailable, F5 fails; do not declare complete.

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch — clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: plans/pi-task-permissions-ui-session-scope.md`.
- Suggested commit order:
  1. `feat(runtime): scope task lists by root session`
  2. `feat(ui): render rich task status facts`
  3. `feat(runtime): resolve child tool scope from agent permissions`
  4. `fix(runtime): preserve cancelled tasks on late runner failure`
  5. `feat(runtime): persist process exit facts`
  6. `fix(runtime): keep in-process child sessions ephemeral`
  7. `feat(ui): scope task status to current session`
  8. `feat(tools): expand task_status metadata`
  9. `feat(runtime): constrain in-process child tools`
  10. `feat(runtime): constrain process child tools`
  11. `feat(runtime): sync scoped task UI on lifecycle events`
  12. `fix(runtime): expose truthful process resume state`
  13. `test(runtime): prove task resume without child chat leakage`
  14. `docs: document scoped task sessions and permissions`
  15. `test(qa): capture task scope and process evidence`

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1–F5 approved; commit history clean.
