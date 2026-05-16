import type { AgentToolResult, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { loadAllAgents } from "../agents/loader.js";
import type { AgentInfo } from "../agents/schema.js";
import type { TaskManager } from "../runtime/task-manager.js";
import type { ExecutionMode } from "../runtime/types.js";

export type TaskToolDetails = {
	task_id: string;
	status: string;
};

export const TaskToolParams = Type.Object({
	prompt: Type.String(),
	description: Type.Optional(Type.String()),
	subagent_type: Type.Optional(Type.String()),
	background: Type.Optional(Type.Boolean()),
	execution_mode: Type.Optional(Type.Union([Type.Literal("in-process"), Type.Literal("process")])),
});

type CreateTaskToolOptions = {
	loadAgents?: (cwd: string) => Promise<Record<string, AgentInfo>>;
};

function getParentSessionId(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionId();
}

export function createTaskTool(manager: TaskManager, options: CreateTaskToolOptions = {}) {
	const loadAgents = options.loadAgents ?? loadAllAgents;
	return {
		name: "task",
		label: "Task",
		description:
			"Delegate work to a subagent. Background tasks return a task_id immediately; use task_status for final responses, errors, pids, resume state, and killed/lost process states.",
		promptSnippet: "Delegate foreground or background work to a subagent.",
		promptGuidelines: [
			"Use task for delegated subagent work that benefits from isolated context.",
			"Use task_status to inspect background task final responses, errors, pids, resume state, and killed/lost process states.",
			"Use task_cancel to stop running subagents.",
		],
		parameters: TaskToolParams,
		async execute(
			_toolCallId: string,
			params: {
				prompt: string;
				description?: string;
				subagent_type?: string;
				background?: boolean;
				execution_mode?: ExecutionMode;
			},
			signal: AbortSignal | undefined,
			onUpdate: ((partial: AgentToolResult<TaskToolDetails>) => void) | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<TaskToolDetails>> {
			const agents: Record<string, AgentInfo> = await loadAgents(ctx.cwd).catch(() => ({}));
			const agentType = params.subagent_type ?? "default";
			const agent = agents[agentType] ?? (agentType === "default" ? agents.default : undefined);
			const background = params.background ?? agent?.background ?? false;
			const executionMode = params.execution_mode ?? agent?.executionMode;
			const started = manager.start({
				prompt: params.prompt,
				agentType,
				...(params.description !== undefined && { description: params.description }),
				parentSessionId: getParentSessionId(ctx),
				cwd: ctx.cwd,
				...(executionMode !== undefined && { executionMode }),
				...(agent?.model !== undefined && { model: agent.model }),
				...(agent?.models !== undefined && { models: agent.models }),
				background,
				signal,
			});
			onUpdate?.({
				content: [{ type: "text", text: `task ${started.task.taskId} running` }],
				details: { task_id: started.task.taskId, status: started.task.status },
			});

			if (background) {
				return {
					content: [
						{
							type: "text",
							text: `Started background task ${started.task.taskId}. Use task_status to inspect it.`,
						},
					],
					details: { task_id: started.task.taskId, status: started.task.status },
				};
			}

			const completed = started.promise === undefined ? started.task : await started.promise;
			const text = completed.finalResponse ?? completed.lastError?.message ?? `Task ${completed.status}`;
			return {
				content: [{ type: "text", text }],
				details: { task_id: completed.taskId, status: completed.status },
			};
		},
	};
}
