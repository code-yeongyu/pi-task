import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { TaskManager } from "../runtime/task-manager.js";

export type TaskStatusDetails = {
	task_id: string;
	status: string;
	pid?: number;
};

export const TaskStatusParams = Type.Object({
	task_id: Type.String(),
	wait: Type.Optional(Type.Boolean()),
	timeout_ms: Type.Optional(Type.Integer({ minimum: 0 })),
});

export function createTaskStatusTool(manager: TaskManager) {
	return {
		name: "task_status",
		label: "Task Status",
		description:
			"Inspect a task by id, including background final response, errors, pids, resume state, and killed/lost states.",
		parameters: TaskStatusParams,
		async execute(
			_toolCallId: string,
			params: { task_id: string; wait?: boolean; timeout_ms?: number },
		): Promise<AgentToolResult<TaskStatusDetails>> {
			const task = params.wait
				? await manager.wait(params.task_id, params.timeout_ms ?? 30_000)
				: manager.get(params.task_id);
			if (task === undefined) {
				return {
					content: [{ type: "text", text: `Task ${params.task_id} was not found.` }],
					details: { task_id: params.task_id, status: "missing" },
				};
			}
			const parts = [`${task.taskId}: ${task.status}`];
			if (task.pid !== undefined) parts.push(`pid ${task.pid}`);
			if (task.resumeState !== undefined) parts.push(`resume ${task.resumeState}`);
			if (task.finalResponse !== undefined) parts.push(task.finalResponse);
			if (task.lastError !== undefined) parts.push(task.lastError.message);
			return {
				content: [{ type: "text", text: parts.join("\n") }],
				details: {
					task_id: task.taskId,
					status: task.status,
					...(task.pid !== undefined && { pid: task.pid }),
				},
			};
		},
	};
}
