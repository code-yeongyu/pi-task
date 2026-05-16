import { describe, expect, it, vi } from "vitest";

import { installTaskEventBridge } from "../../src/runtime/event-bridge.js";

type Handler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown> | unknown;

describe("pi event bridge", () => {
	it("#given session_start event #when bridge handles it #then resumes manager and appends compact log entry", async () => {
		const handlers = new Map<string, Handler>();
		const resume = vi.fn();
		const appendEntry = vi.fn();
		const pi = {
			on(eventName: string, handler: Handler) {
				handlers.set(eventName, handler);
			},
			appendEntry,
		};

		installTaskEventBridge(pi, {
			manager: { resume, setParentModel: vi.fn() },
			syncStatus: vi.fn(),
			getParentModel: () => "parent/model",
		});

		await handlers.get("session_start")?.({ type: "session_start", reason: "resume" }, { cwd: "/tmp/project" });

		expect(resume).toHaveBeenCalledWith({ cwd: "/tmp/project", reason: "resume" });
		expect(appendEntry).toHaveBeenCalledWith("pi-task.event", expect.objectContaining({ type: "session_start" }));
	});

	it("#given before_agent_start #when bridge handles it twice #then injects task guidance once", async () => {
		const handlers = new Map<string, Handler>();
		const pi = {
			on(eventName: string, handler: Handler) {
				handlers.set(eventName, handler);
			},
			appendEntry: vi.fn(),
		};

		installTaskEventBridge(pi, {
			manager: { resume: vi.fn(), setParentModel: vi.fn() },
			syncStatus: vi.fn(),
			getParentModel: () => undefined,
		});

		const first = await handlers.get("before_agent_start")?.({ systemPrompt: "Base" }, {});
		const firstSystemPrompt =
			typeof first === "object" && first !== null && "systemPrompt" in first ? String(first.systemPrompt) : "";
		const second = await handlers.get("before_agent_start")?.({ systemPrompt: firstSystemPrompt }, {});

		expect(JSON.stringify(first)).toContain("task_status");
		expect(JSON.stringify(second).match(/task_status/g)?.length).toBe(1);
	});
});
