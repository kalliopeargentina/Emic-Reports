/**
 * Extract Markdown inline links `[label](destination "optional title")` for DOCX export.
 * Handles `<...>` destinations, balanced parentheses in URLs, and optional titles.
 * Skips image syntax `![...](...)`.
 */

export type MarkdownInlineLinkMatch = {
	readonly start: number;
	readonly end: number;
	readonly label: string;
	readonly href: string;
};

function parseLinkLabelAfterOpenBracket(s: string, openBracketIdx: number): { label: string; endIdx: number } | null {
	if (s[openBracketIdx] !== "[") return null;
	let i = openBracketIdx + 1;
	let label = "";
	while (i < s.length) {
		const c = s[i]!;
		if (c === "\\" && i + 1 < s.length) {
			label += s[i + 1]!;
			i += 2;
			continue;
		}
		if (c === "]") return { label, endIdx: i + 1 };
		label += c;
		i++;
	}
	return null;
}

function skipOptionalLinkTitle(s: string, i: number): number {
	let j = i;
	if (j >= s.length) return j;
	const c = s[j]!;
	if (c === '"' || c === "'") {
		j++;
		while (j < s.length) {
			if (s[j] === "\\") {
				j += 2;
				continue;
			}
			if (s[j] === c) return j + 1;
			j++;
		}
		return j;
	}
	if (c === "(") {
		let depth = 1;
		j++;
		while (j < s.length && depth > 0) {
			if (s[j] === "(") depth++;
			else if (s[j] === ")") depth--;
			j++;
		}
		return j;
	}
	return j;
}

/**
 * Parse `( destination optional-title )` starting at `openParenIdx` (which must be `(`).
 */
function parseLinkParenContent(s: string, openParenIdx: number): { href: string; endIdx: number } | null {
	if (s[openParenIdx] !== "(") return null;
	let i = openParenIdx + 1;
	while (i < s.length && /\s/.test(s[i]!)) i++;
	if (i >= s.length) return null;

	if (s[i] === "<") {
		const gt = s.indexOf(">", i + 1);
		if (gt < 0) return null;
		const href = s.slice(i + 1, gt);
		i = gt + 1;
		while (i < s.length && /\s/.test(s[i]!)) i++;
		i = skipOptionalLinkTitle(s, i);
		while (i < s.length && /\s/.test(s[i]!)) i++;
		if (s[i] !== ")") return null;
		return { href: href.trim(), endIdx: i + 1 };
	}

	let depth = 0;
	const start = i;
	while (i < s.length) {
		const c = s[i]!;
		if (c === "\\" && i + 1 < s.length) {
			i += 2;
			continue;
		}
		if (c === "(") {
			depth++;
			i++;
			continue;
		}
		if (c === ")") {
			if (depth > 0) {
				depth--;
				i++;
				continue;
			}
			const href = s.slice(start, i);
			return { href: href.trim(), endIdx: i + 1 };
		}
		if (/\s/.test(c) && depth === 0) {
			const href = s.slice(start, i);
			let j = i;
			while (j < s.length && /\s/.test(s[j]!)) j++;
			j = skipOptionalLinkTitle(s, j);
			while (j < s.length && /\s/.test(s[j]!)) j++;
			if (s[j] !== ")") return null;
			return { href: href.trim(), endIdx: j + 1 };
		}
		i++;
	}
	return null;
}

/**
 * Non-overlapping inline `[text](href)` matches; skips `![alt](url)`.
 */
export function findMarkdownInlineLinks(text: string): MarkdownInlineLinkMatch[] {
	const out: MarkdownInlineLinkMatch[] = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== "[") continue;
		if (i > 0 && text[i - 1] === "!") continue;

		const lb = parseLinkLabelAfterOpenBracket(text, i);
		if (!lb) continue;

		let j = lb.endIdx;
		while (j < text.length && /\s/.test(text[j]!)) j++;
		const pc = parseLinkParenContent(text, j);
		if (!pc) continue;

		out.push({ start: i, end: pc.endIdx, label: lb.label, href: pc.href });
		i = pc.endIdx - 1;
	}
	return out;
}
