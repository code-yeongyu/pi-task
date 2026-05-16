import { createModelAttempts, shouldRetryWithFallback } from "./model-fallback.js";
import { reconcileProcessTask } from "./process-reconcile.js";
import type { ResultStore } from "./result-store.js";
import type { TaskEventLogger } from "./task-logger.js";
import { createTaskRecord, isTerminalTaskStatus, transitionTask } from "./task-state.js";
import type { ExecutionMode, TaskRecord, TaskStatus } from "./types.js";

export type RunnerInput = {
	task: TaskRecord;
	signal?: AbortSignal;
	onUpdate?: (update: RunnerUpdate) => void;
};

export type RunnerUpdate =
	| { type: "pid"; pid: number }
	| { type: "heartbeat"; pid?: number }
	| { type: "progress"; message: string };

export type RunnerResult = {
	status: Extract<TaskStatus, "completed" | "failed" | "cancelled" | "killed" | "lost">;
	finalResponse?: string;
	errorMessage?: string;
	progress?: string[];
	pid?: number;
	childSessionId?: string;
};

export type TaskRunner = {
	run(input: RunnerInput): Promise<RunnerResult>;
};

export type StartTaskInput = {
	prompt: string;
	agentType: string;
	description?: string;
	parentSessionId: string;
	rootSessionId?: string;
	parentAgentType?: string;
	cwd?: string;
	depth?: number;
	model?: string;
	models?: string[];
	executionMode?: ExecutionMode;
	background?: boolean;
	signal?: AbortSignal;
};

export type StartTaskResult = {
	task: TaskRecord;
	promise?: Promise<TaskRecord>;
};

let taskCounter = 0;

function nextTaskId(): string {
	taskCounter += 1;
	return `task_${Date.now().toString(36)}_${taskCounter}`;
}

export class TaskManager {
	readonly #runner: TaskRunner;
	readonly #resultStore: ResultStore | undefined;
	readonly #logger: TaskEventLogger | undefined;
	readonly #isPidAlive: (pid: number) => boolean;
	readonly #tasks = new Map<string, TaskRecord>();
	readonly #controllers = new Map<string, AbortController>();
	#parentModel: string | undefined;

	constructor(options: {
		runner: TaskRunner;
		resultStore?: ResultStore;
		logger?: TaskEventLogger;
		isPidAlive?: (pid: number) => boolean;
	}) {
		this.#runner = options.runner;
		this.#resultStore = options.resultStore;
		this.#logger = options.logger;
		this.#isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
	}

	get(taskId: string): TaskRecord | undefined {
		return this.#tasks.get(taskId);
	}

	list(): TaskRecord[] {
		return [...this.#tasks.values()];
	}

	setParentModel(model: string | undefined): void {
		this.#parentModel = model;
	}

	getParentModel(): string | undefined {
		return this.#parentModel;
	}

	async resume(_options: { cwd: string; reason: string }): Promise<void> {
		const persisted = (await this.#resultStore?.list()) ?? [...this.#tasks.values()];
		for (const task of persisted) {
			const resumed = this.#reconcileResumedTask(task);
			this.#tasks.set(task.taskId, resumed);
			await this.#persist(resumed);
			await this.#log(resumed.taskId, "task_resume", { status: resumed.status, reason: _options.reason });
		}
	}

	start(input: StartTaskInput): StartTaskResult {
		const modelAttempts = createModelAttempts({
			parentModel: this.#parentModel,
			...(input.model !== undefined && { model: input.model }),
			...(input.models !== undefined && { models: input.models }),
		});
		const initialModel = modelAttempts[0]?.model === "inherit" ? undefined : modelAttempts[0]?.model;
		const task = createTaskRecord({
			taskId: nextTaskId(),
			agentType: input.agentType,
			prompt: input.prompt,
			...(input.description !== undefined && { description: input.description }),
			parentSessionId: input.parentSessionId,
			rootSessionId: input.rootSessionId ?? input.parentSessionId,
			...(input.parentAgentType !== undefined && { parentAgentType: input.parentAgentType }),
			...(input.cwd !== undefined && { cwd: input.cwd }),
			depth: input.depth ?? 0,
			executionMode: input.executionMode ?? "in-process",
			...(initialModel !== undefined && { model: initialModel }),
			modelAttempts,
		});
		const taskWithLogPath =
			this.#logger === undefined ? task : { ...task, logPath: this.#logger.getLogPath(task.taskId) };
		const controller = new AbortController();
		this.#controllers.set(taskWithLogPath.taskId, controller);
		const running = transitionTask(taskWithLogPath, { status: "running", now: Date.now() });
		this.#tasks.set(taskWithLogPath.taskId, running);
		void this.#persist(running).catch(() => {});
		void this.#log(running.taskId, "task_start", {
			agentType: running.agentType,
			executionMode: running.executionMode,
			parentSessionId: running.parentSessionId,
			model: running.model,
		}).catch(() => {});

		const runPromise = this.#runWithFallback(running, input.signal ?? controller.signal)
			.then((result) => {
				this.#controllers.delete(taskWithLogPath.taskId);
				return result;
			})
			.catch((error: Error) => {
				const current = this.#tasks.get(taskWithLogPath.taskId) ?? running;
				const failed = transitionTask(current, { status: "failed", now: Date.now(), errorMessage: error.message });
				this.#tasks.set(taskWithLogPath.taskId, failed);
				this.#controllers.delete(taskWithLogPath.taskId);
				void this.#persist(failed).catch(() => {});
				void this.#log(failed.taskId, "task_error", { message: error.message }).catch(() => {});
				return failed;
			});

		if (input.background) {
			void runPromise;
			return { task: running, promise: runPromise };
		}

		return { task: running, promise: runPromise };
	}

