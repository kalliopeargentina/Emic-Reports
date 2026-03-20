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
const PREVIEW_CHART_WAIT_MAX_MS = 5000;

function countFencesByLang(markdown: string, lang: string): number {
	const lowerLang = lang.trim().toLowerCase();
	if (!lowerLang) return 0;
	const lines = markdown.split("\n");
	let inFence = false;
	let count = 0;
	for (const line of lines) {
		const t = line.trim();
		if (!(t.startsWith("```") || t.startsWith("~~~"))) continue;
		if (inFence) {
			inFence = false;
			continue;
		}
		inFence = true;
		const rest = t.replace(/^(`{3,}|~{3,})\s*/, "").trim();
		const cur = (rest.split(/\s+/)[0] ?? "").replace(/^[{}]+/, "").toLowerCase();
		if (cur === lowerLang) count += 1;
	}
	return count;
}

async function waitForChartCanvasPaint(host: HTMLElement, maxMs: number): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < maxMs) {
		const canvases = Array.from(host.querySelectorAll("canvas")) as HTMLCanvasElement[];
		let painted = 0;
		for (const c of canvases) {
			const w = c.width || Math.round(c.getBoundingClientRect().width);
			const h = c.height || Math.round(c.getBoundingClientRect().height);
			if (w < 64 || h < 64) continue;
			try {
				// A painted chart produces a significantly larger data URL than a blank tiny canvas.
				const url = c.toDataURL("image/png");
				if (url.length > 3000) painted += 1;
			} catch {
				/* ignore tainted/unsupported canvases */
			}
		}
		if (painted > 0) return;
		await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
	}
}

function replacePaintedCanvasesWithImages(host: HTMLElement): { replaced: number; total: number } {
	const canvases = Array.from(host.querySelectorAll("canvas")) as HTMLCanvasElement[];
	let replaced = 0;
	for (const canvas of canvases) {
		let dataUrl = "";
		try {
			dataUrl = canvas.toDataURL("image/png");
		} catch {
			continue;
		}
		if (!dataUrl || dataUrl.length < 3000) continue;
		const rect = canvas.getBoundingClientRect();
		const cssW = Math.max(1, Math.round(rect.width || canvas.width || 1));
		const cssH = Math.max(1, Math.round(rect.height || canvas.height || 1));
		const img = document.createElement("img");
		img.src = dataUrl;
		img.width = cssW;
		img.height = cssH;
		img.alt = "chart";
		img.style.display = "block";
		img.style.width = `${cssW}px`;
		img.style.height = `${cssH}px`;
		canvas.replaceWith(img);
		replaced += 1;
	}
	return { replaced, total: canvases.length };
}

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
		host.style.visibility = "visible";
		host.style.opacity = "0";
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
			const emicFenceCount = countFencesByLang(markdown, "emic-charts-view");
			if (emicFenceCount > 0) {
				await waitForChartCanvasPaint(host, PREVIEW_CHART_WAIT_MAX_MS);
				const canvases = Array.from(host.querySelectorAll("canvas")) as HTMLCanvasElement[];
				const painted = canvases.filter((c) => {
					try {
						return c.toDataURL("image/png").length > 3000;
					} catch {
						return false;
					}
				}).length;
				const errorNodes = Array.from(host.querySelectorAll("div, span, p, pre, code")).filter((n) =>
					/(error|failed|exception|invalid|cannot|chart)/i.test(n.textContent ?? ""),
				).length;
				// eslint-disable-next-line no-console
				console.info(
					"[HTML-preview][emic-charts] fences=%d canvases=%d painted=%d errorLikeNodes=%d",
					emicFenceCount,
					canvases.length,
					painted,
					errorNodes,
				);
				const swap = replacePaintedCanvasesWithImages(host);
				// eslint-disable-next-line no-console
				console.info(
					"[HTML-preview][emic-charts] canvas->img replaced=%d total=%d",
					swap.replaced,
					swap.total,
				);
			}
			return serializeElementHtml(host);
		} finally {
			sub.unload();
			host.remove();
		}
	}
}
