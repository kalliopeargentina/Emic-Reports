/**
 * Obsidian / Emic-QDA–style highlights: `==text==` and `=={red} text==`.
 * Aligned with emic-qda `scan-highlights.ts` (regex + `{color}` prefix).
 */

export const HIGHLIGHT_SYNTAX_REGEX = /==((?:[^=]|=[^=])+?)==/g;

export type InlineColorParse = { text: string; colorToken?: string };

/** Leading `{token}` before highlighted text (same as emic-qda `parseInlineColor`). */
export function parseHighlightColorPrefix(value: string): InlineColorParse {
	const match = value.match(/^\{([^}]*)\}\s*/);
	if (!match) return { text: value.trim() };
	const color = (match[1] ?? "").trim();
	const text = value.slice(match[0].length).trim();
	if (!color) return { text };
	return { text, colorToken: color };
}

/**
 * Resolve Emic-QDA color tokens to a CSS background (Obsidian palette vars or raw CSS).
 * Returns `undefined` when the token means “use default highlight” (default/remove/none).
 */
export function normalizeHighlightColorToken(raw: string): string | undefined {
	const t = raw.trim();
	if (!t) return undefined;
	const lower = t.toLowerCase();
	if (lower === "default" || lower === "remove" || lower === "none") return undefined;

	if (t.startsWith("#")) {
		const hex = t.slice(1).replace(/[^0-9a-fA-F]/g, "");
		if (hex.length === 5) return `#${(hex + hex.slice(-1)).toLowerCase()}`;
		if (hex.length === 3)
			return `#${(
				(hex[0] ?? "") +
				(hex[0] ?? "") +
				(hex[1] ?? "") +
				(hex[1] ?? "") +
				(hex[2] ?? "") +
				(hex[2] ?? "")
			).toLowerCase()}`;
		if (hex.length === 6 || hex.length === 8) return `#${hex.toLowerCase()}`;
		return t;
	}
	if (
		t.startsWith("rgb(") ||
		t.startsWith("rgba(") ||
		t.startsWith("hsl(") ||
		t.startsWith("hsla(") ||
		t.startsWith("var(")
	) {
		return t;
	}

	const palette: Record<string, string> = {
		red: "var(--text-highlight-bg-red, rgba(244, 67, 54, 0.35))",
		orange: "var(--text-highlight-bg-orange, rgba(255, 152, 0, 0.35))",
		yellow: "var(--text-highlight-bg-yellow, rgba(255, 235, 59, 0.35))",
		green: "var(--text-highlight-bg-green, rgba(139, 195, 74, 0.35))",
		cyan: "var(--text-highlight-bg-cyan, rgba(0, 188, 212, 0.35))",
		blue: "var(--text-highlight-bg-blue, rgba(100, 181, 246, 0.35))",
		purple: "var(--text-highlight-bg-purple, rgba(179, 136, 255, 0.35))",
		pink: "var(--text-highlight-bg-pink, rgba(240, 98, 146, 0.35))",
		accent: "var(--text-highlight-bg-accent, var(--interactive-accent))",
	};
	return palette[lower] ?? t;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function parseRgbLike(r: number, g: number, b: number, a: number): { r: number; g: number; b: number } {
	const al = Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
	const mix = (c: number) => Math.round(255 * (1 - al) + c * al);
	return { r: mix(r), g: mix(g), b: mix(b) };
}

/** Convert CSS background string to 6-digit DOCX shading fill (uppercase, no #). */
export function highlightCssToDocxFill(css: string, fallbackHex6: string): string {
	const t = css.trim();
	const fb = fallbackHex6.replace(/^#/, "").toUpperCase();
	if (t.startsWith("#")) {
		const cleaned = t.slice(1).replace(/[^0-9a-fA-F]/g, "");
		if (cleaned.length >= 6) return cleaned.slice(0, 6).toUpperCase();
		return fb;
	}

	const rgba =
		/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i.exec(t);
	if (rgba) {
		const r = Number(rgba[1] ?? 0);
		const g = Number(rgba[2] ?? 0);
		const b = Number(rgba[3] ?? 0);
		const a = rgba[4] !== undefined ? Number(rgba[4]) : 1;
		const { r: R, g: G, b: B } = parseRgbLike(r, g, b, a);
		return [R, G, B]
			.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase();
	}

	if (t.startsWith("var(")) {
		const inner = /,\s*(rgba?\([^)]+\))/i.exec(t);
		if (inner?.[1]) return highlightCssToDocxFill(inner[1], fb);
		return fb;
	}

	return fb;
}

/** Default native highlight: used when resolving `var(--text-highlight-bg-*)` for export. */
export function defaultHighlightCssToDocxFill(defaultBackgroundCss: string): string {
	const fill = highlightCssToDocxFill(defaultBackgroundCss, "FFF9C4");
	return fill;
}

function expandHighlightsInProtectedLine(line: string, defaultBgCss: string): string {
	return line.replace(HIGHLIGHT_SYNTAX_REGEX, (full, inner: string) => {
		const trimmed = (inner ?? "").trim();
		const { text, colorToken } = parseHighlightColorPrefix(trimmed);
		if (!text) return full;

		let bgCss = defaultBgCss;
		if (colorToken) {
			const resolved = normalizeHighlightColorToken(colorToken);
			if (resolved) bgCss = resolved;
		}

		const safeBg = bgCss.replace(/"/g, "&quot;");
		const style = `background-color: ${safeBg};`;
		return `<mark style="${style}">${escapeHtml(text)}</mark>`;
	});
}

/**
 * Replace ==highlight== with <mark> in Markdown **outside** fenced code blocks.
 * Preserves content inside inline `code` spans on each line.
 */
export function expandHighlightsInMarkdown(markdown: string, defaultHighlightBackgroundCss: string): string {
	const lines = markdown.split("\n");
	let inFence = false;
	const out: string[] = [];

	for (const line of lines) {
		const trimmedStart = line.trimStart();
		if (trimmedStart.startsWith("```") || trimmedStart.startsWith("~~~")) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}

		const placeholders: string[] = [];
		const protectedLine = line.replace(/`[^`]+`/g, (m) => {
			placeholders.push(m);
			return `\x00PH${placeholders.length - 1}\x00`;
		});

		let replaced = expandHighlightsInProtectedLine(protectedLine, defaultHighlightBackgroundCss);
		replaced = replaced.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[Number(i)] ?? "");
		out.push(replaced);
	}

	return out.join("\n");
}

/** Split plain / highlighted segments for DOCX (no HTML). */
export function segmentHighlightSyntax(
	line: string,
): Array<{ kind: "text" | "hl"; text: string; colorToken?: string }> {
	const segments: Array<{ kind: "text" | "hl"; text: string; colorToken?: string }> = [];
	const re = new RegExp(HIGHLIGHT_SYNTAX_REGEX.source, "g");
	let last = 0;
	let m = re.exec(line);
	while (m !== null) {
		if (m.index > last) {
			segments.push({ kind: "text", text: line.slice(last, m.index) });
		}
		const inner = (m[1] ?? "").trim();
		const parsed = parseHighlightColorPrefix(inner);
		if (!parsed.text) {
			segments.push({ kind: "text", text: m[0] ?? "" });
		} else {
			segments.push({ kind: "hl", text: parsed.text, colorToken: parsed.colorToken });
		}
		last = m.index + (m[0]?.length ?? 0);
		m = re.exec(line);
	}
	if (last < line.length) {
		segments.push({ kind: "text", text: line.slice(last) });
	}
	return segments.length ? segments : [{ kind: "text", text: line }];
}
