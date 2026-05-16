import { describe, expect, it } from "vitest";

import { InProcessRunner } from "../../src/runtime/in-process-runner.js";
import { createTaskRecord } from "../../src/runtime/task-state.js";

describe("in-process runner", () => {
	it("#given agent prompt #when task runs #then starts child session and returns final assistant text", async () => {
		let promptSeen = "";
		const runner = new InProcessRunner({
			loadAgents: async () => ({
				finder: {
					name: "finder",
					mode: "all",
					permission: [],
					allowedSubagents: [],
					disallowedTools: [],
					disable: false,
					prompt: "Find facts carefully.",
					native: false,
				},
			}),
			createSession: async () => ({
				sessionId: "child-session",
				state: {
					messages: [
						{
							role: "assistant",
							content: [{ type: "text", text: "Child final" }],
						},
					],
				},
				subscribe: () => () => {},
				prompt: async (prompt) => {
					promptSeen = prompt;
				},
				dispose: () => {},
			}),
		});
		const task = createTaskRecord({
			taskId: "task_1",
			agentType: "finder",
			prompt: "Inspect api",
			parentSessionId: "parent",
			rootSessionId: "parent",
			depth: 0,
			executionMode: "in-process",
		});

		const result = await runner.run({ task });

		expect(promptSeen).toContain("Find facts carefully.");
		expect(promptSeen).toContain("Inspect api");
		expect(result.childSessionId).toBe("child-session");
		expect(result.status).toBe("completed");
		expect(result.finalResponse).toBe("Child final");
	});
});
