import {
	AlignmentType,
	BorderStyle,
	Document,
	ExternalHyperlink,
	HeadingLevel,
	ImageRun,
	LevelFormat,
	Packer,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableRow,
	TextRun,
	WidthType,
} from "docx";
import { TFile, requestUrl, type App } from "obsidian";
import type { ReportProject } from "../domain/report-project";
import { mergePrintRules, mergeStyleTokens, type StyleTokens } from "../domain/style-template";

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

/** RGB strings "r, g, b" aligned with export callout CSS for consistent colors */
const CALLOUT_RGB: Record<string, string> = {
	note: "68, 138, 255",
	abstract: "0, 176, 255",
	summary: "0, 176, 255",
	tldr: "0, 176, 255",
	info: "0, 184, 212",
	todo: "68, 138, 255",
	tip: "0, 191, 165",
	hint: "0, 191, 165",
	important: "0, 191, 165",
	success: "0, 200, 83",
	check: "0, 200, 83",
	done: "0, 200, 83",
	question: "255, 193, 7",
	help: "255, 193, 7",
	faq: "255, 193, 7",
	warning: "255, 152, 0",
	caution: "255, 152, 0",
	attention: "255, 152, 0",
	failure: "244, 67, 54",
	fail: "244, 67, 54",
	missing: "244, 67, 54",
	danger: "255, 82, 82",
	error: "255, 82, 82",
	bug: "244, 67, 54",
	example: "124, 77, 255",
	quote: "158, 158, 158",
	cite: "158, 158, 158",
};

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

function calloutFillHex(accentRgb: string): string {
	const [r, g, b] = parseRgbTriplet(accentRgb);
	/** ~12% tint toward accent (matches rgba(..., 0.12) over white) */
	const t = 0.12;
	const mix = (c: number) => Math.round(255 * (1 - t) + c * t);
	return rgbToDocxHex(mix(r), mix(g), mix(b));
}

function calloutBorderHex(accentRgb: string): string {
	const [r, g, b] = parseRgbTriplet(accentRgb);
	const t = 0.35;
	const mix = (c: number) => Math.round(255 * (1 - t) + c * t);
	return rgbToDocxHex(mix(r), mix(g), mix(b));
}

export class DocxExporter {
	constructor(private app: App) {}

