import { Component, MarkdownRenderer, type App } from "obsidian";
import { getPrimaryMarkdownSourcePath, type ReportProject } from "../domain/report-project";
import { waitForDomStable } from "./dom-settle";
import { markdownHasPluginDiagramFence } from "./plugin-diagram-render";
import { serializeElementHtml, waitForSvgOrCanvasDeep } from "./shadow-dom";

/**
 * Content width for off-screen render so Mermaid / layout engines get a real line width
 * (detached or 0-width hosts often never paint diagrams).
 */
const OFFSCREEN_RENDER_WIDTH_PX = 900;

export class HtmlRenderer {
	constructor(
		private app: App,
		private component: Component,
	) {}

	async render(project: ReportProject, markdown: string): Promise<string> {
		const sourcePath = getPrimaryMarkdownSourcePath(project);
		const host = document.createElement("div");
		host.addClass("ra-preview-root");
		/** Match Reading/Preview so Obsidian + plugin processors (Mermaid, charts) apply */
		host.addClass("markdown-preview-view");
		host.addClass("markdown-reading-view");
		host.addClass("markdown-rendered");

		host.style.position = "fixed";
		host.style.left = "-99999px";
		host.style.top = "0";
		host.style.width = `${OFFSCREEN_RENDER_WIDTH_PX}px`;
		host.style.visibility = "hidden";
		host.style.pointerEvents = "none";
		document.body.appendChild(host);

		const sub = new Component();
		this.component.addChild(sub);
		try {
			await MarkdownRenderer.render(this.app, markdown, host, sourcePath, sub);
			await waitForDomStable(host, { stableMs: 400, maxMs: 30000 });
			if (markdownHasPluginDiagramFence(markdown)) {
				await waitForSvgOrCanvasDeep(host, { maxMs: 20000, intervalMs: 50 });
			}
			return serializeElementHtml(host);
		} finally {
			sub.unload();
			host.remove();
		}
	}
}
