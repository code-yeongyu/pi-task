import { spawn } from "node:child_process";
import type { TaskStatus } from "./types.js";

export type ProcessRunnerEvent = { type: "started"; pid: number } | { type: "stderr"; text: string };

export type ProcessRunnerInput = {
	taskId: string;
	command: string;
	args: string[];
	cwd?: string;
	signal?: AbortSignal;
	onEvent?: (event: ProcessRunnerEvent) => void;
};

export type ProcessRunnerResult = {
	status: Extract<TaskStatus, "completed" | "failed" | "cancelled" | "killed">;
	pid?: number;
	finalResponse?: string;
	errorMessage?: string;
	exitCode?: number;
	exitSignal?: NodeJS.Signals;
};

export class ProcessRunner {
	run(input: ProcessRunnerInput): Promise<ProcessRunnerResult> {
		return new Promise((resolve) => {
			const child = spawn(input.command, input.args, {
				cwd: input.cwd,
				env: {
					...process.env,
					PI_TASK_ID: input.taskId,
				},
				stdio: ["ignore", "pipe", "pipe"],
				shell: false,
			});
			let stdout = "";
			let stderr = "";
			let aborted = false;

			if (child.pid !== undefined) {
				input.onEvent?.({ type: "started", pid: child.pid });
			}

			child.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf-8");
			});
			child.stderr?.on("data", (chunk: Buffer) => {
				const text = chunk.toString("utf-8");
				stderr += text;
				input.onEvent?.({ type: "stderr", text });
			});
			child.on("error", (error) => {
				resolve({
					status: "failed",
					...(child.pid !== undefined && { pid: child.pid }),
					errorMessage: error.message,
				});
			});
			child.on("close", (code, signal) => {
				const pid = child.pid;
				if (aborted) {
					resolve({
						status: "cancelled",
						...(pid !== undefined && { pid }),
						...(code !== null && { exitCode: code }),
						...(signal !== null && { exitSignal: signal }),
						errorMessage: "Process task was cancelled.",
					});
					return;
				}
				if (signal !== null) {
					resolve({
						status: "killed",
						...(pid !== undefined && { pid }),
						exitSignal: signal,
						errorMessage: `Process exited after signal ${signal}.`,
					});
					return;
				}
				if (code === 0) {
					resolve({
						status: "completed",
						...(pid !== undefined && { pid }),
						exitCode: 0,
						finalResponse: stdout.trim(),
					});
					return;
				}
				resolve({
					status: "failed",
					...(pid !== undefined && { pid }),
					...(code !== null && { exitCode: code }),
					errorMessage: stderr.trim() || `Process exited with code ${code ?? "unknown"}.`,
				});
			});

			const abort = (): void => {
				aborted = true;
				child.kill("SIGTERM");
			};
			if (input.signal?.aborted) abort();
			input.signal?.addEventListener("abort", abort, { once: true });
		});
	}
}
