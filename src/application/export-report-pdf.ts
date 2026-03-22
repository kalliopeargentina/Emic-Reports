import type { ReportProject } from "../domain/report-project";
import type { PdfExporterElectron } from "../infrastructure/pdf-exporter-electron";
import { generatePreview } from "./generate-preview";
import type { MarkdownComposer } from "../infrastructure/markdown-composer";
import type { LinkResolver } from "../infrastructure/link-resolver";
import type { HtmlRenderer } from "../infrastructure/html-renderer";
import type { CssTemplateEngine } from "../infrastructure/css-template-engine";
import type { AssetResolver } from "../infrastructure/asset-resolver";

export async function exportReportPdf(
	project: ReportProject,
	outputPath: string,
	pdfExporter: PdfExporterElectron,
	composer: MarkdownComposer,
	linkResolver: LinkResolver,
	renderer: HtmlRenderer,
	cssTemplateEngine: CssTemplateEngine,
	assetResolver: AssetResolver,
): Promise<void> {
	const preview = await generatePreview(
		project,
		composer,
		linkResolver,
		renderer,
		cssTemplateEngine,
		assetResolver,
		{ assetLinkTarget: "fileExport" },
	);
	await pdfExporter.export(project, preview, outputPath);
}
