export type ParsedFrontmatter = {
	frontmatter: Record<string, unknown>;
	body: string;
};

export function parseFrontmatter(content: string): ParsedFrontmatter {
	if (!content.startsWith("---\n")) {
		return { frontmatter: {}, body: content.trim() };
	}

	const end = content.indexOf("\n---", 4);
	if (end === -1) {
		return { frontmatter: {}, body: content.trim() };
	}

	const rawFrontmatter = content.slice(4, end);
	const bodyStart = content.indexOf("\n", end + 4);
	const body = bodyStart === -1 ? "" : content.slice(bodyStart + 1).trim();
	return { frontmatter: parseSimpleYaml(rawFrontmatter), body };
}

function parseScalar(value: string): unknown {
	const trimmed = value.trim();
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map((part) => part.trim().replace(/^["']|["']$/g, ""))
			.filter((part) => part.length > 0);
	}
	return trimmed.replace(/^["']|["']$/g, "");
}

function parseSimpleYaml(raw: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = raw.split(/\r?\n/);
	let currentArrayKey: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		if (trimmed.startsWith("- ") && currentArrayKey !== null) {
			const current = result[currentArrayKey];
			if (Array.isArray(current)) {
				current.push(parseScalar(trimmed.slice(2)));
			}
			continue;
		}

		const separatorIndex = trimmed.indexOf(":");
		if (separatorIndex === -1) continue;
		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();
		if (!value) {
			result[key] = [];
			currentArrayKey = key;
			continue;
		}
		result[key] = parseScalar(value);
		currentArrayKey = null;
	}

	return result;
}
