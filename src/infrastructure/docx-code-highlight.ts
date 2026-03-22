import { TextRun } from "docx";
import hljs from "highlight.js/lib/common";
import type { StyleTokens } from "../domain/style-template";

/**
 * Token → hex (no #), aligned with {@link buildExportHljsCss} for PDF/HTML.
 */
const HLJS_TOKEN_HEX: Record<string, string> = {
	comment: "6A737D",
	quote: "6A737D",
	keyword: "D73A49",
	"selector-tag": "D73A49",
	subst: "D73A49",
	doctag: "D73A49",
	number: "005CC5",
	literal: "005CC5",
	regexp: "005CC5",
	variable: "005CC5",
	"template-variable": "005CC5",
	link: "005CC5",
	"selector-attr": "005CC5",
	"selector-pseudo": "005CC5",
	string: "032F62",
	attribute: "005CC5",
	title: "6F42C1",
	section: "6F42C1",
	built_in: "6F42C1",
	name: "6F42C1",
	type: "6F42C1",
	symbol: "22863A",
	bullet: "22863A",
	addition: "22863A",
	deletion: "B31D28",
	meta: "005CC5",
	"meta-keyword": "005CC5",
	params: "24292E",
	tag: "22863A",
	"selector-id": "22863A",
	"selector-class": "22863A",
	attr: "005CC5",
	punctuation: "24292E",
	operator: "24292E",
	formula: "005CC5",
	function: "6F42C1",
	class: "6F42C1",
};

const FENCE_LANG_ALIASES: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	ts: "typescript",
	tsx: "typescript",
	py: "python",
	sh: "bash",
	zsh: "bash",
	ksh: "bash",
	yml: "yaml",
	md: "markdown",
	html: "xml",
	htm: "xml",
	text: "plaintext",
	txt: "plaintext",
	"": "plaintext",
};

function normalizeFenceLanguage(raw: string): string {
	let L = raw.trim().toLowerCase();
	const brace = /^\{([^}]+)\}$/.exec(L);
	if (brace) L = (brace[1] ?? "").trim().toLowerCase();
	L = L.split(/\s+/)[0] ?? "";
	return FENCE_LANG_ALIASES[L] ?? (L || "plaintext");
}

function mergeHljsStyle(
	className: string,
	parent: { color: string; bold: boolean; italic: boolean },
): { color: string; bold: boolean; italic: boolean } {
	const classes = className.split(/\s+/).filter(Boolean);
	if (classes.length === 0 || classes.every((c) => !/^hljs-/.test(c))) {
		return { ...parent };
	}
	let color = parent.color;
	let bold = parent.bold;
	let italic = parent.italic;
	for (const cls of classes) {
		const sub = cls.replace(/^hljs-/, "");
		if (sub === "strong") bold = true;
		else if (sub === "emphasis") italic = true;
		else if (HLJS_TOKEN_HEX[sub]) color = HLJS_TOKEN_HEX[sub];
	}
	return { color, bold, italic };
}

function highlightToHtml(code: string, fenceLang: string): string {
	const lang = normalizeFenceLanguage(fenceLang);
	try {
		if (lang && hljs.getLanguage(lang)) {
			return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
		}
		return hljs.highlightAuto(code).value;
	} catch {
		return escapeHtml(code);
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Walk highlighted HTML and emit {@link TextRun}s with per-token colors (like PDF export).
 */
export function highlightCodeToDocxRuns(
	code: string,
	fenceLang: string,
	tokens: StyleTokens,
	toDocxColor: (cssHex: string) => string,
	ptToHalfPoint: (pt: number) => number,
): TextRun[] {
	const baseHex = (() => {
		const c = tokens.codeInlineColor.trim().replace(/^#/, "");
		return /^[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : "24292E";
	})();

	const html = highlightToHtml(code, fenceLang);
	const doc = new DOMParser().parseFromString(`<div class="hljs-doc">${html}</div>`, "text/html");
	const root = doc.querySelector(".hljs-doc");
	if (!root) {
		return plainCodeRuns(code, tokens, toDocxColor, ptToHalfPoint);
	}

	const runs: TextRun[] = [];
	const font = tokens.fontMono;
	const size = ptToHalfPoint(tokens.codeFontSize);

	const pushTextWithBreaks = (text: string, st: { color: string; bold: boolean; italic: boolean }) => {
		const lines = text.split("\n");
		for (let i = 0; i < lines.length; i += 1) {
			if (i > 0) {
				runs.push(new TextRun({ break: 1, text: "", font, size }));
			}
			const line = lines[i] ?? "";
			if (line.length > 0) {
				runs.push(
					new TextRun({
						text: line,
						font,
						size,
						color: toDocxColor(`#${st.color}`),
						bold: st.bold,
						italics: st.italic,
					}),
				);
			}
		}
	};

	function visit(node: Node, st: { color: string; bold: boolean; italic: boolean }): void {
		if (node.nodeType === Node.TEXT_NODE) {
			pushTextWithBreaks(node.textContent ?? "", st);
			return;
		}
		/* hljs emits <span> (HTML); SVG/math nodes must still recurse (not only HTMLElement). */
		if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as Element;
			const cls = el.getAttribute("class") ?? "";
			const next = mergeHljsStyle(cls, st);
			for (const ch of Array.from(node.childNodes)) {
				visit(ch, next);
			}
		}
	}

	const initial = { color: baseHex, bold: false, italic: false };
	for (const ch of Array.from(root.childNodes)) {
		visit(ch, initial);
	}

	if (runs.length === 0) {
		return plainCodeRuns(code, tokens, toDocxColor, ptToHalfPoint);
	}
	return runs;
}

function plainCodeRuns(
	code: string,
	tokens: StyleTokens,
	toDocxColor: (cssHex: string) => string,
	ptToHalfPoint: (pt: number) => number,
): TextRun[] {
	const lines = code.split("\n");
	return lines.map(
		(line, i) =>
			new TextRun({
				text: line,
				font: tokens.fontMono,
				color: toDocxColor(tokens.codeInlineColor),
				size: ptToHalfPoint(tokens.codeFontSize),
				break: i === 0 ? undefined : 1,
			}),
	);
}
