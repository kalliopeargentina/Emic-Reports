import type { ReportProject } from "../domain/report-project";
import { CALLOUT_TYPE_RGB } from "../domain/callout-palette";
import {
	mergePrintRules,
	mergeStyleTokens,
	type HeadingNumberingMode,
	type StyleTokens,
} from "../domain/style-template";
import { PageSizeResolver } from "./page-size-resolver";

export class CssTemplateEngine {
	private pageSizeResolver = new PageSizeResolver();

	build(project: ReportProject): string {
		const t = mergeStyleTokens(project.styleTemplate.tokens);
		const pr = mergePrintRules(project.styleTemplate.printRules);
		const pageSize = this.pageSizeResolver.resolve(project);
		const numberingCss = this.buildHeadingNumberingCss(pr.headingNumbering);
		const backgroundCss = this.buildBackgroundCss(project);
		const tableBreak = pr.tableBreakBehavior === "avoid" ? "avoid" : "auto";
		const preBreak = pr.prePageBreakInside === "avoid" ? "avoid" : "auto";
		const hrBreak = pr.hrAsPageBreak ? "always" : "auto";
		const captionStyle =
			pr.imageCaptionStyle === "centered-small"
				? `text-align: center; font-size: ${t.captionFontSize}pt; margin-bottom: ${t.captionMarginBottom}px;`
				: `font-size: ${t.captionFontSize}pt;`;

		const calloutCss = this.buildCalloutCss(t);

		const listBulletCss = t.listCustomBullet
			? `
.ra-render-frame ul li {
	list-style-type: none !important;
	position: relative !important;
}
.ra-render-frame ul li::before {
	content: '${t.listBulletChar}' !important;
	position: absolute !important;
	left: ${t.listBulletOffset} !important;
	top: ${t.listBulletTopOffset} !important;
	font-size: 1.1em !important;
}`
			: "";

		return `
:root {
	--ra-font-body: ${t.fontBody};
	--ra-font-heading: ${t.fontHeading};
	--ra-font-mono: ${t.fontMono};
	--ra-text: ${t.colorText};
	--ra-muted: ${t.colorMuted};
	--ra-accent: ${t.colorAccent};
	--ra-body-size: ${t.fontSizeBody}pt;
	--ra-body-line-height: ${t.lineHeightBody};
	--ra-p-spacing: ${t.paragraphSpacing}px;
	--ra-section-spacing: ${t.sectionSpacing}px;
	--ra-page-margin-top: ${t.pageMarginTop};
	--ra-page-margin-right: ${t.pageMarginRight};
	--ra-page-margin-bottom: ${t.pageMarginBottom};
	--ra-page-margin-left: ${t.pageMarginLeft};
	--ra-code-bg: ${t.codeBlockBackground};
	--ra-code-normal: ${t.codeNormalColor};
}

.ra-render-frame {
	color: var(--ra-text);
	font-family: var(--ra-font-body);
	font-size: var(--ra-body-size);
	line-height: var(--ra-body-line-height);
	tab-size: ${t.tabSize} !important;
	--code-background: ${t.codeBlockBackground} !important;
	--code-normal: ${t.codeNormalColor} !important;
	background: ${t.pageBackgroundColor} !important;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

.ra-render-frame a:link,
.ra-render-frame a:visited,
.ra-render-frame a {
	color: ${t.linkColor} !important;
	text-decoration: ${t.linkUnderline ? "underline" : "none"} !important;
}

.ra-render-frame p {
	font-family: var(--ra-font-body) !important;
	font-size: ${t.fontSizeBody}pt !important;
	text-align: ${t.paragraphTextAlign} !important;
	line-height: ${t.lineHeightBody} !important;
	margin-top: ${t.paragraphSpacing}px !important;
}

.ra-render-frame strong {
	font-weight: bold !important;
	color: ${t.strongColor} !important;
}

.ra-render-frame em {
	font-style: italic !important;
	color: ${t.emColor} !important;
}

.ra-render-frame h1,
.ra-render-frame h2,
.ra-render-frame h3,
.ra-render-frame h4,
.ra-render-frame h5,
.ra-render-frame h6 {
	font-family: var(--ra-font-heading) !important;
	color: var(--ra-text) !important;
	page-break-after: avoid;
	page-break-inside: avoid;
	font-weight: ${t.headingFontWeight} !important;
	line-height: ${t.headingLineHeight} !important;
	margin-bottom: ${t.headingMarginBottom}px !important;
	padding-bottom: ${t.headingPaddingBottom}px !important;
	margin-top: ${t.headingMarginTop}px !important;
}

.ra-render-frame h1 {
	font-family: ${t.h1FontFamily} !important;
	text-align: ${t.h1TextAlign} !important;
	font-size: ${t.h1Size}pt !important;
	font-weight: ${t.h1FontWeight === "normal" ? "normal" : "bold"} !important;
	margin-top: 0 !important;
}

.ra-render-frame h6 {
	font-family: ${t.h6FontFamily} !important;
	text-align: ${t.h6TextAlign} !important;
	font-size: ${t.h6Size}pt !important;
	font-weight: ${t.h6FontWeight === "normal" ? "normal" : "bold"} !important;
	margin-top: ${t.h6MarginTop}px !important;
}

.ra-render-frame h2 { font-size: ${t.h2Size}pt !important; }
.ra-render-frame h3 { font-size: ${t.h3Size}pt !important; }
.ra-render-frame h4 { font-size: ${t.h4Size}pt !important; }
.ra-render-frame h5 { font-size: ${t.h5Size}pt !important; }

.ra-render-frame del {
	font-family: var(--ra-font-body) !important;
	display: block !important;
	text-align: center !important;
	font-size: ${t.creditsFontSize}pt !important;
	text-decoration: none !important;
	margin-top: ${t.creditsMarginTop}px !important;
	padding-bottom: ${t.creditsPaddingBottom}px !important;
}

.ra-render-frame pre {
	background-color: ${t.preBackground} !important;
	border-style: ${t.preBorderStyle === "none" ? "none" : t.preBorderStyle} !important;
	border-radius: ${t.preBorderRadius}px !important;
	border-width: ${t.preBorderWidth} !important;
	border-color: ${t.preBorderColor} !important;
	line-height: ${t.preLineHeight} !important;
	white-space: ${t.preWhiteSpace} !important;
	overflow-wrap: ${t.preWhiteSpace === "pre-wrap" ? "anywhere" : "normal"} !important;
	page-break-inside: ${preBreak} !important;
}

.ra-render-frame code {
	font-family: var(--ra-font-mono) !important;
	font-size: ${t.codeFontSize}pt !important;
	color: ${t.codeInlineColor} !important;
}

.ra-render-frame mark {
	border-radius: 2px !important;
	padding: 0 0.12em !important;
	-webkit-print-color-adjust: exact !important;
	print-color-adjust: exact !important;
}

.ra-render-frame mjx-math {
	color: ${t.mathExportColor} !important;
	font-size: calc(${t.fontSizeBody}pt * ${t.mathInlineScalePercent} / 100) !important;
}

.ra-render-frame math-block mjx-math {
	font-size: calc(${t.fontSizeBody}pt * ${t.mathDisplayScalePercent} / 100) !important;
}

.ra-render-frame math-block {
	page-break-before: avoid !important;
	color: ${t.mathExportColor} !important;
}

.ra-render-frame svg,
.ra-render-frame img:not(.ra-math-export-img) {
	display: block !important;
	page-break-inside: avoid !important;
	page-break-after: avoid !important;
	margin: ${t.imageMarginTop}px ${t.imageMarginHorizontal} ${t.imageMarginBottom}px !important;
}

/* Raster math PNGs: do not force display:block on inline formulas (breaks line flow). */
.ra-render-frame img.ra-math-export-img--inline {
	display: inline-block !important;
	vertical-align: middle !important;
	margin: 0 0.1em !important;
	max-width: 100% !important;
	page-break-inside: avoid !important;
}

.ra-render-frame img.ra-math-export-img--display {
	display: block !important;
	margin: 0.75em auto !important;
	max-width: 100% !important;
	page-break-inside: avoid !important;
	page-break-after: avoid !important;
}

.ra-render-frame figcaption {
	font-family: var(--ra-font-body) !important;
	text-align: center;
	${captionStyle}
}

.ra-render-frame table,
.ra-render-frame pre {
	page-break-inside: ${tableBreak} !important;
}

.ra-render-frame table {
	font-family: ${t.tableFontFamily} !important;
	font-size: ${t.tableFontSize}pt !important;
	text-align: ${t.tableTextAlign} !important;
	margin: ${t.tableMarginTop}px auto ${t.tableMarginBottom}px !important;
	border-top: 1px solid ${t.tableBorderTopColor} !important;
	border-bottom: 1px solid ${t.tableBorderBottomColor} !important;
}

.ra-render-frame th {
	color: var(--ra-text) !important;
	font-weight: ${t.thFontWeight === "normal" ? "normal" : "bold"} !important;
	border: none !important;
	border-bottom: 1px solid ${t.thBorderBottomColor} !important;
	padding: ${t.tableCellPadding} !important;
}

.ra-render-frame td {
	border: none !important;
	padding: ${t.tableCellPadding} !important;
}

.ra-render-frame ul,
.ra-render-frame ol,
.ra-render-frame dl {
	page-break-before: avoid !important;
	font-family: var(--ra-font-body) !important;
	font-size: ${t.listFontSize}pt !important;
	line-height: ${t.listLineHeight} !important;
	margin-top: 0 !important;
	padding-top: 0 !important;
}

${listBulletCss}

.ra-render-frame hr {
	border: none !important;
	border-top: 0 solid lightgray !important;
	page-break-after: ${hrBreak} !important;
}

.ra-render-frame blockquote:not(.callout) {
	display: block !important;
	text-align: ${t.blockquoteTextAlign} !important;
	font-size: ${t.blockquoteFontSize}pt !important;
	color: var(--ra-text) !important;
	border: none !important;
	padding: 0 !important;
	margin: ${t.blockquoteMarginY}px auto !important;
}

${calloutCss}

.ra-render-frame .mermaid {
	color: ${t.mermaidColor} !important;
}

.ra-cover-page {
	position: relative;
	min-height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
}

.ra-cover-bg {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: ${t.coverBackgroundOpacity};
}

.ra-cover-content {
	position: relative;
	z-index: 1;
}

.ra-cover-title {
	font-size: ${t.h1Size}pt;
	margin-bottom: 8px;
}

.ra-cover-subtitle {
	font-size: ${t.h3Size}pt;
	margin-bottom: 6px;
}

.ra-cover-authors {
	font-size: ${t.fontSizeBody}pt;
}

${numberingCss}
${backgroundCss}

@media print {
	@page {
		size: ${pageSize.width} ${pageSize.height};
		margin: var(--ra-page-margin-top) var(--ra-page-margin-right) var(--ra-page-margin-bottom) var(--ra-page-margin-left);
	}
	body {
		color: var(--ra-text) !important;
	}
	.ra-page-break {
		page-break-after: always;
	}
}
`.trim();
	}

