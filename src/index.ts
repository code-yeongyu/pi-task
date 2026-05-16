import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { getSenpiAgentDir, getTaskStateDir } from "./config/paths.js";
import { CompositeTaskRunner } from "./runtime/composite-runner.js";
import { installTaskEventBridge } from "./runtime/event-bridge.js";
import { InProcessRunner } from "./runtime/in-process-runner.js";
import { ProcessTaskRunner } from "./runtime/process-task-runner.js";
import { ResultStore } from "./runtime/result-store.js";
import { TaskEventLogger } from "./runtime/task-logger.js";
import { TaskManager } from "./runtime/task-manager.js";
import { createTaskTool } from "./tools/task.js";
import { createTaskCancelTool } from "./tools/task-cancel.js";
import { createTaskStatusTool } from "./tools/task-status.js";
import { formatTaskList, syncTaskStatusToUi } from "./ui/status.js";

function isCancellableStatus(status: string): boolean {
	return status === "queued" || status === "running" || status === "retrying";
}

function notifyTasks(manager: TaskManager, ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	syncTaskStatusToUi(manager, ctx);
	ctx.ui.notify(formatTaskList(manager.list()));
}

async function cancelTaskFromUi(manager: TaskManager, ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;
	const tasks = manager.list().filter((task) => isCancellableStatus(task.status));
	if (tasks.length === 0) {
		ctx.ui.notify("No running pi-task task can be cancelled.", "info");
		return;
	}
	const options = tasks.map((task) => `${task.taskId} ${task.agentType} ${task.status}`);
	const selected = await ctx.ui.select("Cancel pi-task task", options);
	if (selected === undefined) return;
	const taskId = selected.split(" ")[0];
	if (taskId === undefined) return;
	const ok = await ctx.ui.confirm("Cancel pi-task task", taskId);
	if (!ok) return;
	const cancelled = manager.cancel(taskId, "Cancelled from pi-task TUI.");
	ctx.ui.notify(cancelled === undefined ? `Task ${taskId} was not found.` : `Cancelled ${taskId}.`);
	syncTaskStatusToUi(manager, ctx);
}

export default function piTaskExtension(pi: ExtensionAPI): void {
	const stateDir = getTaskStateDir();
	const agentDir = getSenpiAgentDir();
	const manager = new TaskManager({
		runner: new CompositeTaskRunner({
			inProcess: new InProcessRunner({ agentDir }),
			process: new ProcessTaskRunner(),
		}),
		resultStore: new ResultStore(stateDir),
		logger: new TaskEventLogger(stateDir),
	});

	pi.registerTool(createTaskTool(manager));
	pi.registerTool(createTaskStatusTool(manager));
	pi.registerTool(createTaskCancelTool(manager));

	installTaskEventBridge(pi as unknown as Parameters<typeof installTaskEventBridge>[0], {
		manager,
		syncStatus: (ctx) => syncTaskStatusToUi(manager, ctx as unknown as ExtensionContext),
		getParentModel: () => manager.getParentModel(),
	});

	pi.registerCommand("tasks", {
		description: "Show pi-task subagent task status",
		handler: async (_args, ctx) => {
			notifyTasks(manager, ctx);
		},
	});

	pi.registerCommand("task-kill", {
		description: "Cancel a running pi-task subagent task",
		handler: async (_args, ctx) => {
			await cancelTaskFromUi(manager, ctx);
		},
	});

	pi.registerShortcut(Key.ctrlAlt("t"), {
		description: "Show pi-task status",
		handler: async (ctx) => {
			notifyTasks(manager, ctx);
		},
	});
}