	async #runWithFallback(initialTask: TaskRecord, signal?: AbortSignal): Promise<TaskRecord> {
		let current = initialTask;
		const attempts =
			current.modelAttempts.length > 0
				? current.modelAttempts
				: [{ model: "inherit" as const, status: "pending" as const }];

		for (let index = 0; index < attempts.length; index++) {
			const attempt = attempts[index];
			if (attempt === undefined) break;
			const model = attempt.model === "inherit" ? undefined : attempt.model;
			const startedAt = Date.now();
			await this.#log(current.taskId, "model_attempt_start", { model: attempt.model, index });
			current = {
				...current,
				...(model !== undefined ? { model } : {}),
				modelAttempts: current.modelAttempts.map((entry, entryIndex) =>
					entryIndex === index ? { ...entry, status: "running", startedAt } : entry,
				),
			};
			if (current.status === "retrying") {
				current = transitionTask(current, {
					status: "running",
					now: startedAt,
					...(model !== undefined && { model }),
				});
			}
			this.#tasks.set(current.taskId, current);
			await this.#persist(current);

			const result = await this.#runner.run({
				task: current,
				signal,
				onUpdate: (update) => {
					this.#applyRunnerUpdate(current.taskId, update);
				},
			});
			let next = this.#tasks.get(current.taskId) ?? current;
			for (const progress of result.progress ?? []) {
				next = transitionTask(next, { status: next.status, now: Date.now(), progress });
			}

			const endedAt = Date.now();
			await this.#log(current.taskId, "model_attempt_end", {
				model: attempt.model,
				index,
				status: result.status,
				errorMessage: result.errorMessage,
			});
			const attemptStatus: "completed" | "failed" = result.status === "completed" ? "completed" : "failed";
			const nextAttempts = next.modelAttempts.map((entry, entryIndex) => {
				if (entryIndex !== index) return entry;
				return {
					...entry,
					status: attemptStatus,
					endedAt,
					...(result.errorMessage !== undefined && { errorMessage: result.errorMessage }),
				};
			});

			const error = result.errorMessage === undefined ? undefined : new Error(result.errorMessage);
			if (
				result.status === "failed" &&
				error !== undefined &&
				shouldRetryWithFallback(
					error,
					index,
					attempts.map((entry) => entry.model),
				)
			) {
				next = transitionTask(
					{ ...next, modelAttempts: nextAttempts },
					{ status: "retrying", now: endedAt, errorMessage: result.errorMessage },
				);
				this.#tasks.set(next.taskId, next);
				await this.#persist(next);
				await this.#log(next.taskId, "model_fallback", { from: attempt.model, next: attempts[index + 1]?.model });
				current = next;
				continue;
			}

			next = transitionTask(
				{ ...next, modelAttempts: nextAttempts },
				{
					status: result.status,
					now: endedAt,
					...(result.pid !== undefined && { pid: result.pid }),
					...(result.childSessionId !== undefined && { childSessionId: result.childSessionId }),
					...(result.finalResponse !== undefined && { finalResponse: result.finalResponse }),
					...(result.errorMessage !== undefined && { errorMessage: result.errorMessage }),
				},
			);
			this.#tasks.set(next.taskId, next);
			await this.#persist(next);
			await this.#log(next.taskId, "task_end", {
				status: next.status,
				pid: next.pid,
				childSessionId: next.childSessionId,
				hasFinalResponse: next.finalResponse !== undefined,
				errorMessage: next.lastError?.message,
			});
			return next;
		}

		const failed = transitionTask(current, {
			status: "failed",
			now: Date.now(),
			errorMessage: "No model attempts were available.",
		});
		this.#tasks.set(failed.taskId, failed);
		await this.#persist(failed);
		await this.#log(failed.taskId, "task_end", { status: failed.status, errorMessage: failed.lastError?.message });
		return failed;
	}

	async wait(taskId: string, timeoutMs: number): Promise<TaskRecord | undefined> {
		const startedAt = Date.now();
		while (Date.now() - startedAt <= timeoutMs) {
			const task = this.#tasks.get(taskId);
			if (task === undefined || ["completed", "failed", "cancelled", "killed", "lost"].includes(task.status)) {
				return task;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		return this.#tasks.get(taskId);
	}

	cancel(taskId: string, reason = "Cancelled by parent."): TaskRecord | undefined {
		const task = this.#tasks.get(taskId);
		if (task === undefined) return undefined;
		this.#controllers.get(taskId)?.abort();
		const cancelled = transitionTask(task, { status: "cancelled", now: Date.now(), errorMessage: reason });
		this.#tasks.set(taskId, cancelled);
		void this.#persist(cancelled).catch(() => {});
		void this.#log(taskId, "task_cancel", { reason }).catch(() => {});
		return cancelled;
	}

	async #persist(task: TaskRecord): Promise<void> {
		await this.#resultStore?.save(task);
	}

	#applyRunnerUpdate(taskId: string, update: RunnerUpdate): void {
		const task = this.#tasks.get(taskId);
		if (task === undefined || isTerminalTaskStatus(task.status)) return;
		const now = Date.now();
		let next = task;
		if (update.type === "pid") {
			next = transitionTask(task, { status: task.status, now, pid: update.pid, heartbeatAt: now });
		} else if (update.type === "heartbeat") {
			next = transitionTask(task, {
				status: task.status,
				now,
				heartbeatAt: now,
				...(update.pid !== undefined && { pid: update.pid }),
			});
		} else {
			next = transitionTask(task, { status: task.status, now, progress: update.message });
		}
		this.#tasks.set(taskId, next);
		void this.#persist(next).catch(() => {});
		void this.#log(taskId, "task_update", {
			type: update.type,
			...(next.pid !== undefined && { pid: next.pid }),
			...(next.heartbeatAt !== undefined && { heartbeatAt: next.heartbeatAt }),
		}).catch(() => {});
	}

	async #log(taskId: string, type: string, data?: Record<string, unknown>): Promise<void> {
		await this.#logger?.write(taskId, {
			type,
			taskId,
			timestamp: Date.now(),
			...(data !== undefined && { data }),
		});
	}

	#reconcileResumedTask(task: TaskRecord): TaskRecord {
		if (task.status === "running" || task.status === "retrying") {
			if (task.executionMode === "process") {
				return reconcileProcessTask(
					{ ...task, status: "running" },
					{
						now: Date.now(),
						heartbeatTimeoutMs: 5_000,
						isPidAlive: this.#isPidAlive,
					},
				);
			}
			return transitionTask(
				{ ...task, status: "running" },
				{
					status: "lost",
					now: Date.now(),
					errorCode: "in_process_resume_lost",
					errorMessage: "In-process task was interrupted before pi-task could collect a final response.",
				},
			);
		}
		return { ...task, resumeState: "resumed", updatedAt: Date.now() };
	}
}

function defaultIsPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