	private buildHeadingNumberingCss(mode: HeadingNumberingMode): string {
		/** Match academic CSS: dot, space, then NBSP after section numbers */
		const nbsp = "\u00A0";
		const tail = `". ${nbsp}"`;
		if (mode === "none") return "";
		if (mode === "h2-h4") {
			return `
.ra-render-frame { counter-reset: h2counter h3counter h4counter; }
.ra-render-frame h2 { counter-increment: h2counter; counter-reset: h3counter; }
.ra-render-frame h2::before { content: counter(h2counter) ${tail}; }
.ra-render-frame h3 { counter-increment: h3counter; counter-reset: h4counter; }
.ra-render-frame h3::before { content: counter(h2counter) "." counter(h3counter) ${tail}; }
.ra-render-frame h4 { counter-increment: h4counter; }
.ra-render-frame h4::before { content: counter(h2counter) "." counter(h3counter) "." counter(h4counter) ${tail}; }
`.trim();
		}
		return `
.ra-render-frame { counter-reset: h1counter h2counter h3counter h4counter h5counter h6counter; }
.ra-render-frame h1 { counter-increment: h1counter; counter-reset: h2counter; }
.ra-render-frame h1::before { content: counter(h1counter) ${tail}; }
.ra-render-frame h2 { counter-increment: h2counter; counter-reset: h3counter; }
.ra-render-frame h2::before { content: counter(h1counter) "." counter(h2counter) ${tail}; }
.ra-render-frame h3 { counter-increment: h3counter; counter-reset: h4counter; }
.ra-render-frame h3::before { content: counter(h1counter) "." counter(h2counter) "." counter(h3counter) ${tail}; }
.ra-render-frame h4 { counter-increment: h4counter; counter-reset: h5counter; }
.ra-render-frame h4::before { content: counter(h1counter) "." counter(h2counter) "." counter(h3counter) "." counter(h4counter) ${tail}; }
.ra-render-frame h5 { counter-increment: h5counter; counter-reset: h6counter; }
.ra-render-frame h5::before { content: counter(h1counter) "." counter(h2counter) "." counter(h3counter) "." counter(h4counter) "." counter(h5counter) ${tail}; }
.ra-render-frame h6 { counter-increment: h6counter; }
.ra-render-frame h6::before { content: counter(h1counter) "." counter(h2counter) "." counter(h3counter) "." counter(h4counter) "." counter(h5counter) "." counter(h6counter) ${tail}; }
`.trim();
	}

