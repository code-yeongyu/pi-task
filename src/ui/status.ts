import type { TaskManager } from "../runtime/task-manager.js";
import { isTerminalTaskStatus } from "../runtime/task-state.js";
import type { TaskRecord } from "../runtime/types.js";

export type StatusUiContext = {
	hasUI: boolean;
	ui: {
		setStatus: (key: string, value: string | undefined) => void;
		setWidget: (key: string, value: string[] | undefined, options?: { placement: "belowEditor" }) => void;
		theme: {
			fg: (color: "accent", value: string) => string;
		};
	};
};

function shortTask(task: TaskRecord): string {
	const parts = [task.taskId, task.agentType, task.status, task.executionMode];
	if (task.pid !== undefined) parts.push(`pid:${task.pid}`);
	if (task.childSessionId !== undefined) parts.push(`child:${task.childSessionId}`);
	return parts.join(" ");
}

export function formatTaskList(tasks: readonly TaskRecord[]): string {
	if (tasks.length === 0) return "No pi-task tasks are known in this session.";
	return tasks.map(shortTask).join("\n");
}

export function formatFooterStatus(manager: TaskManager): string | undefined {
	const tasks = manager.list();
	if (tasks.length === 0) return undefined;
	const running = tasks.filter((task) => task.status === "running" || task.status === "retrying").length;
	const terminal = tasks.filter((task) => isTerminalTaskStatus(task.status)).length;
	const errored = tasks.filter(
		(task) => task.status === "failed" || task.status === "killed" || task.status === "lost",
	).length;
	const pieces = [`tasks:${tasks.length}`];
	if (running > 0) pieces.push(`run:${running}`);
	if (terminal > 0) pieces.push(`done:${terminal}`);
	if (errored > 0) pieces.push(`err:${errored}`);
	return pieces.join(" ");
}

export function syncTaskStatusToUi(manager: TaskManager, ctx: StatusUiContext): void {
	if (!ctx.hasUI) return;
	const status = formatFooterStatus(manager);
	ctx.ui.setStatus("pi-task", status === undefined ? undefined : ctx.ui.theme.fg("accent", status));
	const active = manager.list().filter((task) => !isTerminalTaskStatus(task.status));
	if (active.length === 0) {
		ctx.ui.setWidget("pi-task", undefined);
		return;
	}
	ctx.ui.setWidget("pi-task", active.map(shortTask), { placement: "belowEditor" });
}
