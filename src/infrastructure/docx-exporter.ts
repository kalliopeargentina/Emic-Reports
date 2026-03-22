import {
	AlignmentType,
	BorderStyle,
	Document,
	ExternalHyperlink,
	HeadingLevel,
	HorizontalPositionAlign,
	HorizontalPositionRelativeFrom,
	ImageRun,
	LevelFormat,
	Packer,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableRow,
	TextRun,
	TextWrappingSide,
	TextWrappingType,
	VerticalPositionAlign,
	VerticalPositionRelativeFrom,
	WidthType,
} from "docx";
import { TFile, requestUrl, type App, type Component } from "obsidian";
import { CALLOUT_TYPE_RGB } from "../domain/callout-palette";
import {
	CALLOUT_NEST_MAX_DEPTH,
	countQuoteDepth,
	parseCalloutStartLine,
	stripQuoteLevels,
} from "./callout-markdown";
import { getPrimaryMarkdownSourcePath, type ReportProject } from "../domain/report-project";
import { mergePrintRules, mergeStyleTokens, type StyleTokens } from "../domain/style-template";
import {
	defaultHighlightCssToDocxFill,
	highlightCssToDocxFill,
	normalizeHighlightColorToken,
	segmentHighlightSyntax,
} from "./highlight-export";
import {
	contiguousUint8Array,
	diagramPngDimsLabel,
	isAcceptableDiagramPng,
	isAcceptableDiagramPngRelaxed,
	isAcceptableMathPng,
	pngIhdrSize,
} from "./binary-image";
import {
	isEmicChartsCanvasFenceLanguage,
	isPluginDiagramFenceLanguage,
	parseFenceOpenerLang,
	renderPluginFenceToPng,
	renderPluginFenceToSvg,
} from "./plugin-diagram-render";
import { rasterizeSvgWithResvg } from "./resvg-rasterizer";
import { normalizeMermaidSvgForRaster } from "./mermaid-svg-normalize";
import { highlightCodeToDocxRuns } from "./docx-code-highlight";
import { DocxMathRasterSession } from "./docx-math-raster-session";
import { docxMathImageTransformationPx } from "./math-export-sizing";

type DocxBlock = Paragraph | Table;
type NumberingLevelConfig = {
	level: number;
	format: (typeof LevelFormat)[keyof typeof LevelFormat];
	text: string;
	alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
	style: {
		paragraph: {
			indent: {
				left: number;
				hanging: number;
			};
		};
	};
};
type NumberingConfig = {
	reference: string;
	levels: NumberingLevelConfig[];
};

const SVG_FALLBACK_1PX_PNG = new Uint8Array([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8,
	6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 96, 0, 0, 0, 2, 0,
	1, 226, 33, 188, 51, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

/** Test switch: for diagnosing Word SVG behavior, avoid PNG diagram render fallbacks. */
const DOCX_SVG_ONLY_TEST = false;
const DOCX_DIAGRAM_RENDER_WIDTH_PX = 560;

function summarizeSvgFeatures(svgBytes: Uint8Array): string {
	try {
		const xml = new TextDecoder().decode(svgBytes);
		const hasForeignObject = xml.includes("<foreignObject");
		const hasSvgText = xml.includes("<text");
		const hasTSpan = xml.includes("<tspan");
		const hasCssVar = xml.includes("var(");
		const hasStyleTag = xml.includes("<style");
		return `foreignObject=${hasForeignObject} text=${hasSvgText} tspan=${hasTSpan} cssVar=${hasCssVar} styleTag=${hasStyleTag}`;
	} catch {
		return "decode-error";
	}
}

/**
 * Split Markdown image destination into URL/path and optional quoted title
 * (e.g. `Attachments/x.jpg "546|372x269"` from {@link LinkResolver} wikilink images).
 */
function parseMarkdownImageDestination(raw: string): { path: string; title?: string } {
	const s = raw.trim();
	if (!s) return { path: "" };

	if (s.startsWith("<") && s.endsWith(">")) {
		return { path: s.slice(1, -1).trim() };
	}

	const dquote = /\s+"([^"]*)"\s*$/.exec(s);
	if (dquote) {
		return {
			path: s.slice(0, dquote.index).trim(),
			title: dquote[1]?.trim() ?? "",
		};
	}

	const squote = /\s+'([^']*)'\s*$/.exec(s);
	if (squote) {
		return {
			path: s.slice(0, squote.index).trim(),
			title: squote[1]?.trim() ?? "",
		};
	}

	return { path: s };
}

function decodeUriSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** Display size (px) for DOCX {@link ImageRun} from alt text or Markdown title (Obsidian wikilink size). */
function docxImageDisplaySizePx(alt: string, title?: string): { width: number; height: number } {
	const a = alt.trim();
	let m = /(\d{2,4})x(\d{2,4})$/.exec(a);
	if (m) {
		return { width: Number(m[1]), height: Number(m[2]) };
	}
	const t = title?.trim() ?? "";
	m = /^\d+\|(\d+)x(\d+)$/.exec(t);
	if (m) {
		return { width: Number(m[1]), height: Number(m[2]) };
	}
	m = /(\d{2,4})x(\d{2,4})/.exec(t);
	if (m) {
		return { width: Number(m[1]), height: Number(m[2]) };
	}
	return { width: 560, height: 320 };
}

