import { describe, expect, it } from "vitest";

import { TaskManager } from "../../src/runtime/task-manager.js";

describe("task manager model fallback", () => {
	it("#given fallback models #when first model fails retryably #then retries with next model in same task", async () => {
		const seenModels: Array<string | undefined> = [];
		const manager = new TaskManager({
			runner: {
				async run({ task }) {
					seenModels.push(task.model);
					if (task.model === "provider/a") {
						return { status: "failed", errorMessage: "provider overloaded" };
					}
					return { status: "completed", finalResponse: `ok:${task.model}` };
				},
			},
		});

		const started = manager.start({
			prompt: "do work",
			agentType: "finder",
			parentSessionId: "parent",
			models: ["provider/a", "provider/b"],
		});

		const task = await started.promise;

		expect(seenModels).toEqual(["provider/a", "provider/b"]);
		expect(task?.status).toBe("completed");
		expect(task?.finalResponse).toBe("ok:provider/b");
		expect(task?.modelAttempts.map((attempt) => attempt.status)).toEqual(["failed", "completed"]);
	});

	it("#given nonretryable failure #when first model fails #then does not try fallback", async () => {
		const seenModels: Array<string | undefined> = [];
		const manager = new TaskManager({
			runner: {
				async run({ task }) {
					seenModels.push(task.model);
					return { status: "failed", errorMessage: "permission denied" };
				},
			},
		});

		const started = manager.start({
			prompt: "do work",
			agentType: "finder",
			parentSessionId: "parent",
			models: ["provider/a", "provider/b"],
		});

		const task = await started.promise;

		expect(seenModels).toEqual(["provider/a"]);
		expect(task?.status).toBe("failed");
		expect(task?.modelAttempts.map((attempt) => attempt.status)).toEqual(["failed", "pending"]);
	});
});
