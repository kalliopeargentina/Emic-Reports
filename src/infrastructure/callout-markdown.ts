/**
 * Pure markdown helpers for Obsidian-style callouts in blockquotes (`> [!type]`).
 * Used by DOCX export and unit tests (no Obsidian runtime).
 */

/** Max nested callout depth for DOCX export (inclusive). */
export const CALLOUT_NEST_MAX_DEPTH = 5;

export interface ParsedCalloutStartLine {
	/** Number of leading `>` tokens (Obsidian nesting depth). */
	depth: number;
	/** Normalized callout type slug (lowercase, hyphenated). */
	rawType: string;
	/** Text after `] ` on the first line (title / fold markers may still be present). */
	restAfterBracket: string;
}

/**
 * If the line opens a callout (`>…> [!type] …`), return depth and type.
 * Returns null if not a callout opener.
 */
export function parseCalloutStartLine(line: string): ParsedCalloutStartLine | null {
	const s = line.trimStart();
	let i = 0;
	let depth = 0;
	while (i < s.length) {
		if (s[i] !== ">") break;
		depth++;
		i++;
		while (i < s.length && s[i] === " ") i++;
	}
	if (depth === 0) return null;
	const rest = s.slice(i);
	const m = /^\[!([^\]]+)\]\s*(.*)$/.exec(rest);
	if (!m) return null;
	let rawType = (m[1] ?? "note").trim().toLowerCase().replace(/\s+/g, "-");
	if (rawType.endsWith("-")) {
		rawType = rawType.slice(0, -1);
	}
	return {
		depth,
		rawType,
		restAfterBracket: (m[2] ?? "").trim(),
	};
}

/** Count leading `>` blockquote depth (after trim-start). */
export function countQuoteDepth(line: string): number {
	const s = line.trimStart();
	let i = 0;
	let depth = 0;
	while (i < s.length) {
		if (s[i] !== ">") break;
		depth++;
		i++;
		while (i < s.length && s[i] === " ") i++;
	}
	return depth;
}

/**
 * Strip `depth` levels of leading `>` (each level may be followed by spaces).
 */
export function stripQuoteLevels(line: string, depth: number): string {
	let s = line.trimStart();
	for (let d = 0; d < depth; d++) {
		if (!s.startsWith(">")) break;
		s = s.slice(1);
		s = s.replace(/^\s*/, "");
	}
	return s;
}
