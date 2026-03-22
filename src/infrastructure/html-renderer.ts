import { Component, MarkdownRenderer, type App } from "obsidian";
import { mergeStyleTokens } from "../domain/style-template";
import { getPrimaryMarkdownSourcePath, type ReportProject } from "../domain/report-project";
import {
	CHART_CANVAS_WAIT_MAX_MS,
	revealOffscreenHostForCanvasReadback,
	replacePaintedCanvasesWithImages,
	waitForChartCanvasPaint,
} from "./chart-canvas-snapshot";
import { replaceEmicPlotHostsWithApiImages } from "./emic-charts-view-bridge";
import { waitForDomStable } from "./dom-settle";
import {
	markdownHasEmicChartsCanvasFence,
	markdownHasPluginDiagramFence,
} from "./plugin-diagram-render";
import {
	markdownLikelyHasMath,
	replaceMathWithRasterImages,
	waitForMathLayout,
} from "./math-export";
import {
	expandDetailsElementsForExport,
	normalizeThematicBreakElementsForExport,
	stripCodeBlockChromeForExport,
} from "./html-export-sanitize";
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
			if (markdownHasEmicChartsCanvasFence(markdown)) {
				await waitForChartCanvasPaint(host, CHART_CANVAS_WAIT_MAX_MS);
				const apiSwap = await replaceEmicPlotHostsWithApiImages(this.app, host, {
					logPrefix: "[HTML-preview]",
				});
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
					"[HTML-preview][emic-charts] api plotHosts=%d/%d canvases=%d painted=%d errorLikeNodes=%d",
					apiSwap.replaced,
					apiSwap.total,
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
			if (markdownLikelyHasMath(markdown)) {
				await revealOffscreenHostForCanvasReadback(host);
				await waitForMathLayout(host, 16000, true);
				const t = mergeStyleTokens(project.styleTemplate.tokens);
				const mathScaleBlend = Math.max(t.mathInlineScalePercent, t.mathDisplayScalePercent) / 100;
				const mathMaxW = Math.max(
					240,
					Math.round(OFFSCREEN_RENDER_WIDTH_PX * Math.max(0.4, Math.min(1.5, mathScaleBlend))),
				);
				const mathSwap = await replaceMathWithRasterImages(host, mathMaxW, {
					inkColor: t.mathExportColor,
					mathBodyFontSizePt: t.fontSizeBody,
					mathInlineScalePercent: t.mathInlineScalePercent,
					mathDisplayScalePercent: t.mathDisplayScalePercent,
					layoutTokens: t,
				});
				// eslint-disable-next-line no-console
				console.info("[HTML-preview][math] rasterized nodes=%d", mathSwap.replaced);
			}
			stripCodeBlockChromeForExport(host);
			normalizeThematicBreakElementsForExport(host);
			expandDetailsElementsForExport(host);
			return serializeElementHtml(host);
		} finally {
			sub.unload();
			host.remove();
		}
	}
}
