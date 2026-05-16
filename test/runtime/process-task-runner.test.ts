import { describe, expect, it } from "vitest";

import { ProcessTaskRunner } from "../../src/runtime/process-task-runner.js";
import { createTaskRecord } from "../../src/runtime/task-state.js";

describe("process task runner", () => {
	it("#given pi json output #when process completes #then extracts final assistant response and pid", async () => {
		let argsSeen: string[] = [];
		const updates: Array<{ type: string; pid?: number }> = [];
		const runner = new ProcessTaskRunner({
			loadAgents: async () => ({}),
			processRunner: {
				async run(input) {
					argsSeen = input.args;
					input.onEvent?.({ type: "started", pid: 1234 });
					input.onEvent?.({ type: "heartbeat", pid: 1234 });
					return {
						status: "completed",
						pid: 1234,
						finalResponse: JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: "Process final" }],
							},
						}),
					};
				},
			},
		});
		const task = createTaskRecord({
			taskId: "task_process",
			agentType: "default",
			prompt: "Do it",
			parentSessionId: "parent",
			rootSessionId: "parent",
			depth: 0,
			executionMode: "process",
			model: "provider/model-a",
		});

		const result = await runner.run({ task, onUpdate: (update) => updates.push(update) });

		expect(argsSeen).toContain("--model");
		expect(argsSeen).toContain("provider/model-a");
		expect(updates).toEqual([
			{ type: "pid", pid: 1234 },
			{ type: "heartbeat", pid: 1234 },
		]);
		expect(result.pid).toBe(1234);
		expect(result.status).toBe("completed");
		expect(result.finalResponse).toBe("Process final");
	});
});
