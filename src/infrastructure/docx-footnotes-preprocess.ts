/**
 * Strip Markdown footnote definitions and expand Obsidian-style inline footnotes
 * (`^[...]`) into reference form for DOCX export. Skips fenced code blocks.
 */

const FENCE_OPENER = /^(```|~~~)/;

function toggleFence(trimmed: string, inFence: boolean): boolean {
	if (!FENCE_OPENER.test(trimmed)) return inFence;
	return !inFence;
}

function unescapeFootnoteInlineBody(inner: string): string {
	return inner.replace(/\\([\\[\]])/g, "$1");
}

/**
 * Replace `^[body]` on a single line with `[^emicilN]` and record definitions.
 */
function expandInlineFootnotesOnLine(
	line: string,
	definitions: Map<string, string>,
	nextInlineLabel: () => string,
): string {
	return line.replace(/\^\[((?:\\.|[^\]])*)\]/g, (_full, inner: string) => {
		const lab = nextInlineLabel();
		definitions.set(lab, unescapeFootnoteInlineBody(inner));
		return `[^${lab}]`;
	});
}

/**
 * True if this line continues a footnote definition (4 spaces or tab + content).
 */
function isFootnoteContinuationLine(line: string): boolean {
	return /^( {4}|\t)\S/.test(line) || /^( {4}|\t)$/.test(line);
}

function stripOneIndentLevel(line: string): string {
	if (line.startsWith("\t")) return line.slice(1);
	if (line.startsWith("    ")) return line.slice(4);
	return line;
}

/**
 * @param allLines — full document split by `\n` (no trailing join artifact).
 * @returns Replacement lines (definitions removed) and footnote bodies by label.
 */
export function preprocessDocxFootnotesForExport(allLines: string[]): {
	lines: string[];
	definitions: Map<string, string>;
} {
	const definitions = new Map<string, string>();
	let inlineCounter = 0;
	const nextInlineLabel = (): string => {
		const n = inlineCounter++;
		return `emicil${n}`;
	};

	const out: string[] = [];
	let inFence = false;
	let i = 0;

	while (i < allLines.length) {
		const rawLine = allLines[i] ?? "";
		/** CRLF-safe; keep leading spaces for output lines (composer may indent whole notes). */
		const line = rawLine.replace(/\r$/, "");
		const trimmed = line.trim();

		if (FENCE_OPENER.test(trimmed)) {
			inFence = toggleFence(trimmed, inFence);
			out.push(rawLine);
			i += 1;
			continue;
		}

		if (inFence) {
			out.push(rawLine);
			i += 1;
			continue;
		}

		/**
		 * Allow leading whitespace so footnote defs still match when the composer prefixes
		 * every line (e.g. `indentLevel` / nested structure).
		 */
		const defMatch = /^\s*\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
		if (defMatch) {
			const label = defMatch[1] ?? "";
			const parts: string[] = [];
			const firstLineRest = defMatch[2] ?? "";
			parts.push(firstLineRest);
			i += 1;

			while (i < allLines.length) {
				const L = (allLines[i] ?? "").replace(/\r$/, "");
				const t = L.trim();
				if (FENCE_OPENER.test(t)) break;
				if (isFootnoteContinuationLine(L)) {
					parts.push(stripOneIndentLevel(L));
					i += 1;
				} else if (t === "") {
					i += 1;
					break;
				} else {
					break;
				}
			}

			const body = parts.join("\n").replace(/\n+$/, "").trimEnd();
			definitions.set(label, body);
			continue;
		}

		out.push(expandInlineFootnotesOnLine(line, definitions, nextInlineLabel));
		i += 1;
	}

	return { lines: out, definitions };
}
