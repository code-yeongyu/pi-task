import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { clearInProcessAncestry, registerInProcessAncestry } from "../../src/runtime/ancestry.js";
import { TaskManager } from "../../src/runtime/task-manager.js";
import { createTaskTool } from "../../src/tools/task.js";
import { createTaskStatusTool } from "../../src/tools/task-status.js";

function createExtensionContext(): ExtensionContext {
	return {
		cwd: process.cwd(),
		sessionManager: { getSessionId: () => "parent" },
		model: undefined,
	} as ExtensionContext;
}

afterEach(() => {
	clearInProcessAncestry("parent");
});

describe("task tool", () => {
	it("#given foreground task #when executed #then returns final response and persists status", async () => {
		const manager = new TaskManager({
			runner: {
				async run() {
					return { status: "completed", finalResponse: "Final answer", progress: ["working"] };
				},
			},
		});
		const task = createTaskTool(manager);

		const result = await task.execute(
			"call_1",
			{ prompt: "Do work", subagent_type: "finder", background: false },
			undefined,
			undefined,
			createExtensionContext(),
		);

		expect(result.content[0]?.type).toBe("text");
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("Final answer");
		expect(manager.get(result.details.task_id)?.status).toBe("completed");
	});

	it("#given background task #when executed #then returns task id immediately and status can be polled", async () => {
		const manager = new TaskManager({
			runner: {
				async run() {
					await new Promise((resolve) => setTimeout(resolve, 20));
					return { status: "completed", finalResponse: "Background final", progress: ["done"] };
				},
			},
		});
		const task = createTaskTool(manager);
		const status = createTaskStatusTool(manager);

		const result = await task.execute(
			"call_2",
			{ prompt: "Do work", subagent_type: "finder", background: true },
			undefined,
			undefined,
			createExtensionContext(),
		);

		expect(result.details.task_id).toMatch(/^task_/);
		const statusResult = await status.execute("call_3", {
			task_id: result.details.task_id,
			wait: true,
			timeout_ms: 200,
		});

		expect(statusResult.content[0]?.type === "text" ? statusResult.content[0].text : "").toContain(
			"Background final",
		);
	});

	it("#given default agent config #when fields are omitted #then applies frontmatter defaults", async () => {
		const manager = new TaskManager({
			runner: {
				async run() {
					await new Promise((resolve) => setTimeout(resolve, 20));
					return { status: "completed", finalResponse: "done" };
				},
			},
		});
		const task = createTaskTool(manager, {
			loadAgents: async () => ({
				default: {
					name: "default",
					mode: "all",
					models: ["provider/a", "provider/b"],
					permission: [],
					background: true,
					executionMode: "process",
					allowedSubagents: [],
					disallowedTools: [],
					disable: false,
					prompt: "Default task agent",
					native: false,
				},
			}),
		});

		const result = await task.execute(
			"call_4",
			{ prompt: "Do work" },
			undefined,
			undefined,
			createExtensionContext(),
		);
		const stored = manager.get(result.details.task_id);

		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("Started background task");
		expect(stored?.executionMode).toBe("process");
		expect(stored?.model).toBe("provider/a");
		expect(stored?.modelAttempts.map((attempt) => attempt.model)).toEqual(["provider/a", "provider/b"]);
	});

	it("#given nested task beyond default depth #when parent does not allow target #then denies delegation", async () => {
		const manager = new TaskManager({
			runner: {
				async run() {
					return { status: "completed", finalResponse: "should not run" };
				},
			},
		});
		registerInProcessAncestry("parent", {
			taskId: "task_parent",
			agentType: "finder",
			parentSessionId: "root",
			rootSessionId: "root",
			depth: 1,
		});
		const task = createTaskTool(manager, {
			loadAgents: async () => ({
				finder: {
					name: "finder",
					mode: "all",
					permission: [],
					allowedSubagents: [],
					disallowedTools: [],
					disable: false,
					prompt: "Find",
					native: false,
				},
			}),
		});

		const result = await task.execute(
			"call_5",
			{ prompt: "Do nested", subagent_type: "writer" },
			undefined,
			undefined,
			createExtensionContext(),
		);

		expect(result.details.status).toBe("denied");
		expect(manager.list()).toEqual([]);
	});

	it("#given nested task beyond default depth #when parent allowlists target #then starts task", async () => {
		const manager = new TaskManager({
			runner: {
				async run() {
					return { status: "completed", finalResponse: "allowed" };
				},
			},
		});
		registerInProcessAncestry("parent", {
			taskId: "task_parent",
			agentType: "finder",
			parentSessionId: "root",
			rootSessionId: "root",
			depth: 1,
		});
		const task = createTaskTool(manager, {
			loadAgents: async () => ({
				finder: {
					name: "finder",
					mode: "all",
					permission: [],
					allowedSubagents: ["writer"],
					disallowedTools: [],
					disable: false,
					prompt: "Find",
					native: false,
				},
			}),
		});

		const result = await task.execute(
			"call_6",
			{ prompt: "Do nested", subagent_type: "writer" },
			undefined,
			undefined,
			createExtensionContext(),
		);

		expect(result.details.status).toBe("completed");
		expect(manager.get(result.details.task_id)?.depth).toBe(2);
		expect(manager.get(result.details.task_id)?.rootSessionId).toBe("root");
	});
});
