import type { ReportProject } from "../domain/report-project";
import type { MarkdownComposer } from "../infrastructure/markdown-composer";
import type { LinkResolver } from "../infrastructure/link-resolver";
import type { HtmlRenderer } from "../infrastructure/html-renderer";
import type { CssTemplateEngine } from "../infrastructure/css-template-engine";
import type { AssetResolver } from "../infrastructure/asset-resolver";

export interface PreviewBundle {
	markdown: string;
	html: string;
	css: string;
}

export async function generatePreview(
	project: ReportProject,
	composer: MarkdownComposer,
	linkResolver: LinkResolver,
	renderer: HtmlRenderer,
	cssTemplateEngine: CssTemplateEngine,
	assetResolver: AssetResolver,
): Promise<PreviewBundle> {
	const markdown = await composer.compose(project);
	const resolvedMarkdown = await linkResolver.resolve(project, markdown);
	let html = await renderer.render(project, resolvedMarkdown);
	html = prependCoverHtml(project, html);
	html = await assetResolver.resolveHtmlAssets(project, html);
	const css = cssTemplateEngine.build(project);
	return { markdown: resolvedMarkdown, html, css };
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
