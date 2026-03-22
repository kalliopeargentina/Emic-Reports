/**
 * Self-contained syntax-highlight colors for PDF / standalone HTML.
 * Obsidian's app theme does not load in headless Chromium — token spans need explicit rules.
 * Palette: light background friendly (similar to GitHub / default hljs light).
 */
export function buildExportHljsCss(): string {
	const s = ".ra-render-frame";
	return `
/* --- Export syntax highlighting (hljs token classes inside pre code) --- */
${s} pre code.hljs { color: #24292e !important; }
${s} .hljs-comment,
${s} .hljs-quote { color: #6a737d !important; font-style: italic !important; }
${s} .hljs-keyword,
${s} .hljs-selector-tag,
${s} .hljs-subst,
${s} .hljs-doctag { color: #d73a49 !important; }
${s} .hljs-number,
${s} .hljs-literal,
${s} .hljs-regexp,
${s} .hljs-variable,
${s} .hljs-template-variable,
${s} .hljs-link,
${s} .hljs-selector-attr,
${s} .hljs-selector-pseudo { color: #005cc5 !important; }
${s} .hljs-string,
${s} .hljs-meta .hljs-string,
${s} .hljs-attribute { color: #032f62 !important; }
${s} .hljs-title,
${s} .hljs-section,
${s} .hljs-built_in,
${s} .hljs-name,
${s} .hljs-type { color: #6f42c1 !important; }
${s} .hljs-symbol,
${s} .hljs-bullet,
${s} .hljs-addition { color: #22863a !important; }
${s} .hljs-deletion { color: #b31d28 !important; }
${s} .hljs-meta,
${s} .hljs-meta-keyword { color: #005cc5 !important; }
${s} .hljs-emphasis { font-style: italic !important; }
${s} .hljs-strong { font-weight: bold !important; }
${s} .hljs-formula { color: #005cc5 !important; }
${s} .hljs-params { color: #24292e !important; }
${s} .hljs-function .hljs-keyword,
${s} .hljs-class .hljs-keyword { color: #d73a49 !important; }
${s} .hljs-tag,
${s} .hljs-selector-id,
${s} .hljs-selector-class { color: #22863a !important; }
${s} .hljs-attr,
${s} .hljs-attribute { color: #005cc5 !important; }
${s} .hljs-punctuation,
${s} .hljs-operator { color: #24292e !important; }

/* Prism-style tokens (some Obsidian builds / plugins) */
${s} pre .token.comment,
${s} pre .token.prolog,
${s} pre .token.doctype,
${s} pre .token.cdata { color: #6a737d !important; font-style: italic !important; }
${s} pre .token.punctuation { color: #24292e !important; }
${s} pre .token.property,
${s} pre .token.tag,
${s} pre .token.boolean,
${s} pre .token.number,
${s} pre .token.constant,
${s} pre .token.symbol,
${s} pre .token.deleted { color: #005cc5 !important; }
${s} pre .token.selector,
${s} pre .token.attr-name,
${s} pre .token.string,
${s} pre .token.char,
${s} pre .token.builtin,
${s} pre .token.inserted { color: #032f62 !important; }
${s} pre .token.operator,
${s} pre .token.entity,
${s} pre .token.url,
${s} pre .language-css .token.string,
${s} pre .style .token.string { color: #d73a49 !important; }
${s} pre .token.atrule,
${s} pre .token.attr-value,
${s} pre .token.keyword { color: #d73a49 !important; }
${s} pre .token.function,
${s} pre .token.class-name { color: #6f42c1 !important; }
${s} pre .token.regex,
${s} pre .token.important,
${s} pre .token.variable { color: #e36209 !important; }
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
