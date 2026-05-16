import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ResultStore } from "../../src/runtime/result-store.js";
import { TaskManager } from "../../src/runtime/task-manager.js";

const tempDirs: string[] = [];

async function makeStore(): Promise<ResultStore> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "pi-task-manager-store-"));
	tempDirs.push(dir);
	return new ResultStore(dir);
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("task manager persistence", () => {
	it("#given completed task #when task finishes #then final response is persisted for later status reads", async () => {
		const store = await makeStore();
		const manager = new TaskManager({
			resultStore: store,
			runner: {
				async run() {
					return { status: "completed", finalResponse: "persisted final" };
				},
			},
		});

		const started = manager.start({ prompt: "work", agentType: "finder", parentSessionId: "parent" });
		const task = await started.promise;

		expect((await store.load(task?.taskId ?? ""))?.finalResponse).toBe("persisted final");
	});

	it("#given persisted running process task #when manager resumes #then task is restored as lost if process cannot be observed", async () => {
		const store = await makeStore();
		const first = new TaskManager({
			resultStore: store,
			runner: {
				async run() {
					await new Promise(() => {});
					return { status: "completed" };
				},
			},
		});
		const started = first.start({
			prompt: "work",
			agentType: "finder",
			parentSessionId: "parent",
			executionMode: "process",
			background: true,
		});

		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = new TaskManager({
			resultStore: store,
			isPidAlive: () => false,
			runner: {
				async run() {
					return { status: "completed" };
				},
			},
		});
		await second.resume({ cwd: process.cwd(), reason: "resume" });

		const restored = second.get(started.task.taskId);
		expect(restored?.status).toBe("lost");
		expect(restored?.lastError?.message).toContain("cannot be observed");
	});

	it("#given running process task #when runner reports pid and heartbeat #then status and store are updated before completion", async () => {
		const store = await makeStore();
		let finish: ((value: { status: "completed"; finalResponse: string }) => void) | undefined;
		const manager = new TaskManager({
			resultStore: store,
			runner: {
				async run({ onUpdate }) {
					onUpdate?.({ type: "pid", pid: 4321 });
					onUpdate?.({ type: "heartbeat", pid: 4321 });
					return await new Promise((resolve) => {
						finish = resolve;
					});
				},
			},
		});
		const started = manager.start({
			prompt: "work",
			agentType: "finder",
			parentSessionId: "parent",
			executionMode: "process",
			background: true,
		});

		await new Promise((resolve) => setTimeout(resolve, 10));

		const running = manager.get(started.task.taskId);
		const persisted = await store.load(started.task.taskId);
		expect(running?.pid).toBe(4321);
		expect(running?.heartbeatAt).toBeTypeOf("number");
		expect(persisted?.pid).toBe(4321);
		expect(persisted?.heartbeatAt).toBeTypeOf("number");

		finish?.({ status: "completed", finalResponse: "done" });
		await started.promise;
	});
});