	private buildBackgroundCss(project: ReportProject): string {
		if (!project.backgroundImage?.assetPath) return "";
		return `
.ra-render-frame {
	position: relative;
}
.ra-render-frame::before {
	content: "";
	position: fixed;
	inset: 0;
	z-index: -1;
	background-image: url("${project.backgroundImage.assetPath}");
	background-position: center center;
	background-size: ${project.backgroundImage.fitMode === "repeat" ? "auto" : project.backgroundImage.fitMode};
	background-repeat: ${project.backgroundImage.fitMode === "repeat" ? "repeat" : "no-repeat"};
	opacity: ${project.backgroundImage.opacity};
}
`.trim();
	}

	/**
	 * Obsidian callouts render as `.callout[data-callout="type"]` but export HTML does not include
	 * app.css — we mirror default theme colors and borders so print/PDF preview shows colored boxes.
	 */
	private buildCalloutCss(t: StyleTokens): string {
		const noteRgb = CALLOUT_TYPE_RGB.note ?? "68, 138, 255";
		const perType = Object.entries(CALLOUT_TYPE_RGB)
			.map(
				([k, v]) => `.ra-render-frame .callout[data-callout="${k}"] { --ra-callout-color: ${v}; }`,
			)
			.join("\n");

		const sf = Math.max(0, Math.min(1, t.calloutSurfaceOpacity));
		const ff = Math.max(0, Math.min(1, t.calloutFrameBorderOpacity));
		const tb = Math.max(0, Math.min(1, t.calloutTitleBarOpacity));
		const ts = Math.max(0, Math.min(1, t.calloutTitleSeparatorOpacity));

		return `
${perType}

.ra-render-frame .callout {
	--ra-callout-color: ${noteRgb};
	background-color: rgba(var(--ra-callout-color), ${sf}) !important;
	border: 1px solid rgba(var(--ra-callout-color), ${ff}) !important;
	border-left: ${t.calloutBorderLeftWidthPx}px solid rgb(var(--ra-callout-color)) !important;
	border-radius: ${t.calloutBorderRadiusPx}px !important;
	padding: 0 !important;
	margin: ${t.calloutVerticalMarginPx}px 0 !important;
	overflow: hidden !important;
	color: var(--ra-text) !important;
	-webkit-print-color-adjust: exact !important;
	print-color-adjust: exact !important;
}

.ra-render-frame .callout .callout-title {
	display: flex !important;
	align-items: center !important;
	gap: ${t.calloutTitleGapPx}px !important;
	padding: ${t.calloutTitlePaddingCss} !important;
	font-weight: 600 !important;
	font-size: ${t.calloutTitleFontScale}em !important;
	text-transform: uppercase !important;
	letter-spacing: ${t.calloutTitleLetterSpacingEm}em !important;
	color: rgb(var(--ra-callout-color)) !important;
	background-color: rgba(var(--ra-callout-color), ${tb}) !important;
	border-bottom: 1px solid rgba(var(--ra-callout-color), ${ts}) !important;
}

.ra-render-frame .callout .callout-title-inner {
	flex: 1 !important;
}

.ra-render-frame .callout .callout-icon {
	flex-shrink: 0 !important;
	width: 1.1em !important;
	height: 1.1em !important;
	opacity: ${t.calloutIconOpacity} !important;
}

.ra-render-frame .callout .callout-icon svg {
	width: 100% !important;
	height: 100% !important;
}

.ra-render-frame .callout .callout-content {
	padding: ${t.calloutContentPaddingCss} !important;
	font-size: var(--ra-body-size) !important;
}

.ra-render-frame .callout .callout-content > :first-child {
	margin-top: 0 !important;
}

.ra-render-frame .callout .callout-content > :last-child {
	margin-bottom: 0 !important;
}

.ra-render-frame .callout .callout-content p {
	text-align: inherit !important;
}
`.trim();
	}
}
