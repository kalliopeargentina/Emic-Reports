export type HeadingNumberingMode = "none" | "h2-h4" | "h1-h6";
export type BackgroundFitMode = "cover" | "contain" | "repeat";
export type BackgroundApplyTo = "cover" | "body" | "both";

export interface StyleTokens {
	fontBody: string;
	fontHeading: string;
	fontMono: string;
	fontSizeBody: number;
	lineHeightBody: number;
	colorText: string;
	colorMuted: string;
	colorAccent: string;
	h1Size: number;
	h2Size: number;
	h3Size: number;
	h4Size: number;
	h5Size: number;
	h6Size: number;
	paragraphSpacing: number;
	sectionSpacing: number;
	pageMarginTop: string;
	pageMarginRight: string;
	pageMarginBottom: string;
	pageMarginLeft: string;
}

export interface PrintRules {
	headingNumbering: HeadingNumberingMode;
	widowOrphanControl: boolean;
	tableBreakBehavior: "avoid" | "auto";
	imageCaptionStyle: "centered-small" | "plain";
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

export function createAcademicExportTemplate(): StyleTemplate {
	return {
		id: "academic-export-v1",
		name: "Academic export v1",
		version: 1,
		basePreset: "academic-export-v1",
		tokens: {
			fontBody: "\"Latin Modern Roman\", \"Times New Roman\", serif",
			fontHeading: "\"Latin Modern Roman\", \"Times New Roman\", serif",
			fontMono: "\"Latin Modern Mono\", Consolas, monospace",
			fontSizeBody: 10,
			lineHeightBody: 1.2,
			colorText: "#000000",
			colorMuted: "#333333",
			colorAccent: "#111111",
			h1Size: 18,
			h2Size: 12,
			h3Size: 12,
			h4Size: 12,
			h5Size: 11,
			h6Size: 11,
			paragraphSpacing: 5,
			sectionSpacing: 20,
			pageMarginTop: "2cm",
			pageMarginRight: "2cm",
			pageMarginBottom: "2cm",
			pageMarginLeft: "2cm",
		},
		printRules: {
			headingNumbering: "h2-h4",
			widowOrphanControl: true,
			tableBreakBehavior: "avoid",
			imageCaptionStyle: "centered-small",
		},
	};
}
