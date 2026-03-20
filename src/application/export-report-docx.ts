import type { ReportProject } from "../domain/report-project";
import type { DocxExporter } from "../infrastructure/docx-exporter";
import type { MarkdownComposer } from "../infrastructure/markdown-composer";
import type { LinkResolver } from "../infrastructure/link-resolver";

export async function exportReportDocx(
	project: ReportProject,
	outputPath: string,
	docxExporter: DocxExporter,
	composer: MarkdownComposer,
	linkResolver: LinkResolver,
): Promise<void> {
	const markdown = await composer.compose(project);
	const resolvedMarkdown = await linkResolver.resolve(project, markdown, { skipHighlightHtml: true });
	await docxExporter.export(project, resolvedMarkdown, outputPath);
}