/** Rough intrinsic pixel size for rasterizing SVG (viewBox / width / height). */
function svgIntrinsicDimensionsFromMarkup(svgBytes: Uint8Array): { w: number; h: number } {
	const head = new TextDecoder("utf-8").decode(svgBytes.slice(0, Math.min(svgBytes.byteLength, 16384)));
	const vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(head);
	if (vb) {
		const parts = (vb[1] ?? "").trim().split(/\s+/).filter(Boolean);
		if (parts.length >= 4) {
			const w = Math.abs(Number(parts[2]));
			const h = Math.abs(Number(parts[3]));
			if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
				return { w: Math.round(w), h: Math.round(h) };
			}
		}
	}
	const wm = /\bwidth\s*=\s*["']([^"'%]+)/i.exec(head);
	const hm = /\bheight\s*=\s*["']([^"'%]+)/i.exec(head);
	let w = wm ? parseFloat(wm[1] ?? "") : NaN;
	let h = hm ? parseFloat(hm[1] ?? "") : NaN;
	if (!Number.isFinite(w) || w <= 0) w = 512;
	if (!Number.isFinite(h) || h <= 0) h = 512;
	return { w: Math.round(w), h: Math.round(h) };
}

function parseRgbTriplet(rgb: string): [number, number, number] {
	const parts = rgb.split(",").map((p) => Number(p.trim()));
	const r = parts[0] ?? 68;
	const g = parts[1] ?? 138;
	const b = parts[2] ?? 255;
	return [r, g, b];
}

function rgbToDocxHex(r: number, g: number, b: number): string {
	return [r, g, b]
		.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();
}

function calloutFillHex(accentRgb: string, surfaceOpacity: number): string {
	const [r, g, b] = parseRgbTriplet(accentRgb);
	const t = Math.max(0, Math.min(1, surfaceOpacity));
	const mix = (c: number) => Math.round(255 * (1 - t) + c * t);
	return rgbToDocxHex(mix(r), mix(g), mix(b));
}

function calloutBorderHex(accentRgb: string, mixTowardAccent: number): string {
	const [r, g, b] = parseRgbTriplet(accentRgb);
	const t = Math.max(0, Math.min(1, mixTowardAccent));
	const mix = (c: number) => Math.round(255 * (1 - t) + c * t);
	return rgbToDocxHex(mix(r), mix(g), mix(b));
}

export class DocxExporter {
	constructor(
		private app: App,
		private component: Component,
	) {}

	async export(project: ReportProject, markdown: string, outputPath: string): Promise<void> {
		const tokens = mergeStyleTokens(project.styleTemplate.tokens);
		const printRules = mergePrintRules(project.styleTemplate.printRules);
		const sourcePath = getPrimaryMarkdownSourcePath(project);
		const mathSession = new DocxMathRasterSession(this.app, this.component, sourcePath, tokens);
		const blocks = await this.markdownToBlocks(
			markdown,
			project,
			tokens,
			printRules.headingNumbering,
			mathSession,
		);
		const margins = this.resolveMargins(tokens);
		const doc = new Document({
			numbering: {
				config: this.buildNumbering(tokens) as unknown as NumberingConfig[],
			},
			sections: [
				{
					properties: {
						page: {
							margin: margins,
						},
					},
					children: blocks,
				},
			],
		});
		const buffer = await Packer.toBuffer(doc);
		const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		await this.app.vault.adapter.writeBinary(outputPath, arrayBuffer);
	}

	private async markdownToBlocks(
		markdown: string,
		project: ReportProject,
		tokens: StyleTokens,
		headingNumbering: "none" | "h2-h4" | "h1-h6",
		mathSession: DocxMathRasterSession,
	): Promise<DocxBlock[]> {
		const lines = markdown.split("\n");
		const output: DocxBlock[] = [];
		const headingCounters = [0, 0, 0, 0, 0, 0];
		let inCodeBlock = false;
		let codeFenceLang = "";
		const codeLines: string[] = [];
		let inDisplayMath = false;
		const displayMathLines: string[] = [];
		let index = 0;
		while (index < lines.length) {
			const line = lines[index] ?? "";
			const trimmed = line.trim();

			const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
			if (!inCodeBlock && imageMatch) {
				const image = await this.createImageParagraph(
					imageMatch[2] ?? "",
					imageMatch[1] ?? "",
					tokens,
				);
				output.push(image);
				index += 1;
				continue;
			}

			if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
				if (inCodeBlock) {
					output.push(
						await this.finishFencedBlock(codeLines, codeFenceLang, project, tokens),
					);
					codeLines.length = 0;
					codeFenceLang = "";
					inCodeBlock = false;
				} else {
					inCodeBlock = true;
					codeFenceLang = parseFenceOpenerLang(trimmed);
				}
				index += 1;
				continue;
			}

			if (inCodeBlock) {
				codeLines.push(line);
				index += 1;
				continue;
			}

			if (inDisplayMath) {
				if (trimmed === "$$") {
					const tex = displayMathLines.join("\n");
					displayMathLines.length = 0;
					inDisplayMath = false;
					const png = await mathSession.getOrRenderDisplay(tex);
					if (png && isAcceptableMathPng(png)) {
						// eslint-disable-next-line no-console
						console.info("[DOCX-export] display math PNG bytes=%d", png.byteLength);
						output.push(this.createMathPngParagraph(png, tokens));
					} else {
						output.push(
							new Paragraph({
								children: [
									new TextRun({
										text: `$$\n${tex}\n$$`,
										color: this.toDocxColor(tokens.colorText),
										font: tokens.fontBody,
										size: this.ptToHalfPoint(tokens.fontSizeBody),
									}),
								],
								spacing: { before: this.ptToTwips(tokens.paragraphSpacing) },
							}),
						);
					}
				} else {
					displayMathLines.push(line);
				}
				index += 1;
				continue;
			}

			if (trimmed.startsWith("$$")) {
				if (trimmed === "$$") {
					inDisplayMath = true;
					displayMathLines.length = 0;
					index += 1;
					continue;
				}
				if (trimmed.endsWith("$$") && trimmed.length > 4) {
					const inner = trimmed.slice(2, -2).trim();
					const png = await mathSession.getOrRenderDisplay(inner);
					if (png && isAcceptableMathPng(png)) {
						// eslint-disable-next-line no-console
						console.info("[DOCX-export] display math PNG (single-line fence) bytes=%d", png.byteLength);
						output.push(this.createMathPngParagraph(png, tokens));
					} else {
						output.push(
							new Paragraph({
								children: [
									new TextRun({
										text: trimmed,
										color: this.toDocxColor(tokens.colorText),
										font: tokens.fontBody,
										size: this.ptToHalfPoint(tokens.fontSizeBody),
									}),
								],
								spacing: { before: this.ptToTwips(tokens.paragraphSpacing) },
							}),
						);
					}
					index += 1;
					continue;
				}
				inDisplayMath = true;
				displayMathLines.length = 0;
				displayMathLines.push(trimmed.slice(2));
				index += 1;
				continue;
			}

			if (!trimmed) {
				output.push(new Paragraph({ children: [new TextRun("")] }));
				index += 1;
				continue;
			}

			if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
				output.push(new Paragraph({ pageBreakBefore: true }));
				index += 1;
				continue;
			}

			const table = await this.tryParseTableAsync(lines, index, tokens, mathSession);
			if (table) {
				output.push(table.table);
				index = table.nextIndex;
				continue;
			}

			const callout = await this.tryParseCalloutAsync(lines, index, tokens, mathSession);
			if (callout) {
				output.push(callout.table);
				index = callout.nextIndex;
				continue;
			}

			const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
			if (headingMatch) {
				const marker = headingMatch[1] ?? "#";
				const headingText = headingMatch[2] ?? trimmed;
				const level = marker.length;
				const numberedText = this.applyHeadingNumbering(
					headingText,
					level,
					headingCounters,
					headingNumbering,
				);
				output.push(
					new Paragraph({
						children: [
							new TextRun({
								text: numberedText,
								color: this.toDocxColor(tokens.colorText),
								font: level === 1 ? tokens.h1FontFamily : tokens.fontHeading,
								size: this.ptToHalfPoint(this.getHeadingSize(level, tokens)),
								bold:
									level === 1
										? tokens.h1FontWeight === "bold"
										: tokens.headingFontWeight >= 700,
							}),
						],
						heading: this.toHeadingLevel(level),
						alignment: this.toAlignment(level === 1 ? tokens.h1TextAlign : "left"),
						spacing: {
							before: this.ptToTwips(tokens.headingMarginTop),
							after: this.ptToTwips(tokens.headingMarginBottom),
						},
					}),
				);
				index += 1;
				continue;
			}

			const quoteMatch = /^>\s?(.+)$/.exec(trimmed);
			if (quoteMatch) {
				const quoteText = quoteMatch[1] ?? "";
				output.push(
					new Paragraph({
						children: await this.inlineRunsAsync(quoteText, tokens, mathSession),
						alignment: this.toAlignment(tokens.blockquoteTextAlign),
						spacing: {
							before: this.ptToTwips(tokens.blockquoteMarginY),
							after: this.ptToTwips(tokens.blockquoteMarginY),
						},
					}),
				);
				index += 1;
				continue;
			}

			const listMatch = /^(\s*)([-*+]|\d+\.)\s+(.+)$/.exec(line);
			if (listMatch) {
				const marker = listMatch[2] ?? "-";
				const listTextRaw = listMatch[3] ?? "";
				const taskMatch = /^\[( |x|X)\]\s+(.+)$/.exec(listTextRaw);
				const listText = taskMatch ? `${taskMatch[1]?.toLowerCase() === "x" ? "\u2611" : "\u2610"} ${taskMatch[2] ?? ""}` : listTextRaw;
				const indent = Math.floor((listMatch[1]?.length ?? 0) / 2);
				const isOrdered = /^\d+\.$/.test(marker);
				output.push(
					new Paragraph({
						children: await this.inlineRunsAsync(listText, tokens, mathSession),
						alignment: this.toAlignment("left"),
						numbering: {
							reference: isOrdered ? "ra-ordered" : "ra-bullet",
							level: Math.min(5, Math.max(0, indent)),
						},
					}),
				);
				index += 1;
				continue;
			}

			output.push(
				new Paragraph({
					children: await this.inlineRunsAsync(trimmed, tokens, mathSession),
					alignment: this.toAlignment(tokens.paragraphTextAlign),
					spacing: {
						before: this.ptToTwips(tokens.paragraphSpacing),
					},
				}),
			);
			index += 1;
		}

		if (inDisplayMath) {
			output.push(
				new Paragraph({
					children: [
						new TextRun({
							text: `$$\n${displayMathLines.join("\n")}`,
							color: this.toDocxColor(tokens.colorText),
							font: tokens.fontBody,
							size: this.ptToHalfPoint(tokens.fontSizeBody),
						}),
					],
					spacing: { before: this.ptToTwips(tokens.paragraphSpacing) },
				}),
			);
		}

		if (inCodeBlock) {
			output.push(await this.finishFencedBlock(codeLines, codeFenceLang, project, tokens));
		}

		return output;
	}

	/** Rasterize plugin diagram fence to PNG and embed; returns null if not acceptable or failed. */
	private async embedDiagramFenceAsPng(
		codeFenceLang: string,
		body: string,
		project: ReportProject,
		tokens: StyleTokens,
		logIntro: string,
	): Promise<Paragraph | null> {
		const sourcePath = getPrimaryMarkdownSourcePath(project);
		try {
			// eslint-disable-next-line no-console
			console.info(logIntro, codeFenceLang);
			/** Match HTML preview width so canvas charts layout like Reading view; DOCX scales display. */
			const png = await renderPluginFenceToPng(
				this.app,
				this.component,
				codeFenceLang,
				body,
				sourcePath,
				900,
			);
			if (png && isAcceptableDiagramPngRelaxed(png)) {
				// eslint-disable-next-line no-console
				console.info(
					"[DOCX-export] PNG embedded bytes=%d dims=%s",
					png.byteLength,
					diagramPngDimsLabel(png),
				);
				return await this.createDiagramPngParagraph(png, tokens);
			}
			if (png && png.byteLength > 0) {
				// eslint-disable-next-line no-console
				console.info(
					"[DOCX-export] PNG rejected for DOCX embed bytes=%d dims=%s strict=%s relaxed=%s",
					png.byteLength,
					diagramPngDimsLabel(png),
					String(isAcceptableDiagramPng(png)),
					String(isAcceptableDiagramPngRelaxed(png)),
				);
			} else {
				// eslint-disable-next-line no-console
				console.info("[DOCX-export] PNG null or empty for lang=%s", codeFenceLang);
			}
		} catch {
			/* raster failed */
		}
		return null;
	}

	private async finishFencedBlock(
		codeLines: string[],
		codeFenceLang: string,
		project: ReportProject,
		tokens: StyleTokens,
	): Promise<Paragraph> {
		const body = codeLines.join("\n");
		const sourcePath = getPrimaryMarkdownSourcePath(project);
		if (isPluginDiagramFenceLanguage(codeFenceLang)) {
			const isMermaid = codeFenceLang.trim().toLowerCase() === "mermaid";
			if (isEmicChartsCanvasFenceLanguage(codeFenceLang)) {
				if (DOCX_SVG_ONLY_TEST) {
					// eslint-disable-next-line no-console
					console.info(
						"[DOCX-export] SVG-only mode: skip PNG for canvas chart lang=%s",
						codeFenceLang,
					);
					return this.createCodeBlockParagraph(body, tokens, codeFenceLang);
				}
				const emic = await this.embedDiagramFenceAsPng(
					codeFenceLang,
					body,
					project,
					tokens,
					"[DOCX-export] canvas chart PNG for lang=%s",
				);
				if (emic) return emic;
				return this.createCodeBlockParagraph(body, tokens, codeFenceLang);
			}
			try {
				// eslint-disable-next-line no-console
				console.info("[DOCX-export] try SVG render for lang=%s", codeFenceLang);
				const svgAsset = await renderPluginFenceToSvg(
					this.app,
					this.component,
					codeFenceLang,
					body,
					sourcePath,
					DOCX_DIAGRAM_RENDER_WIDTH_PX,
				);
				if (svgAsset && svgAsset.data.byteLength > 0) {
					if (svgAsset.width < 40 || svgAsset.height < 40) {
						// eslint-disable-next-line no-console
						console.info(
							"[DOCX-export] reject SVG dims=%dx%d (too small/collapsed)",
							svgAsset.width,
							svgAsset.height,
						);
						return this.createCodeBlockParagraph(body, tokens, codeFenceLang);
					} else {
						if (isMermaid) {
							// eslint-disable-next-line no-console
							console.info(
								"[DOCX-export] mermaid svg features: %s",
								summarizeSvgFeatures(svgAsset.data),
							);
						}
						const svgPngFallback = DOCX_SVG_ONLY_TEST
							? SVG_FALLBACK_1PX_PNG
							: await this.rasterizeSvgBytesToPng(
									svgAsset.data,
									Math.min(svgAsset.width, DOCX_DIAGRAM_RENDER_WIDTH_PX),
									svgAsset.height,
									isMermaid,
								);
						if (isMermaid && !svgPngFallback) {
							// eslint-disable-next-line no-console
							console.info("[DOCX-export] mermaid svg raster fallback failed -> code block");
							return this.createCodeBlockParagraph(body, tokens, codeFenceLang);
						}
					// eslint-disable-next-line no-console
						console.info(
							"[DOCX-export] SVG produced bytes=%d dims=%dx%d svgRasterFallback=%d",
							svgAsset.data.byteLength,
							svgAsset.width,
							svgAsset.height,
							svgPngFallback?.byteLength ?? 0,
						);
						if (
							!isMermaid &&
							svgPngFallback &&
							isAcceptableDiagramPngRelaxed(svgPngFallback)
						) {
							// Word SVG support for some plugin diagrams is unreliable; embed PNG directly.
							return await this.createDiagramPngParagraph(svgPngFallback, tokens);
						}
						return this.createDiagramSvgParagraph(
							svgAsset.data,
							svgPngFallback ?? SVG_FALLBACK_1PX_PNG,
							svgAsset.width,
							svgAsset.height,
							tokens,
						);
					}
				}
			} catch {
				/* SVG path failed; continue to PNG fallback */
			}
			if (DOCX_SVG_ONLY_TEST) {
				// eslint-disable-next-line no-console
				console.info("[DOCX-export] SVG-only mode: skip PNG fallback for lang=%s", codeFenceLang);
				return this.createCodeBlockParagraph(body, tokens, codeFenceLang);
			}
			if (isMermaid) return this.createCodeBlockParagraph(body, tokens, codeFenceLang);
			const fallback = await this.embedDiagramFenceAsPng(
				codeFenceLang,
				body,
				project,
				tokens,
				"[DOCX-export] fallback renderPluginFenceToPng for lang=%s",
			);
			if (fallback) return fallback;
		}
		return this.createCodeBlockParagraph(body, tokens, codeFenceLang);
	}

	private async rasterizeSvgBytesToPng(
		svgBytes: Uint8Array,
		srcWidth: number,
		srcHeight: number,
		isMermaid: boolean,
	): Promise<Uint8Array | null> {
		const preparedSvg = isMermaid ? normalizeMermaidSvgForRaster(svgBytes) : svgBytes;
		if (isMermaid && preparedSvg !== svgBytes) {
			// eslint-disable-next-line no-console
			console.info(
				"[DOCX-export] mermaid SVG normalized bytes=%d->%d",
				svgBytes.byteLength,
				preparedSvg.byteLength,
			);
		}
		const blob = new Blob([preparedSvg], { type: "image/svg+xml;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		try {
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error("svg->png decode"));
				img.src = url;
			});
			const w = Math.max(1, Math.round(srcWidth));
			const h = Math.max(1, Math.round(srcHeight));
			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, w, h);
			ctx.drawImage(img, 0, 0, w, h);
			const outBlob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, "image/png", 1),
			);
			if (!outBlob) return null;
			const bytes = contiguousUint8Array(new Uint8Array(await outBlob.arrayBuffer()));
			if (isAcceptableDiagramPngRelaxed(bytes)) {
				// Browser raster often preserves Mermaid text/labels better than resvg.
				// eslint-disable-next-line no-console
				console.info(
					"[DOCX-export] svg->png via browser bytes=%d dims=%s (mermaid=%s)",
					bytes.byteLength,
					diagramPngDimsLabel(bytes),
					isMermaid ? "yes" : "no",
				);
				return bytes;
			}
		} catch {
			/* try resvg fallback below */
		} finally {
			URL.revokeObjectURL(url);
		}
		const viaResvg = await rasterizeSvgWithResvg(preparedSvg, srcWidth);
		if (viaResvg) {
			// eslint-disable-next-line no-console
			console.info("[DOCX-export] svg->png via resvg bytes=%d", viaResvg.byteLength);
			return viaResvg;
		}
		return null;
	}

	private createDiagramSvgParagraph(
		data: Uint8Array,
		fallbackPng: Uint8Array,
		srcWidth: number,
		srcHeight: number,
		tokens: StyleTokens,
	): Paragraph {
		const maxW = 560;
		const scale = srcWidth > maxW ? maxW / srcWidth : 1;
		const width = Math.max(1, Math.round(srcWidth * scale));
		const height = Math.max(1, Math.round(srcHeight * scale));
		return new Paragraph({
			children: [
				new ImageRun({
					data: contiguousUint8Array(data),
					type: "svg",
					fallback: {
						type: "png",
						data: contiguousUint8Array(fallbackPng),
					},
					transformation: { width, height },
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: {
				before: this.ptToTwips(tokens.codeBlockSpacingBefore),
				after: this.ptToTwips(tokens.codeBlockSpacingAfter),
			},
		});
	}

	private async createDiagramPngParagraph(bytes: Uint8Array, tokens: StyleTokens): Promise<Paragraph> {
		const data = contiguousUint8Array(bytes);
		const maxW = 560;
		let width = maxW;
		let height = Math.round(maxW * 0.62);
		try {
			const blob = new Blob([data], { type: "image/png" });
			const url = URL.createObjectURL(blob);
			try {
				const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
					const img = new Image();
					img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
					img.onerror = () => rej(new Error("png decode"));
					img.src = url;
				});
				if (dims.w > 0 && dims.h > 0) {
					const scale = dims.w > maxW ? maxW / dims.w : 1;
					width = Math.max(1, Math.round(dims.w * scale));
					height = Math.max(1, Math.round(dims.h * scale));
				}
			} finally {
				URL.revokeObjectURL(url);
			}
		} catch {
			// use defaults
		}

		return new Paragraph({
			children: [
				new ImageRun({
					data,
					type: "png",
					transformation: {
						width,
						height,
					},
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: {
				before: this.ptToTwips(tokens.codeBlockSpacingBefore),
				after: this.ptToTwips(tokens.codeBlockSpacingAfter),
			},
		});
	}

	private createMathPngParagraph(bytes: Uint8Array, tokens: StyleTokens): Paragraph {
		const data = contiguousUint8Array(bytes);
		const dim = pngIhdrSize(data);
		const { width, height } =
			dim && dim.w > 0 && dim.h > 0
				? docxMathImageTransformationPx(tokens, "display", dim)
				: { width: 280, height: 80 };

		return new Paragraph({
			children: [
				new ImageRun({
					data,
					type: "png",
					transformation: { width, height },
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: {
				before: this.ptToTwips(tokens.paragraphSpacing),
				after: this.ptToTwips(tokens.paragraphSpacing),
			},
		});
	}

	private createInlineMathImageRun(bytes: Uint8Array, tokens: StyleTokens): ImageRun {
		const data = contiguousUint8Array(bytes);
		const dim = pngIhdrSize(data);
		const { width, height } =
			dim && dim.w > 0 && dim.h > 0
				? docxMathImageTransformationPx(tokens, "inline", dim)
				: { width: 40, height: 24 };
		/**
		 * Floating anchor: vertical center on line; horizontal `LEFT` at character — no EMU offset
		 * (negative offset pulled the image over preceding text). Ink is centered inside the PNG in
		 * math raster (centered ink in PNG) so left-edge alignment still looks balanced.
		 */
		return new ImageRun({
			data,
			type: "png",
			transformation: { width, height },
			floating: {
				horizontalPosition: {
					relative: HorizontalPositionRelativeFrom.CHARACTER,
					align: HorizontalPositionAlign.LEFT,
				},
				verticalPosition: {
					relative: VerticalPositionRelativeFrom.LINE,
					align: VerticalPositionAlign.CENTER,
				},
				wrap: {
					type: TextWrappingType.SQUARE,
					side: TextWrappingSide.BOTH_SIDES,
				},
				lockAnchor: true,
				allowOverlap: false,
				layoutInCell: true,
			},
		});
	}

	/**
	 * Plain text slice that may contain `$...$` inline math (not `$$`).
	 * Prefetches unique formulas in parallel (session dedupes + concurrency cap), then stitches runs.
	 */
	private async plainSliceWithMathAsync(
		slice: string,
		tokens: StyleTokens,
		highlightFill: string | undefined,
		mathSession: DocxMathRasterSession,
	): Promise<Array<TextRun | ImageRun>> {
		if (!slice) return [];
		const hl =
			highlightFill !== undefined ? { type: ShadingType.CLEAR, fill: highlightFill } : undefined;
		const re = /\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g;
		const matches = [...slice.matchAll(re)];
		const uniques = [...new Set(matches.map((m) => (m[1] ?? "").trim()).filter(Boolean))];
		await Promise.all(uniques.map((tex) => mathSession.getOrRenderInline(tex)));

		const runs: Array<TextRun | ImageRun> = [];
		let last = 0;
		for (const m of matches) {
			const start = m.index ?? 0;
			if (start > last) {
				runs.push(
					new TextRun({
						text: slice.slice(last, start),
						color: this.toDocxColor(tokens.colorText),
						font: tokens.fontBody,
						size: this.ptToHalfPoint(tokens.fontSizeBody),
						shading: hl,
					}),
				);
			}
			const raw = m[0] ?? "";
			const tex = (m[1] ?? "").trim();
			if (tex) {
				const png = await mathSession.getOrRenderInline(tex);
				if (png && isAcceptableMathPng(png)) {
					runs.push(this.createInlineMathImageRun(png, tokens));
				} else {
					runs.push(
						new TextRun({
							text: raw,
							color: this.toDocxColor(tokens.colorText),
							font: tokens.fontBody,
							size: this.ptToHalfPoint(tokens.fontSizeBody),
							shading: hl,
						}),
					);
				}
			} else {
				runs.push(
					new TextRun({
						text: raw,
						color: this.toDocxColor(tokens.colorText),
						font: tokens.fontBody,
						size: this.ptToHalfPoint(tokens.fontSizeBody),
						shading: hl,
					}),
				);
			}
			last = start + raw.length;
		}
		if (last < slice.length) {
			runs.push(
				new TextRun({
					text: slice.slice(last),
					color: this.toDocxColor(tokens.colorText),
					font: tokens.fontBody,
					size: this.ptToHalfPoint(tokens.fontSizeBody),
					shading: hl,
				}),
			);
		}
		return runs;
	}

	private async inlineRunsAsync(
		text: string,
		tokens: StyleTokens,
		mathSession: DocxMathRasterSession,
	): Promise<Array<TextRun | ExternalHyperlink | ImageRun>> {
		const segs = segmentHighlightSyntax(text);
		const out: Array<TextRun | ExternalHyperlink | ImageRun> = [];
		const defaultFill = defaultHighlightCssToDocxFill(tokens.highlightDefaultBackground);

		for (const seg of segs) {
			if (seg.kind === "text") {
				if (seg.text) out.push(...(await this.inlineRunsPlainAsync(seg.text, tokens, undefined, mathSession)));
				continue;
			}
			let fill = defaultFill;
			if (seg.colorToken) {
				const css = normalizeHighlightColorToken(seg.colorToken);
				if (css) fill = highlightCssToDocxFill(css, defaultFill);
			}
			out.push(...(await this.inlineRunsPlainAsync(seg.text, tokens, fill, mathSession)));
		}

		return out.length ? out : [new TextRun("")];
	}

	private async inlineRunsPlainAsync(
		text: string,
		tokens: StyleTokens,
		highlightFill: string | undefined,
		mathSession: DocxMathRasterSession,
	): Promise<Array<TextRun | ExternalHyperlink | ImageRun>> {
		const runs: Array<TextRun | ExternalHyperlink | ImageRun> = [];
		const hl =
			highlightFill !== undefined ? { type: ShadingType.CLEAR, fill: highlightFill } : undefined;
		const pattern = /(\[[^\]]+\]\(([^)]+)\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~)/g;
		let index = 0;
		let match = pattern.exec(text);
		while (match) {
			const start = match.index;
			if (start > index) {
				runs.push(
					...(await this.plainSliceWithMathAsync(
						text.slice(index, start),
						tokens,
						highlightFill,
						mathSession,
					)),
				);
			}
			const token = match[0] ?? "";
			if (token.startsWith("[")) {
				const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
				const label = link?.[1] ?? token;
				const href = link?.[2] ?? "";
				runs.push(
					new ExternalHyperlink({
						link: href,
						children: [
							new TextRun({
								text: label,
								color: this.toDocxColor(tokens.linkColor),
								underline: tokens.linkUnderline ? {} : undefined,
								font: tokens.fontBody,
								size: this.ptToHalfPoint(tokens.fontSizeBody),
								shading: hl,
							}),
						],
					}),
				);
			} else if (token.startsWith("**")) {
				runs.push(
					new TextRun({
						text: token.slice(2, -2),
						bold: true,
						color: this.toDocxColor(tokens.strongColor),
						font: tokens.fontBody,
						size: this.ptToHalfPoint(tokens.fontSizeBody),
						shading: hl,
					}),
				);
			} else if (token.startsWith("*")) {
				runs.push(
					new TextRun({
						text: token.slice(1, -1),
						italics: true,
						color: this.toDocxColor(tokens.emColor),
						font: tokens.fontBody,
						size: this.ptToHalfPoint(tokens.fontSizeBody),
						shading: hl,
					}),
				);
			} else if (token.startsWith("`")) {
				runs.push(
					new TextRun({
						text: token.slice(1, -1),
						font: tokens.fontMono,
						color: this.toDocxColor(tokens.codeInlineColor),
						size: this.ptToHalfPoint(tokens.codeFontSize),
						shading: hl,
					}),
				);
			} else if (token.startsWith("~~")) {
				runs.push(
					new TextRun({
						text: token.slice(2, -2),
						strike: true,
						color: this.toDocxColor(tokens.colorText),
						font: tokens.fontBody,
						size: this.ptToHalfPoint(tokens.fontSizeBody),
						shading: hl,
					}),
				);
			}
			index = start + token.length;
			match = pattern.exec(text);
		}
		if (index < text.length) {
			runs.push(
				...(await this.plainSliceWithMathAsync(text.slice(index), tokens, highlightFill, mathSession)),
			);
		}
		if (runs.length === 0) {
			return [new TextRun({ text: "", shading: hl })];
		}
		return runs;
	}

	private createCodeBlockParagraph(text: string, tokens: StyleTokens, fenceLang: string): Paragraph {
		const runs = highlightCodeToDocxRuns(
			text,
			fenceLang,
			tokens,
			(c) => this.toDocxColor(c),
			(pt) => this.ptToHalfPoint(pt),
		);

		return new Paragraph({
			children: runs.length ? runs : [new TextRun("")],
			border: {
				top: { style: BorderStyle.SINGLE, size: 4, color: this.toDocxColor(tokens.preBorderColor) },
				right: { style: BorderStyle.SINGLE, size: 4, color: this.toDocxColor(tokens.preBorderColor) },
				bottom: { style: BorderStyle.SINGLE, size: 4, color: this.toDocxColor(tokens.preBorderColor) },
				left: { style: BorderStyle.SINGLE, size: 4, color: this.toDocxColor(tokens.preBorderColor) },
			},
			shading: {
				type: ShadingType.CLEAR,
				fill: this.toDocxColor(tokens.preBackground),
			},
			spacing: {
				before: this.ptToTwips(tokens.codeBlockSpacingBefore),
				after: this.ptToTwips(tokens.codeBlockSpacingAfter),
			},
		});
	}

	/**
	 * Obsidian callouts: `>…> [!type] Optional title`, then nested `>…` body lines.
	 * Nested `> > [!child]` is parsed recursively. Renders as table(s) with tinted background.
	 */
	private async tryParseCalloutAsync(
		lines: string[],
		start: number,
		tokens: StyleTokens,
		mathSession: DocxMathRasterSession,
	): Promise<{ table: Table; nextIndex: number } | null> {
		const parsed = parseCalloutStartLine(lines[start] ?? "");
		if (!parsed) return null;
		return this.buildCalloutTableAsync(lines, start, parsed.depth, tokens, mathSession, 0);
	}

	private async buildCalloutTableAsync(
		lines: string[],
		start: number,
		expectedDepth: number,
		tokens: StyleTokens,
		mathSession: DocxMathRasterSession,
		nestLevel: number,
	): Promise<{ table: Table; nextIndex: number } | null> {
		const headParsed = parseCalloutStartLine(lines[start] ?? "");
		if (!headParsed || headParsed.depth !== expectedDepth) return null;

		let rest = headParsed.restAfterBracket;
		const foldPref = /^([+\-])\s*(.*)$/.exec(rest);
		if (foldPref) {
			rest = (foldPref[2] ?? "").trim();
		}
		const userTitle = rest;
		const rawType = headParsed.rawType;

		const rgbKey = CALLOUT_TYPE_RGB[rawType] ? rawType : "note";
		const rgb = CALLOUT_TYPE_RGB[rgbKey] ?? CALLOUT_TYPE_RGB.note ?? "68, 138, 255";
		const [r, g, b] = parseRgbTriplet(rgb);
		const accentHex = rgbToDocxHex(r, g, b);
		const fillHex = calloutFillHex(rgb, tokens.calloutSurfaceOpacity);
		const borderHex = calloutBorderHex(rgb, tokens.calloutDocxFrameBorderMix);

		const typeLabel = rawType
			.split(/[-_]/)
			.filter(Boolean)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
		const titleText = userTitle || typeLabel || "Note";

		const body = await this.parseCalloutBodyAsync(
			lines,
			start + 1,
			expectedDepth,
			tokens,
			mathSession,
			nestLevel,
		);
		const titleAfter =
			body.blocks.length > 0 ? this.ptToTwips(4) : this.ptToTwips(2);

		const cellChildren: (Paragraph | Table)[] = [
			new Paragraph({
				children: [
					new TextRun({
						text: titleText,
						bold: true,
						color: accentHex,
						font: tokens.fontHeading,
						size: this.ptToHalfPoint(
							Math.min(tokens.h4Size, tokens.fontSizeBody * tokens.calloutTitleFontScale),
						),
					}),
				],
				spacing: { after: titleAfter },
			}),
			...body.blocks,
		];

		const thin = { style: BorderStyle.SINGLE, size: 1, color: borderHex } as const;
		const leftBarEighths = Math.max(
			8,
			Math.min(96, Math.round(tokens.calloutBorderLeftWidthPx * 6)),
		);
		const accentEdge = { style: BorderStyle.SINGLE, size: leftBarEighths, color: accentHex } as const;
		const padTwips = Math.round(tokens.calloutCellPaddingPt * 20);
		const nestIndentTwips = nestLevel * 120;
		const leftPadTwips = padTwips + Math.round(tokens.calloutBorderLeftWidthPx * 15) + nestIndentTwips;

		const table = new Table({
			rows: [
				new TableRow({
					children: [
						new TableCell({
							shading: {
								fill: fillHex,
								type: ShadingType.CLEAR,
							},
							borders: {
								left: accentEdge,
								top: thin,
								right: thin,
								bottom: thin,
							},
							margins: {
								top: padTwips,
								bottom: padTwips,
								left: leftPadTwips,
								right: padTwips,
							},
							children: cellChildren,
						}),
					],
				}),
			],
			width: { size: 100, type: WidthType.PERCENTAGE },
		});

		return { table, nextIndex: body.nextIndex };
	}

	private async parseCalloutBodyAsync(
		lines: string[],
		startIdx: number,
		depth: number,
		tokens: StyleTokens,
		mathSession: DocxMathRasterSession,
		nestLevel: number,
	): Promise<{ blocks: (Paragraph | Table)[]; nextIndex: number }> {
		const blocks: (Paragraph | Table)[] = [];
		let idx = startIdx;
		while (idx < lines.length) {
			const line = lines[idx] ?? "";
			const qd = countQuoteDepth(line);
			if (qd === 0) break;
			if (qd < depth) break;

			const nestedStart = parseCalloutStartLine(line);
			if (nestedStart && nestedStart.depth > depth && nestLevel < CALLOUT_NEST_MAX_DEPTH) {
				const nested = await this.buildCalloutTableAsync(
					lines,
					idx,
					nestedStart.depth,
					tokens,
					mathSession,
					nestLevel + 1,
				);
				if (nested) {
					blocks.push(nested.table);
					idx = nested.nextIndex;
					continue;
				}
			}

			const bodyText = stripQuoteLevels(line, depth);
			const trimmedBody = bodyText.trim();
			if (!trimmedBody) {
				blocks.push(
					new Paragraph({
						children: [new TextRun({ text: "", color: this.toDocxColor(tokens.colorText) })],
						spacing: { before: 0, after: 0 },
					}),
				);
			} else {
				blocks.push(
					new Paragraph({
						children: await this.inlineRunsAsync(trimmedBody, tokens, mathSession),
						alignment: this.toAlignment(tokens.paragraphTextAlign),
						spacing: { before: 0, after: this.ptToTwips(Math.min(tokens.paragraphSpacing, 6)) },
					}),
				);
			}
			idx += 1;
		}
		return { blocks, nextIndex: idx };
	}

	private async tryParseTableAsync(
		lines: string[],
		start: number,
		tokens: StyleTokens,
		mathSession: DocxMathRasterSession,
	): Promise<{ table: Table; nextIndex: number } | null> {
		const header = (lines[start] ?? "").trim();
		const separator = (lines[start + 1] ?? "").trim();
		if (!header.includes("|")) return null;
		if (!/^\s*\|?[:\- ]+\|[:\-| ]+\|?\s*$/.test(separator)) return null;

		const rows: string[] = [header, ...(this.collectTableRows(lines, start + 2))];
		if (rows.length === 0) return null;

		const alignments = this.parseTableAlignment(separator);
		const tableRows = await Promise.all(
			rows.map(async (row, rowIndex) => {
				const cells = this.splitTableRow(row);
				const tableCells = await Promise.all(
					cells.map(async (cell, cellIndex) => {
						const children = await this.inlineRunsAsync(cell, tokens, mathSession);
						return new TableCell({
							children: [
								new Paragraph({
									children,
									alignment: alignments[cellIndex] ?? AlignmentType.LEFT,
								}),
							],
							borders: {
								top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
								bottom: {
									style: rowIndex === 0 ? BorderStyle.SINGLE : BorderStyle.NONE,
									size: rowIndex === 0 ? 4 : 0,
									color: this.toDocxColor(tokens.thBorderBottomColor),
								},
								left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
								right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
							},
						});
					}),
				);
				return new TableRow({ children: tableCells });
			}),
		);

		return {
			table: new Table({
				rows: tableRows,
				width: { size: 100, type: WidthType.PERCENTAGE },
			}),
			nextIndex: start + rows.length + 2,
		};
	}

	private collectTableRows(lines: string[], start: number): string[] {
		const rows: string[] = [];
		let idx = start;
		while (idx < lines.length) {
			const line = (lines[idx] ?? "").trim();
			if (!line || !line.includes("|")) break;
			rows.push(line);
			idx += 1;
		}
		return rows;
	}

	private splitTableRow(row: string): string[] {
		const cleaned = row.trim().replace(/^\|/, "").replace(/\|$/, "");
		return cleaned.split("|").map((v) => v.trim());
	}

	private parseTableAlignment(separator: string): Array<(typeof AlignmentType)[keyof typeof AlignmentType]> {
		return this.splitTableRow(separator).map((cell) => {
			const left = cell.startsWith(":");
			const right = cell.endsWith(":");
			if (left && right) return AlignmentType.CENTER;
			if (right) return AlignmentType.RIGHT;
			return AlignmentType.LEFT;
		});
	}

	private async createImageParagraph(srcRaw: string, altRaw: string, tokens: StyleTokens): Promise<Paragraph> {
		const decodedRaw = decodeUriSafe(srcRaw.trim());
		const { path: pathPart, title } = parseMarkdownImageDestination(decodedRaw);
		const path = decodeUriSafe(pathPart.trim());
		const alt = altRaw.trim();
		const { width, height } = docxImageDisplaySizePx(alt, title);

		const imageType = this.resolveImageType(path);
		if (!imageType) {
			return new Paragraph({
				children: [
					new TextRun({
						text: `[Image format not supported for DOCX embed: ${path}]`,
						color: this.toDocxColor(tokens.colorMuted),
					}),
				],
				alignment: AlignmentType.CENTER,
			});
		}

		const bin = await this.tryLoadImageBytes(path);
		if (!bin) {
			return new Paragraph({
				children: [
					new TextRun({
						text: `[Image not found: ${path}]`,
						color: this.toDocxColor(tokens.colorMuted),
					}),
				],
				alignment: AlignmentType.CENTER,
			});
		}

		if (imageType === "svg") {
			const svgBytes = contiguousUint8Array(new Uint8Array(bin));
			let { w: rw, h: rh } = svgIntrinsicDimensionsFromMarkup(svgBytes);
			const maxDim = 1600;
			if (rw > maxDim || rh > maxDim) {
				const s = maxDim / Math.max(rw, rh);
				rw = Math.max(1, Math.round(rw * s));
				rh = Math.max(1, Math.round(rh * s));
			}
			const png = await this.rasterizeSvgBytesToPng(svgBytes, rw, rh, false);
			if (!png || !isAcceptableDiagramPngRelaxed(png)) {
				return new Paragraph({
					children: [
						new TextRun({
							text: `[SVG could not be rasterized for DOCX: ${path}]`,
							color: this.toDocxColor(tokens.colorMuted),
						}),
					],
					alignment: AlignmentType.CENTER,
				});
			}
			return new Paragraph({
				children: [
					new ImageRun({
						data: png,
						type: "png",
						transformation: { width, height },
					}),
				],
				alignment: AlignmentType.CENTER,
				spacing: {
					before: this.ptToTwips(tokens.imageMarginTop),
					after: this.ptToTwips(tokens.imageMarginBottom),
				},
			});
		}

		const imageBytes = contiguousUint8Array(new Uint8Array(bin));
		return new Paragraph({
			children: [
				new ImageRun({
					data: imageBytes,
					type: imageType,
					transformation: { width, height },
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: {
				before: this.ptToTwips(tokens.imageMarginTop),
				after: this.ptToTwips(tokens.imageMarginBottom),
			},
		});
	}

	private async tryLoadImageBytes(source: string): Promise<ArrayBuffer | null> {
		if (/^https?:\/\//i.test(source)) {
			try {
				const res = await requestUrl({ url: source, throw: false });
				if (res.status < 200 || res.status >= 300) return null;
				return res.arrayBuffer;
			} catch {
				return null;
			}
		}

		const normalized = source
			.replace(/^file:\/\//i, "")
			.replace(/^\/+/, "")
			.replace(/\\/g, "/");
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (file instanceof TFile) {
			return await this.app.vault.adapter.readBinary(file.path);
		}
		return null;
	}

	private buildNumbering(tokens: StyleTokens): NumberingConfig[] {
		const makeLevel = (
			level: number,
			format: (typeof LevelFormat)[keyof typeof LevelFormat],
			text: string,
		): NumberingLevelConfig => ({
			level,
			format,
			text,
			alignment: AlignmentType.LEFT,
			style: {
				paragraph: {
					indent: {
						left: this.ptToTwips((level + 1) * tokens.listIndentPerLevel),
						hanging: 360,
					},
				},
			},
		});

		return [
			{
				reference: "ra-ordered",
				levels: [
					makeLevel(0, LevelFormat.DECIMAL, "%1."),
					makeLevel(1, LevelFormat.DECIMAL, "%2."),
					makeLevel(2, LevelFormat.DECIMAL, "%3."),
					makeLevel(3, LevelFormat.DECIMAL, "%4."),
					makeLevel(4, LevelFormat.DECIMAL, "%5."),
					makeLevel(5, LevelFormat.DECIMAL, "%6."),
				],
			},
			{
				reference: "ra-bullet",
				levels: [
					makeLevel(0, LevelFormat.BULLET, tokens.listBulletChar),
					makeLevel(1, LevelFormat.BULLET, tokens.listBulletChar),
					makeLevel(2, LevelFormat.BULLET, tokens.listBulletChar),
					makeLevel(3, LevelFormat.BULLET, tokens.listBulletChar),
					makeLevel(4, LevelFormat.BULLET, tokens.listBulletChar),
					makeLevel(5, LevelFormat.BULLET, tokens.listBulletChar),
				],
			},
		];
	}

	private resolveImageType(
		source: string,
	): "png" | "jpg" | "gif" | "bmp" | "svg" | undefined {
		const base = (source.split(/[?#]/)[0] ?? source).trim();
		const lower = base.toLowerCase();
		if (lower.endsWith(".png")) return "png";
		if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
		if (lower.endsWith(".gif")) return "gif";
		if (lower.endsWith(".bmp")) return "bmp";
		if (lower.endsWith(".svg")) return "svg";
		return undefined;
	}

	private applyHeadingNumbering(
		text: string,
		level: number,
		counters: number[],
		mode: "none" | "h2-h4" | "h1-h6",
	): string {
		if (mode === "none") return text;
		if (mode === "h2-h4" && (level < 2 || level > 4)) return text;
		if (mode === "h2-h4") {
			const idx = level - 1;
			counters[idx] = (counters[idx] ?? 0) + 1;
			for (let i = idx + 1; i < counters.length; i += 1) counters[i] = 0;
			const prefix = counters.slice(1, level).filter((n) => n > 0).join(".");
			return `${prefix}. ${text}`;
		}

		const idx = level - 1;
		counters[idx] = (counters[idx] ?? 0) + 1;
		for (let i = idx + 1; i < counters.length; i += 1) counters[i] = 0;
		const prefix = counters.slice(0, level).filter((n) => n > 0).join(".");
		return `${prefix}. ${text}`;
	}

	private getHeadingSize(level: number, tokens: StyleTokens): number {
		switch (level) {
			case 1:
				return tokens.h1Size;
			case 2:
				return tokens.h2Size;
			case 3:
				return tokens.h3Size;
			case 4:
				return tokens.h4Size;
			case 5:
				return tokens.h5Size;
			default:
				return tokens.h6Size;
		}
	}

	private resolveMargins(tokens: StyleTokens): { top: number; right: number; bottom: number; left: number } {
		return {
			top: this.cssLengthToTwips(tokens.pageMarginTop),
			right: this.cssLengthToTwips(tokens.pageMarginRight),
			bottom: this.cssLengthToTwips(tokens.pageMarginBottom),
			left: this.cssLengthToTwips(tokens.pageMarginLeft),
		};
	}

	private cssLengthToTwips(value: string): number {
		const match = /^([0-9]*\.?[0-9]+)\s*(cm|mm|in|pt|px)?$/i.exec(value.trim());
		if (!match) return 1134; // 2cm fallback
		const amount = Number(match[1] ?? "0");
		const unit = (match[2] ?? "cm").toLowerCase();
		switch (unit) {
			case "in":
				return Math.round(amount * 1440);
			case "cm":
				return Math.round(amount * 567);
			case "mm":
				return Math.round(amount * 56.7);
			case "pt":
				return Math.round(amount * 20);
			case "px":
				return Math.round(amount * 15);
			default:
				return Math.round(amount * 567);
		}
	}

	private ptToHalfPoint(pt: number): number {
		return Math.max(2, Math.round(pt * 2));
	}

	private ptToTwips(pt: number): number {
		return Math.round(pt * 20);
	}

	private toDocxColor(value: string): string {
		const cleaned = value.trim().replace(/^#/, "");
		return /^[0-9a-f]{6}$/i.test(cleaned) ? cleaned.toUpperCase() : "000000";
	}

	private toAlignment(value: "left" | "center" | "right" | "justify"): (typeof AlignmentType)[keyof typeof AlignmentType] {
		switch (value) {
			case "center":
				return AlignmentType.CENTER;
			case "right":
				return AlignmentType.RIGHT;
			case "justify":
				return AlignmentType.JUSTIFIED;
			default:
				return AlignmentType.LEFT;
		}
	}

	private toHeadingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
		switch (level) {
			case 1:
				return HeadingLevel.HEADING_1;
			case 2:
				return HeadingLevel.HEADING_2;
			case 3:
				return HeadingLevel.HEADING_3;
			case 4:
				return HeadingLevel.HEADING_4;
			case 5:
				return HeadingLevel.HEADING_5;
			default:
				return HeadingLevel.HEADING_6;
		}
	}
}
