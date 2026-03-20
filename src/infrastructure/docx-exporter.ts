import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { App } from "obsidian";
import type { ReportProject } from "../domain/report-project";

export class DocxExporter {
	constructor(private app: App) {}

	async export(_project: ReportProject, markdown: string, outputPath: string): Promise<void> {
		const paragraphs = this.markdownToParagraphs(markdown);
		const doc = new Document({
			sections: [{ children: paragraphs }],
		});
		const buffer = await Packer.toBuffer(doc);
		const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		await this.app.vault.adapter.writeBinary(outputPath, arrayBuffer);
	}

	private markdownToParagraphs(markdown: string): Paragraph[] {
		const lines = markdown.split("\n");
		const output: Paragraph[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				output.push(new Paragraph({ children: [new TextRun("")] }));
				continue;
			}

			if (trimmed === "---") {
				output.push(new Paragraph({ pageBreakBefore: true }));
				continue;
			}

			const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
			if (headingMatch) {
				const marker = headingMatch[1] ?? "#";
				const headingText = headingMatch[2] ?? trimmed;
				const level = marker.length;
				output.push(
					new Paragraph({
						text: headingText,
						heading: this.toHeadingLevel(level),
					}),
				);
				continue;
			}

			output.push(
				new Paragraph({
					children: [new TextRun(trimmed)],
				}),
			);
		}

		return output;
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
