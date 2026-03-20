import type { ReportProject } from "../domain/report-project";
import type { DocxExporter } from "../infrastructure/docx-exporter";
import type { MarkdownComposer } from "../infrastructure/markdown-composer";
import type { LinkResolver } from "../infrastructure/link-resolver";
import type { App, Component } from "obsidian";
import { applyExportMarkdownTransforms } from "../infrastructure/export-markdown-transforms";

export async function exportReportDocx(
	app: App,
	component: Component,
	project: ReportProject,
	outputPath: string,
	docxExporter: DocxExporter,
	composer: MarkdownComposer,
	linkResolver: LinkResolver,
): Promise<void> {
	const markdown = await composer.compose(project);
	const resolvedMarkdown = await linkResolver.resolve(project, markdown, { skipHighlightHtml: true });
	const exportMarkdown = applyExportMarkdownTransforms(resolvedMarkdown);
	await docxExporter.export(project, exportMarkdown, outputPath);
}
