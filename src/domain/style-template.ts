export type HeadingNumberingMode = "none" | "h2-h4" | "h1-h6";
export type BackgroundFitMode = "cover" | "contain" | "repeat";
export type BackgroundApplyTo = "cover" | "body" | "both";
export type TextAlignOption = "left" | "center" | "right" | "justify";
/** How fenced code blocks wrap in PDF/HTML export */
export type PreWhiteSpaceMode = "pre-wrap" | "pre";

/**
 * Visual tokens aligned with Obsidian-academic-export academic-pdf-export.css
 * (body, links, headings, code, math, figures, tables, lists, hr, blockquote, mermaid).
 */
export interface StyleTokens {
	/* --- Core fonts & body (original: p, body) --- */
	fontBody: string;
	fontHeading: string;
	fontMono: string;
	fontSizeBody: number;
	lineHeightBody: number;
	colorText: string;
	colorMuted: string;
	colorAccent: string;
	tabSize: number;
	paragraphTextAlign: TextAlignOption;
	paragraphSpacing: number;
	sectionSpacing: number;
	pageMarginTop: string;
	pageMarginRight: string;
	pageMarginBottom: string;
	pageMarginLeft: string;
	pageBackgroundColor: string;

	/* --- Links --- */
	linkColor: string;
	linkUnderline: boolean;

	/* --- Emphasis --- */
	strongColor: string;
	emColor: string;

	/* --- Headings (shared) --- */
	headingLineHeight: number;
	headingFontWeight: number;
	headingMarginTop: number;
	headingMarginBottom: number;
	headingPaddingBottom: number;
	h1Size: number;
	h2Size: number;
	h3Size: number;
	h4Size: number;
	h5Size: number;
	h6Size: number;
	h1FontFamily: string;
	h1TextAlign: TextAlignOption;
	h1FontWeight: "normal" | "bold";
	h6FontFamily: string;
	h6TextAlign: TextAlignOption;
	h6FontWeight: "normal" | "bold";
	h6MarginTop: number;

	/* --- Credits block (original: del) --- */
	creditsFontSize: number;
	creditsMarginTop: number;
	creditsPaddingBottom: number;

	/* --- Code & pre --- */
	codeBlockBackground: string;
	codeNormalColor: string;
	codeInlineColor: string;
	codeFontSize: number;
	preBackground: string;
	preBorderStyle: "dashed" | "solid" | "none";
	preBorderWidth: string;
	preBorderColor: string;
	preBorderRadius: number;
	preLineHeight: number;
	/** Fenced code: wrap long lines vs strict pre (horizontal scroll in browser/PDF) */
	preWhiteSpace: PreWhiteSpaceMode;

	/* --- Callouts (PDF/HTML + DOCX box styling) --- */
	/** Left accent bar width in px */
	calloutBorderLeftWidthPx: number;
	calloutBorderRadiusPx: number;
	/** 0–1 opacity of tinted background */
	calloutSurfaceOpacity: number;
	/** 0–1 opacity for outer border color mix */
	calloutFrameBorderOpacity: number;
	/** Title bar background mix */
	calloutTitleBarOpacity: number;
	/** Separator under title bar */
	calloutTitleSeparatorOpacity: number;
	calloutVerticalMarginPx: number;
	calloutTitlePaddingCss: string;
	calloutContentPaddingCss: string;
	/** Title font size as fraction of body (em) */
	calloutTitleFontScale: number;
	calloutTitleLetterSpacingEm: number;
	calloutTitleGapPx: number;
	calloutIconOpacity: number;
	/** Inner padding for DOCX callout cell (pt); approximates CSS padding */
	calloutCellPaddingPt: number;
	/** 0–1 mix toward accent for DOCX outer border (non-accent edges) */
	calloutDocxFrameBorderMix: number;

	/* --- Math --- */
	mathScalePercent: number;

	/* --- Figures --- */
	imageMarginTop: number;
	imageMarginBottom: number;
	imageMarginHorizontal: string;
	captionFontSize: number;
	captionMarginBottom: number;

	/* --- Tables --- */
	tableFontFamily: string;
	tableFontSize: number;
	tableTextAlign: TextAlignOption;
	tableMarginTop: number;
	tableMarginBottom: number;
	tableBorderTopColor: string;
	tableBorderBottomColor: string;
	thBorderBottomColor: string;
	thFontWeight: "normal" | "bold";
	tableCellPadding: string;

	/* --- Lists --- */
	listFontSize: number;
	listLineHeight: number;
	listCustomBullet: boolean;
	listBulletChar: string;
	listBulletOffset: string;
	listBulletTopOffset: string;
	listIndentPerLevel: number;

	/* --- Blockquote --- */
	blockquoteTextAlign: TextAlignOption;
	blockquoteFontSize: number;
	blockquoteMarginY: number;

	/* --- Mermaid --- */
	mermaidColor: string;

	/* --- Cover and DOCX spacing --- */
	coverBackgroundOpacity: number;
	codeBlockSpacingBefore: number;
	codeBlockSpacingAfter: number;
}

export interface PrintRules {
	headingNumbering: HeadingNumberingMode;
	widowOrphanControl: boolean;
	tableBreakBehavior: "avoid" | "auto";
	imageCaptionStyle: "centered-small" | "plain";
	/** Match academic CSS: "---" hr forces a page break when true */
	hrAsPageBreak: boolean;
	prePageBreakInside: "avoid" | "auto";
}

