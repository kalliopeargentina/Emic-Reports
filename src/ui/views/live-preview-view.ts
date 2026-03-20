import { MarkdownRenderer, type Component, type App } from "obsidian";
import type { ReportProject } from "../../domain/report-project";
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

		const body = frame.createDiv({ cls: "ra-render-frame" });
		await MarkdownRenderer.render(this.app, markdown, body, "", this.component);
	}
}
