import type { ReportProject } from "../domain/report-project";
import { mergePrintRules } from "../domain/style-template";
import type { MarkdownComposer } from "../infrastructure/markdown-composer";
import type { LinkResolver } from "../infrastructure/link-resolver";
import type { HtmlRenderer } from "../infrastructure/html-renderer";
import type { CssTemplateEngine } from "../infrastructure/css-template-engine";
import type { AssetLinkTarget, AssetResolver } from "../infrastructure/asset-resolver";
import { applyExportMarkdownTransforms } from "../infrastructure/export-markdown-transforms";
import { injectHeadingSectionNumbers } from "../infrastructure/heading-section-numbers";
import { buildTableOfContentsHtml, ensureHeadingIds } from "../infrastructure/toc-html";

export interface PreviewBundle {
	markdown: string;
	html: string;
	css: string;
}

export type GeneratePreviewOptions = {
	/**
	 * `obsidian` — `app://` URLs for in-app preview.
	 * `fileExport` — `file://` URLs so Chromium/Electron can load images when printing from disk.
	 */
	assetLinkTarget?: AssetLinkTarget;
};

export async function generatePreview(
	project: ReportProject,
	composer: MarkdownComposer,
	linkResolver: LinkResolver,
	renderer: HtmlRenderer,
	cssTemplateEngine: CssTemplateEngine,
	assetResolver: AssetResolver,
	options?: GeneratePreviewOptions,
): Promise<PreviewBundle> {
	const markdown = await composer.compose(project);
	const resolvedMarkdown = await linkResolver.resolve(project, markdown);
	const exportMarkdown = applyExportMarkdownTransforms(resolvedMarkdown);
	/** Inline `#tags` stay plain text in HTML/PDF (no faux links). DOCX may still style tags separately. */
	let html = await renderer.render(project, exportMarkdown);
	html = ensureHeadingIds(html);
	let innerHtml = html;
	if (project.exportOptions.includeToc) {
		const toc = buildTableOfContentsHtml(html);
		innerHtml = toc ? `${toc}\n<hr class="ra-page-break">\n${html}` : html;
	}
	html = prependCoverHtml(project, innerHtml);
	const numberingMode = mergePrintRules(project.styleTemplate.printRules).headingNumbering;
	html = injectHeadingSectionNumbers(html, numberingMode);
	const assetTarget = options?.assetLinkTarget ?? "obsidian";
	html = await assetResolver.resolveHtmlAssets(project, html, assetTarget);
	const css = cssTemplateEngine.build(project);
	return { markdown: exportMarkdown, html, css };
}

function prependCoverHtml(project: ReportProject, html: string): string {
	if (!project.coverEnabled) return html;

	const cover = project.coverConfig;
	const title = escapeHtml(cover.title || project.name);
	const subtitle = cover.subtitle ? `<p class="ra-cover-subtitle">${escapeHtml(cover.subtitle)}</p>` : "";
	const authors = cover.authors.length
		? `<p class="ra-cover-authors">${escapeHtml(cover.authors.join(", "))}</p>`
		: "";
	const bg = cover.backgroundImagePath
		? `<img class="ra-cover-bg" src="${escapeHtml(cover.backgroundImagePath)}" alt="Cover background">`
		: "";

	const coverHtml = `<section class="ra-cover-page">
${bg}
<div class="ra-cover-content">
<h1 class="ra-cover-title">${title}</h1>
${subtitle}
${authors}
</div>
</section>
<hr class="ra-page-break">`;

	return `${coverHtml}\n${html}`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