export interface StyleTemplate {
	id: string;
	name: string;
	version: number;
	basePreset: "academic-export-v1" | "custom";
	tokens: StyleTokens;
	printRules: PrintRules;
}

export interface BackgroundImageConfig {
	assetPath: string;
	opacity: number;
	fitMode: BackgroundFitMode;
	applyTo: BackgroundApplyTo;
}

/** Full defaults matching academic-pdf-export.css */
export const DEFAULT_STYLE_TOKENS: StyleTokens = {
	fontBody: '"Latin Modern Roman", "Times New Roman", serif',
	fontHeading: '"Latin Modern Roman", "Times New Roman", serif',
	fontMono: '"Latin Modern Mono", Consolas, monospace',
	fontSizeBody: 10,
	lineHeightBody: 1.2,
	colorText: "#000000",
	colorMuted: "#333333",
	colorAccent: "#111111",
	tabSize: 4,
	paragraphTextAlign: "justify",
	paragraphSpacing: 5,
	sectionSpacing: 20,
	pageMarginTop: "2cm",
	pageMarginRight: "2cm",
	pageMarginBottom: "2cm",
	pageMarginLeft: "2cm",
	pageBackgroundColor: "#ffffff",

	linkColor: "#000000",
	linkUnderline: false,

	strongColor: "#000000",
	emColor: "#000000",

	headingLineHeight: 1,
	headingFontWeight: 700,
	headingMarginTop: 20,
	headingMarginBottom: 0,
	headingPaddingBottom: 0,
	h1Size: 18,
	h2Size: 12,
	h3Size: 12,
	h4Size: 12,
	h5Size: 11,
	h6Size: 11,
	h1FontFamily: '"Latin Modern Roman Caps", "Times New Roman", serif',
	h1TextAlign: "center",
	h1FontWeight: "normal",
	h6FontFamily: '"Latin Modern Roman Caps", "Times New Roman", serif',
	h6TextAlign: "center",
	h6FontWeight: "normal",
	h6MarginTop: 6,

	creditsFontSize: 10,
	creditsMarginTop: 8,
	creditsPaddingBottom: 10,

	codeBlockBackground: "#ffffff",
	codeNormalColor: "#000000",
	codeInlineColor: "#292929",
	codeFontSize: 10,
	preBackground: "#ffffff",
	preBorderStyle: "dashed",
	preBorderWidth: "1px 0",
	preBorderColor: "#a9a9a9",
	preBorderRadius: 0,
	preLineHeight: 1,
	preWhiteSpace: "pre-wrap",

	calloutBorderLeftWidthPx: 4,
	calloutBorderRadiusPx: 6,
	calloutSurfaceOpacity: 0.12,
	calloutFrameBorderOpacity: 0.35,
	calloutTitleBarOpacity: 0.1,
	calloutTitleSeparatorOpacity: 0.22,
	calloutVerticalMarginPx: 16,
	calloutTitlePaddingCss: "8px 14px",
	calloutContentPaddingCss: "10px 14px 12px",
	calloutTitleFontScale: 0.82,
	calloutTitleLetterSpacingEm: 0.04,
	calloutTitleGapPx: 8,
	calloutIconOpacity: 0.85,
	calloutCellPaddingPt: 8,
	calloutDocxFrameBorderMix: 0.35,

	mathScalePercent: 90,

	imageMarginTop: 10,
	imageMarginBottom: 5,
	imageMarginHorizontal: "auto",
	captionFontSize: 8,
	captionMarginBottom: 16,

	tableFontFamily: "Times, serif",
	tableFontSize: 10,
	tableTextAlign: "center",
	tableMarginTop: 10,
	tableMarginBottom: 5,
	tableBorderTopColor: "#292929",
	tableBorderBottomColor: "#292929",
	thBorderBottomColor: "#a9a9a9",
	thFontWeight: "normal",
	tableCellPadding: "2px 5px",

	listFontSize: 11,
	listLineHeight: 1.1,
	listCustomBullet: true,
	listBulletChar: "\u2022",
	listBulletOffset: "-1.15em",
	listBulletTopOffset: "-0.05em",
	listIndentPerLevel: 14,

	blockquoteTextAlign: "center",
	blockquoteFontSize: 10,
	blockquoteMarginY: 5,

	mermaidColor: "#000000",

	coverBackgroundOpacity: 0.2,
	codeBlockSpacingBefore: 6,
	codeBlockSpacingAfter: 6,
};

export const DEFAULT_PRINT_RULES: PrintRules = {
	headingNumbering: "h2-h4",
	widowOrphanControl: true,
	tableBreakBehavior: "avoid",
	imageCaptionStyle: "centered-small",
	hrAsPageBreak: true,
	prePageBreakInside: "avoid",
};

export function mergeStyleTokens(partial: Partial<StyleTokens>): StyleTokens {
	return { ...DEFAULT_STYLE_TOKENS, ...partial };
}

export function mergePrintRules(partial: Partial<PrintRules>): PrintRules {
	return { ...DEFAULT_PRINT_RULES, ...partial };
}

export function normalizeStyleTemplate(template: StyleTemplate): StyleTemplate {
	return {
		...template,
		tokens: mergeStyleTokens(template.tokens),
		printRules: mergePrintRules(template.printRules),
	};
}

export function createAcademicExportTemplate(): StyleTemplate {
	return {
		id: "academic-export-v1",
		name: "Academic export v1",
		version: 3,
		basePreset: "academic-export-v1",
		tokens: { ...DEFAULT_STYLE_TOKENS },
		printRules: { ...DEFAULT_PRINT_RULES },
	};
}
