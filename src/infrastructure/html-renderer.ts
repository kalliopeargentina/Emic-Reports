import { MarkdownRenderer, type Component, type App } from "obsidian";
import type { ReportProject } from "../domain/report-project";

export class HtmlRenderer {
	constructor(
		private app: App,
		private component: Component,
	) {}

	async render(_project: ReportProject, markdown: string): Promise<string> {
		const host = document.createElement("div");
		host.addClass("ra-preview-root");
		await MarkdownRenderer.render(this.app, markdown, host, "", this.component);

		// Allow async renderers (mermaid/mathjax) to settle.
		await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 80));

		return host.innerHTML;
	}
}
