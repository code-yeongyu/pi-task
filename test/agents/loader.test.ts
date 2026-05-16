import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadAllAgents } from "../../src/agents/loader.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "pi-task-agents-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("agent loader", () => {
	it("#given global pi and project senpi agents #when loading #then project senpi overrides earlier definitions", async () => {
		const root = await makeTempDir();
		const home = path.join(root, "home");
		const cwd = path.join(root, "project");
		await mkdir(path.join(home, ".pi", "agent", "agents"), { recursive: true });
		await mkdir(path.join(cwd, ".senpi", "agents"), { recursive: true });
		await writeFile(
			path.join(home, ".pi", "agent", "agents", "finder.md"),
			"---\ndescription: Global finder\n---\nGlobal prompt",
		);
		await writeFile(
			path.join(cwd, ".senpi", "agents", "finder.md"),
			"---\ndescription: Project finder\nmodels:\n  - gpt-5.5\n---\nProject prompt",
		);

		const agents = await loadAllAgents(cwd, home);

		expect(agents.finder?.description).toBe("Project finder");
		expect(agents.finder?.prompt).toBe("Project prompt");
		expect(agents.finder?.models).toEqual(["gpt-5.5"]);
	});

	it("#given senpi agents compatibility path #when loading #then reads ~/.senpi/agents/agents", async () => {
		const root = await makeTempDir();
		const home = path.join(root, "home");
		const cwd = path.join(root, "project");
		await mkdir(path.join(home, ".senpi", "agents", "agents"), { recursive: true });
		await writeFile(
			path.join(home, ".senpi", "agents", "agents", "reviewer.md"),
			"---\ndescription: Reviews code\n---\nReview code",
		);

		const agents = await loadAllAgents(cwd, home);

		expect(agents.reviewer?.description).toBe("Reviews code");
		expect(agents.reviewer?.prompt).toBe("Review code");
	});
});
