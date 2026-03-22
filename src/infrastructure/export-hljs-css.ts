import type { StyleTokens } from "../domain/style-template";

/**
 * Self-contained syntax-highlight colors for PDF / standalone HTML.
 * Obsidian's app theme does not load in headless Chromium — token spans need explicit rules.
 * Palette: light background friendly (similar to GitHub / default hljs light).
 */
export function buildExportHljsCss(t: StyleTokens): string {
	const s = ".ra-render-frame";
	const base = t.hljsBaseColor;
	const comment = t.hljsCommentColor;
	const keyword = t.hljsKeywordColor;
	const literal = t.hljsLiteralColor;
	const str = t.hljsStringColor;
	const title = t.hljsTitleColor;
	const name = t.hljsNameColor;
	const del = t.hljsDeletionColor;
	const attr = t.hljsAttrColor;
	const punct = t.hljsPunctuationColor;
	const prismVar = t.hljsPrismVariableColor;
	return `
/* --- Export syntax highlighting (hljs token classes inside pre code) --- */
${s} pre code.hljs { color: ${base} !important; }
${s} .hljs-comment,
${s} .hljs-quote { color: ${comment} !important; font-style: italic !important; }
${s} .hljs-keyword,
${s} .hljs-selector-tag,
${s} .hljs-subst,
${s} .hljs-doctag { color: ${keyword} !important; }
${s} .hljs-number,
${s} .hljs-literal,
${s} .hljs-regexp,
${s} .hljs-variable,
${s} .hljs-template-variable,
${s} .hljs-link,
${s} .hljs-selector-attr,
${s} .hljs-selector-pseudo { color: ${literal} !important; }
${s} .hljs-string,
${s} .hljs-meta .hljs-string,
${s} .hljs-attribute { color: ${str} !important; }
${s} .hljs-title,
${s} .hljs-section,
${s} .hljs-built_in,
${s} .hljs-name,
${s} .hljs-type { color: ${title} !important; }
${s} .hljs-symbol,
${s} .hljs-bullet,
${s} .hljs-addition { color: ${name} !important; }
${s} .hljs-deletion { color: ${del} !important; }
${s} .hljs-meta,
${s} .hljs-meta-keyword { color: ${attr} !important; }
${s} .hljs-emphasis { font-style: italic !important; }
${s} .hljs-strong { font-weight: bold !important; }
${s} .hljs-formula { color: ${attr} !important; }
${s} .hljs-params { color: ${punct} !important; }
${s} .hljs-function .hljs-keyword,
${s} .hljs-class .hljs-keyword { color: ${keyword} !important; }
${s} .hljs-tag,
${s} .hljs-selector-id,
${s} .hljs-selector-class { color: ${name} !important; }
${s} .hljs-attr,
${s} .hljs-attribute { color: ${attr} !important; }
${s} .hljs-punctuation,
${s} .hljs-operator { color: ${punct} !important; }

/* Prism-style tokens (some Obsidian builds / plugins) */
${s} pre .token.comment,
${s} pre .token.prolog,
${s} pre .token.doctype,
${s} pre .token.cdata { color: ${comment} !important; font-style: italic !important; }
${s} pre .token.punctuation { color: ${punct} !important; }
${s} pre .token.property,
${s} pre .token.tag,
${s} pre .token.boolean,
${s} pre .token.number,
${s} pre .token.constant,
${s} pre .token.symbol,
${s} pre .token.deleted { color: ${literal} !important; }
${s} pre .token.selector,
${s} pre .token.attr-name,
${s} pre .token.string,
${s} pre .token.char,
${s} pre .token.builtin,
${s} pre .token.inserted { color: ${str} !important; }
${s} pre .token.operator,
${s} pre .token.entity,
${s} pre .token.url,
${s} pre .language-css .token.string,
${s} pre .style .token.string { color: ${keyword} !important; }
${s} pre .token.atrule,
${s} pre .token.attr-value,
${s} pre .token.keyword { color: ${keyword} !important; }
${s} pre .token.function,
${s} pre .token.class-name { color: ${title} !important; }
${s} pre .token.regex,
${s} pre .token.important,
${s} pre .token.variable { color: ${prismVar} !important; }
`.trim();
}

/** Hide any code-block UI that survives DOM strip (defensive for PDF). */
export function buildExportCodeBlockChromeHideCss(): string {
	const s = ".ra-render-frame";
	return `
${s} pre button,
${s} [class*="code-block"] button,
${s} .markdown-code-block button,
${s} .copy-code-button,
${s} .markdown-rendered pre + button {
	display: none !important;
	visibility: hidden !important;
	width: 0 !important;
	height: 0 !important;
	margin: 0 !important;
	padding: 0 !important;
	overflow: hidden !important;
	pointer-events: none !important;
}
`.trim();
}