	async export(project: ReportProject, markdown: string, outputPath: string): Promise<void> {
		const tokens = mergeStyleTokens(project.styleTemplate.tokens);
		const printRules = mergePrintRules(project.styleTemplate.printRules);
		const blocks = await this.markdownToBlocks(markdown, tokens, printRules.headingNumbering);
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
		tokens: StyleTokens,
		headingNumbering: "none" | "h2-h4" | "h1-h6",
	): Promise<DocxBlock[]> {
		const lines = markdown.split("\n");
		const output: DocxBlock[] = [];
		const headingCounters = [0, 0, 0, 0, 0, 0];
		let inCodeBlock = false;
		const codeLines: string[] = [];
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

			if (trimmed.startsWith("```")) {
				if (inCodeBlock) {
					output.push(this.createCodeBlockParagraph(codeLines.join("\n"), tokens));
					codeLines.length = 0;
					inCodeBlock = false;
				} else {
					inCodeBlock = true;
				}
				index += 1;
				continue;
			}

			if (inCodeBlock) {
				codeLines.push(line);
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

			const table = this.tryParseTable(lines, index, tokens);
			if (table) {
				output.push(table.table);
				index = table.nextIndex;
				continue;
			}

			const callout = this.tryParseCallout(lines, index, tokens);
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
						children: this.inlineRuns(quoteText, tokens),
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
						children: this.inlineRuns(listText, tokens),
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
					children: this.inlineRuns(trimmed, tokens),
					alignment: this.toAlignment(tokens.paragraphTextAlign),
					spacing: {
						before: this.ptToTwips(tokens.paragraphSpacing),
					},
				}),
			);
			index += 1;
		}

		if (inCodeBlock && codeLines.length > 0) {
			output.push(this.createCodeBlockParagraph(codeLines.join("\n"), tokens));
		}

		return output;
	}

	private inlineRuns(text: string, tokens: StyleTokens): Array<TextRun | ExternalHyperlink> {
		const runs: Array<TextRun | ExternalHyperlink> = [];
		const pattern = /(\[[^\]]+\]\(([^)]+)\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~)/g;
		let index = 0;
		let match = pattern.exec(text);
		while (match) {
			const start = match.index;
			if (start > index) {
				runs.push(
					new TextRun({
						text: text.slice(index, start),
						color: this.toDocxColor(tokens.colorText),
						font: tokens.fontBody,
						size: this.ptToHalfPoint(tokens.fontSizeBody),
					}),
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
					}),
				);
			} else if (token.startsWith("`")) {
				runs.push(
					new TextRun({
						text: token.slice(1, -1),
						font: tokens.fontMono,
						color: this.toDocxColor(tokens.codeInlineColor),
						size: this.ptToHalfPoint(tokens.codeFontSize),
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
					}),
				);
			}
			index = start + token.length;
			match = pattern.exec(text);
		}
		if (index < text.length) {
			runs.push(
				new TextRun({
					text: text.slice(index),
					color: this.toDocxColor(tokens.colorText),
					font: tokens.fontBody,
					size: this.ptToHalfPoint(tokens.fontSizeBody),
				}),
			);
		}
		return runs.length ? runs : [new TextRun("")];
	}

	private createCodeBlockParagraph(text: string, tokens: StyleTokens): Paragraph {
		return new Paragraph({
			children: [
				new TextRun({
					text,
					font: tokens.fontMono,
					color: this.toDocxColor(tokens.codeInlineColor),
					size: this.ptToHalfPoint(tokens.codeFontSize),
				}),
			],
			spacing: {
				before: this.ptToTwips(tokens.codeBlockSpacingBefore),
				after: this.ptToTwips(tokens.codeBlockSpacingAfter),
			},
		});
	}

	/**
	 * Obsidian callouts: first line `> [!type] Optional title`, then `> ...` body lines.
	 * Renders as a single-row table with tinted background and accent left border (DOCX has no native callouts).
	 */
	private tryParseCallout(
		lines: string[],
		start: number,
		tokens: StyleTokens,
	): { table: Table; nextIndex: number } | null {
		const firstRaw = lines[start] ?? "";
		const first = firstRaw.trim();
		const calloutMatch = /^>\s*\[!([^\]]+)\]\s*(.*)$/.exec(first);
		if (!calloutMatch) return null;

		let rawType = (calloutMatch[1] ?? "note").trim().toLowerCase().replace(/\s+/g, "-");
		if (rawType.endsWith("-")) {
			rawType = rawType.slice(0, -1);
		}
		let rest = (calloutMatch[2] ?? "").trim();
		const foldPref = /^([+\-])\s*(.*)$/.exec(rest);
		if (foldPref) {
			rest = (foldPref[2] ?? "").trim();
		}
		const userTitle = rest;
		const bodyLines: string[] = [];
		let idx = start + 1;
		while (idx < lines.length) {
			const line = lines[idx] ?? "";
			const cont = /^>\s?(.*)$/.exec(line);
			if (!cont) break;
			bodyLines.push(cont[1] ?? "");
			idx += 1;
		}

		const rgbKey = CALLOUT_RGB[rawType] ? rawType : "note";
		const rgb = CALLOUT_RGB[rgbKey] ?? CALLOUT_RGB.note ?? "68, 138, 255";
		const [r, g, b] = parseRgbTriplet(rgb);
		const accentHex = rgbToDocxHex(r, g, b);
		const fillHex = calloutFillHex(rgb);
		const borderHex = calloutBorderHex(rgb);

		const typeLabel = rawType
			.split(/[-_]/)
			.filter(Boolean)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
		const titleText = userTitle || typeLabel || "Note";

		const cellChildren: Paragraph[] = [
			new Paragraph({
				children: [
					new TextRun({
						text: titleText,
						bold: true,
						color: accentHex,
						font: tokens.fontHeading,
						size: this.ptToHalfPoint(Math.min(tokens.h4Size, tokens.fontSizeBody + 1)),
					}),
				],
				spacing: { after: bodyLines.some((l) => l.trim()) ? this.ptToTwips(4) : this.ptToTwips(2) },
			}),
		];

		for (const body of bodyLines) {
			const trimmedBody = body.trim();
			if (!trimmedBody) {
				cellChildren.push(
					new Paragraph({
						children: [new TextRun({ text: "", color: this.toDocxColor(tokens.colorText) })],
						spacing: { before: 0, after: 0 },
					}),
				);
				continue;
			}
			cellChildren.push(
				new Paragraph({
					children: this.inlineRuns(trimmedBody, tokens),
					alignment: this.toAlignment(tokens.paragraphTextAlign),
					spacing: { before: 0, after: this.ptToTwips(Math.min(tokens.paragraphSpacing, 6)) },
				}),
			);
		}

		const thin = { style: BorderStyle.SINGLE, size: 1, color: borderHex } as const;
		const accentEdge = { style: BorderStyle.SINGLE, size: 24, color: accentHex } as const;

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
							margins: { top: 160, bottom: 160, left: 200, right: 160 },
							children: cellChildren,
						}),
					],
				}),
			],
			width: { size: 100, type: WidthType.PERCENTAGE },
		});

		return { table, nextIndex: idx };
	}

	private tryParseTable(
		lines: string[],
		start: number,
		tokens: StyleTokens,
	): { table: Table; nextIndex: number } | null {
		const header = (lines[start] ?? "").trim();
		const separator = (lines[start + 1] ?? "").trim();
		if (!header.includes("|")) return null;
		if (!/^\s*\|?[:\- ]+\|[:\-| ]+\|?\s*$/.test(separator)) return null;

		const rows: string[] = [header, ...(this.collectTableRows(lines, start + 2))];
		if (rows.length === 0) return null;

		const alignments = this.parseTableAlignment(separator);
		const tableRows = rows.map((row, rowIndex) => {
			const cells = this.splitTableRow(row);
			return new TableRow({
				children: cells.map(
					(cell, cellIndex) =>
						new TableCell({
							children: [
								new Paragraph({
									children: this.inlineRuns(cell, tokens),
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
						}),
				),
			});
		});

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
		const source = decodeURIComponent(srcRaw.trim());
		const alt = altRaw.trim();
		const sizeMatch = /(\d{2,4})x(\d{2,4})$/.exec(alt);
		const width = Number(sizeMatch?.[1] ?? 560);
		const height = Number(sizeMatch?.[2] ?? 320);
		const imageType = this.resolveImageType(source);
		if (!imageType || imageType === "svg") {
			return new Paragraph({
				children: [
					new TextRun({
						text: `[Image format not supported for DOCX embed: ${source}]`,
						color: this.toDocxColor(tokens.colorMuted),
					}),
				],
				alignment: AlignmentType.CENTER,
			});
		}
		const bin = await this.tryLoadImageBytes(source);
		if (!bin) {
			return new Paragraph({
				children: [new TextRun({ text: `[Image not found: ${source}]`, color: this.toDocxColor(tokens.colorMuted) })],
				alignment: AlignmentType.CENTER,
			});
		}

		return new Paragraph({
			children: [
				new ImageRun({
					data: new Uint8Array(bin),
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
		const lower = source.toLowerCase();
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
