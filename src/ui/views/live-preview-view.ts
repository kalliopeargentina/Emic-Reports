import { MarkdownRenderer, type Component, type App } from "obsidian";
import type { ReportProject } from "../../domain/report-project";
import { getPrimaryMarkdownSourcePath } from "../../infrastructure/primary-source-path";
import { waitForDomStable } from "../../infrastructure/dom-settle";
import { markdownHasPluginDiagramFence } from "../../infrastructure/plugin-diagram-render";
import { waitForSvgOrCanvasDeep } from "../../infrastructure/shadow-dom";
import { PageSizeResolver } from "../../infrastructure/page-size-resolver";

export class LivePreviewView {
	private pageSizeResolver = new PageSizeResolver();

	constructor(
		private app: App,
		private component: Component,
		private container: HTMLElement,
	) {}

	async render(project: ReportProject, markdown: string): Promise<void> {
		this.container.empty();
		this.container.addClass("ra-live-preview");
		const pageSize = this.pageSizeResolver.resolve(project);
		const frame = this.container.createDiv({ cls: "ra-paper-frame" });
		frame.style.width = pageSize.width;
		frame.style.minHeight = pageSize.height;
		frame.style.setProperty("--ra-font-body", project.styleTemplate.tokens.fontBody);
		frame.style.setProperty("--ra-font-heading", project.styleTemplate.tokens.fontHeading);
		frame.style.setProperty("--ra-font-mono", project.styleTemplate.tokens.fontMono);
		frame.style.setProperty("--ra-text", project.styleTemplate.tokens.colorText);
		frame.style.setProperty("--ra-body-size", `${project.styleTemplate.tokens.fontSizeBody}pt`);
		frame.style.setProperty(
			"--ra-body-line-height",
			String(project.styleTemplate.tokens.lineHeightBody),
		);
		frame.style.setProperty("--ra-p-spacing", `${project.styleTemplate.tokens.paragraphSpacing}px`);
		frame.style.setProperty("--ra-section-spacing", `${project.styleTemplate.tokens.sectionSpacing}px`);

		const body = frame.createDiv({
			cls: "ra-render-frame markdown-preview-view markdown-reading-view markdown-rendered",
		});
		const sourcePath = getPrimaryMarkdownSourcePath(project, this.app);
		await MarkdownRenderer.render(this.app, markdown, body, sourcePath, this.component);
		await waitForDomStable(body, { stableMs: 400, maxMs: 30000 });
		if (markdownHasPluginDiagramFence(markdown)) {
			await waitForSvgOrCanvasDeep(body, { maxMs: 20000, intervalMs: 50 });
		}
	}
}
