import { toBlob, toCanvas } from "html-to-image";
import { Component, MarkdownRenderer, type App } from "obsidian";
import {
	contiguousUint8Array,
	isAcceptableDiagramPngRelaxed,
	isValidPng,
	pngIhdrSize,
} from "./binary-image";
import {
	CHART_CANVAS_WAIT_MAX_MS,
	replacePaintedCanvasesWithImages,
	waitForChartCanvasPaint,
} from "./chart-canvas-snapshot";
import { waitForDomStable } from "./dom-settle";
import { prepareDiagramSvgForRasterExport } from "./svg-inline-styles";
import { svgExportDisplayDimensions } from "./svg-export-dims";
import { findLargestSvgDeep, querySelectorDeep, waitForSvgOrCanvasDeep } from "./shadow-dom";

/** Fence languages that Obsidian plugins typically turn into SVG/canvas (not plain code). */
const DIAGRAM_FENCE_LANGS = new Set([
	"mermaid",
	"chart",
	"charts",
	"emic-chart",
	"emic-charts",
	"emic-charts-view",
	"echarts",
	"vega",
	"vega-lite",
	"plantuml",
]);

export function isPluginDiagramFenceLanguage(lang: string): boolean {
	const l = lang.trim().toLowerCase();
	if (!l) return false;
	if (DIAGRAM_FENCE_LANGS.has(l)) return true;
	if (l.includes("emic") && (l.includes("chart") || l.includes("graph"))) return true;
	return false;
}

/** Exported for DOCX / fence instrumentation (must match docx line parsing). */
/** Ant Design Charts fences render to canvas; SVG export grabs wrong layer — use PNG path only. */
export function isEmicChartsCanvasFenceLanguage(language: string): boolean {
	const l = language.trim().toLowerCase();
	return l === "emic-charts-view" || l === "emic-charts" || l === "emic-chart";
}

export function parseFenceOpenerLang(line: string): string {
	const t = line.trim();
	const m = /^(`{3,}|~{3,})\s*(.*)$/.exec(t);
	if (!m) return "";
	const rest = (m[2] ?? "").trim();
	if (!rest) return "";
	return (rest.split(/\s+/)[0] ?? "").replace(/^[{}]+/, "");
}

const DOCX_MERMAID_INIT = "%%{init: {'flowchart': {'htmlLabels': false, 'curve': 'linear'}, 'sequence': {'useMaxWidth': false}}}%%";

/** Must match Emic-Charts-View `manifest.json` id. */
const EMIC_CHARTS_VIEW_PLUGIN_ID = "emic-charts-view";

/** Facade from Emic-Charts-View README — no compile-time dependency on that plugin. */
type EmicChartsViewPluginLike = {
	api?: { exportPngFromElement(root: HTMLElement): Promise<Blob> };
};

/**
 * Same PNG path as Emic-Charts-View "Export to PNG" (plot toDataURL / canvas).
 * Call before replacePaintedCanvasesWithImages — that removes canvases the API needs.
 */
async function tryEmicChartsViewExportPng(app: App, host: HTMLElement): Promise<Uint8Array | null> {
	/** Obsidian `App` typings omit `plugins`; it exists at runtime. */
	const registry = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins
		?.plugins;
	const plug = registry?.[EMIC_CHARTS_VIEW_PLUGIN_ID] as EmicChartsViewPluginLike | undefined;
	const api = plug?.api;
	if (!api || typeof api.exportPngFromElement !== "function") return null;
	try {
		const blob = await api.exportPngFromElement(host);
		if (!blob || blob.size < 200) return null;
		const bytes = new Uint8Array(await blob.arrayBuffer());
		if (!isValidPng(bytes)) return null;
		return contiguousUint8Array(bytes);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.info(
			"[DOCX-export] emic-charts-view api.exportPngFromElement failed: %s",
			e instanceof Error ? e.message : String(e),
		);
		return null;
	}
}

/** Downscale wide chart PNGs to match other diagram raster paths (maxWidthPx). */
async function scalePngBytesToMaxWidth(bytes: Uint8Array, maxWidthPx: number): Promise<Uint8Array> {
	const dim = pngIhdrSize(bytes);
	if (!dim) return bytes;
	const { w, h } = dim;
	if (w <= maxWidthPx) return bytes;
	const scale = maxWidthPx / w;
	const outW = Math.max(1, Math.round(w * scale));
	const outH = Math.max(1, Math.round(h * scale));
	const blob = new Blob([contiguousUint8Array(bytes)], { type: "image/png" });
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("png decode"));
			img.src = url;
		});
		const canvas = document.createElement("canvas");
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext("2d");
		if (!ctx) return bytes;
		ctx.drawImage(img, 0, 0, outW, outH);
		const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png", 1));
		if (!outBlob) return bytes;
		return contiguousUint8Array(new Uint8Array(await outBlob.arrayBuffer()));
	} catch {
		return bytes;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function buildFenceMarkdown(language: string, body: string): string {
	const normalized = language.trim().toLowerCase();
	if (normalized !== "mermaid") {
		return "```" + language + "\n" + body + "\n```";
	}
	const trimmed = body.trimStart();
	const withInit = trimmed.startsWith("%%{init:") ? body : `${DOCX_MERMAID_INIT}\n${body}`;
	return "```" + language + "\n" + withInit + "\n```";
}

/** True if any fenced block uses a language we try to rasterize (Mermaid, charts, …). */
export function markdownHasPluginDiagramFence(markdown: string): boolean {
	const lines = markdown.split("\n");
	let inCodeBlock = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!(trimmed.startsWith("```") || trimmed.startsWith("~~~"))) continue;
		if (inCodeBlock) {
			inCodeBlock = false;
		} else {
			const lang = parseFenceOpenerLang(trimmed);
			if (isPluginDiagramFenceLanguage(lang)) return true;
			inCodeBlock = true;
		}
	}
	return false;
}

/** Serialize the live SVG (with inlined styles) to PNG via canvas — avoids html-to-image SVG child styling gaps. */
async function rasterizeLiveSvgToPng(svg: SVGSVGElement, maxWidthPx: number): Promise<Uint8Array | null> {
	const { w, h } = svgExportDisplayDimensions(svg);
	const scale = w > maxWidthPx ? maxWidthPx / w : 1;
	const outW = Math.max(1, Math.round(w * scale));
	const outH = Math.max(1, Math.round(h * scale));

	const xml = new XMLSerializer().serializeToString(svg);
	const sblob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(sblob);
	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("svg raster"));
			img.src = url;
		});
		const canvas = document.createElement("canvas");
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, outW, outH);
		ctx.drawImage(img, 0, 0, outW, outH);
		const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png", 1));
		if (!outBlob) return null;
		const bytes = new Uint8Array(await outBlob.arrayBuffer());
		if (!isValidPng(bytes)) return null;
		return contiguousUint8Array(bytes);
	} catch {
		return null;
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function rasterizeSvgToPng(svg: SVGSVGElement, maxWidthPx: number): Promise<Uint8Array> {
	let { w, h } = svgExportDisplayDimensions(svg);
	const aw = Number(svg.getAttribute("width"));
	const ah = Number(svg.getAttribute("height"));
	if ((!Number.isFinite(w) || w <= 1) && Number.isFinite(aw) && aw > 0) w = aw;
	if ((!Number.isFinite(h) || h <= 1) && Number.isFinite(ah) && ah > 0) h = ah;
	if (!Number.isFinite(w) || w <= 0) w = 400;
	if (!Number.isFinite(h) || h <= 0) h = 300;
	const scale = w > maxWidthPx ? maxWidthPx / w : 1;
	const outW = Math.max(1, Math.round(w * scale));
	const outH = Math.max(1, Math.round(h * scale));

	const clone = svg.cloneNode(true) as SVGSVGElement;
	clone.setAttribute("width", String(outW));
	clone.setAttribute("height", String(outH));
	const xml = new XMLSerializer().serializeToString(clone);
	const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		await new Promise<void>((res, rej) => {
			img.onload = () => res();
			img.onerror = () => rej(new Error("svg raster"));
			img.src = url;
		});
		const canvas = document.createElement("canvas");
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext("2d");
		if (!ctx) return new Uint8Array();
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, outW, outH);
		ctx.drawImage(img, 0, 0, outW, outH);
		const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
		if (!outBlob) return new Uint8Array();
		return new Uint8Array(await outBlob.arrayBuffer());
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function rasterizeCanvasToPng(canvas: HTMLCanvasElement, maxWidthPx: number): Promise<Uint8Array> {
	let w = canvas.width;
	let h = canvas.height;
	if (!w || !h) {
		const rect = canvas.getBoundingClientRect();
		w = rect.width || 400;
		h = rect.height || 300;
	}
	const scale = w > maxWidthPx ? maxWidthPx / w : 1;
	const outW = Math.max(1, Math.round(w * scale));
	const outH = Math.max(1, Math.round(h * scale));
	const out = document.createElement("canvas");
	out.width = outW;
	out.height = outH;
	const ctx = out.getContext("2d");
	if (!ctx) return new Uint8Array();
	ctx.drawImage(canvas, 0, 0, outW, outH);
	const outBlob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
	if (!outBlob) return new Uint8Array();
	return new Uint8Array(await outBlob.arrayBuffer());
}

function acceptDiagramPng(candidate: Uint8Array | null): Uint8Array | null {
	if (!candidate || !isAcceptableDiagramPngRelaxed(candidate)) return null;
	return candidate;
}

/** After canvas→img swap, draw the largest chart image to PNG (html-to-image fallback). */
async function rasterizeLargestDataUrlImageToPng(
	host: HTMLElement,
	maxWidthPx: number,
): Promise<Uint8Array | null> {
	const imgs = Array.from(host.querySelectorAll('img[src^="data:image"]')) as HTMLImageElement[];
	let best: HTMLImageElement | null = null;
	let bestArea = 0;
	for (const img of imgs) {
		const r = img.getBoundingClientRect();
		const area = Math.max(1, r.width) * Math.max(1, r.height);
		if (area > bestArea && r.width >= 32 && r.height >= 32) {
			bestArea = area;
			best = img;
		}
	}
	if (!best) return null;
	try {
		await (best.decode?.() ?? Promise.resolve());
	} catch {
		/* ignore */
	}
	let w = best.naturalWidth || best.width;
	let h = best.naturalHeight || best.height;
	if (!w || !h) {
		const r = best.getBoundingClientRect();
		w = Math.round(r.width) || 400;
		h = Math.round(r.height) || 300;
	}
	const scale = w > maxWidthPx ? maxWidthPx / w : 1;
	const outW = Math.max(1, Math.round(w * scale));
	const outH = Math.max(1, Math.round(h * scale));
	const canvas = document.createElement("canvas");
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, outW, outH);
	try {
		ctx.drawImage(best, 0, 0, outW, outH);
	} catch {
		return null;
	}
	const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png", 1));
	if (!outBlob) return null;
	const bytes = new Uint8Array(await outBlob.arrayBuffer());
	return isAcceptableDiagramPngRelaxed(bytes) ? contiguousUint8Array(bytes) : null;
}

function pngDimsBrief(candidate: Uint8Array | null): string {
	if (!candidate) return "null";
	const d = pngIhdrSize(candidate);
	return d ? `${d.w}x${d.h}` : "?";
}

/**
 * Whole-host capture via html-to-image (reads live DOM; do not require SVG mutation first).
 */
async function rasterizeDiagramHostToPng(host: HTMLDivElement, maxWidthPx: number): Promise<Uint8Array | null> {
	const prev = {
		visibility: host.style.visibility,
		opacity: host.style.opacity,
	};
	host.style.visibility = "visible";
	host.style.opacity = "1";
	try {
		const rectH = Math.ceil(host.getBoundingClientRect().height);
		const rawH = Math.max(host.scrollHeight, host.offsetHeight, rectH, 120);
		const height = Math.min(4500, rawH);
		const opts = {
			width: maxWidthPx,
			height,
			pixelRatio: 1.25,
			cacheBust: true,
			skipFonts: false,
			backgroundColor: "#ffffff",
		};

		let blob: Blob | null = await toBlob(host, opts);
		let bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
		if (!blob || blob.size < 200 || !isValidPng(bytes)) {
			try {
				const canvas = await toCanvas(host, opts);
				blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
				bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
			} catch {
				return null;
			}
		}

		if (!blob || blob.size < 200 || !isValidPng(bytes)) return null;
		return contiguousUint8Array(bytes);
	} catch {
		return null;
	} finally {
		host.style.visibility = prev.visibility;
		host.style.opacity = prev.opacity;
	}
}

/**
 * Renders a single fenced block via the same pipeline as Reading view so community
 * code-block processors (Mermaid, Emic-Charts-View, etc.) can run.
 * Returns PNG bytes, or null if nothing rasterizable was produced.
 */
export async function renderPluginFenceToPng(
	app: App,
	parentComponent: Component,
	language: string,
	body: string,
	sourcePath: string,
	maxWidthPx = 960,
): Promise<Uint8Array | null> {
	if (!isPluginDiagramFenceLanguage(language)) return null;

	const md = buildFenceMarkdown(language, body);
	const host = document.createElement("div");
	host.addClass("markdown-preview-view");
	host.addClass("markdown-reading-view");
	host.addClass("markdown-rendered");
	host.style.position = "fixed";
	host.style.visibility = "visible";
	host.style.opacity = "0";
	host.style.left = "-20000px";
	host.style.top = "0";
	host.style.width = `${maxWidthPx}px`;
	host.style.pointerEvents = "none";
	document.body.appendChild(host);

	const sub = new Component();
	parentComponent.addChild(sub);
	try {
		await MarkdownRenderer.render(app, md, host, sourcePath, sub);
		await waitForDomStable(host, { stableMs: 450, maxMs: 25000 });
		await waitForSvgOrCanvasDeep(host, { maxMs: 20000, intervalMs: 50 });

		if (isEmicChartsCanvasFenceLanguage(language)) {
			await waitForChartCanvasPaint(host, CHART_CANVAS_WAIT_MAX_MS);
			const fromEmicApi = await tryEmicChartsViewExportPng(app, host);
			if (fromEmicApi) {
				const scaled = await scalePngBytesToMaxWidth(fromEmicApi, maxWidthPx);
				const okApi = acceptDiagramPng(scaled);
				if (okApi) {
					// eslint-disable-next-line no-console
					console.info(
						"[DOCX-export] emic-charts-view API PNG bytes=%d dims=%s",
						okApi.byteLength,
						pngDimsBrief(okApi),
					);
					return okApi;
				}
			}
			replacePaintedCanvasesWithImages(host);
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
		}

		const svg = findLargestSvgDeep(host);
		if (svg) {
			prepareDiagramSvgForRasterExport(svg);
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
		}

		const fromHostPrepared = await rasterizeDiagramHostToPng(host, maxWidthPx);
		const okHost = acceptDiagramPng(fromHostPrepared);
		if (okHost) return okHost;
		// eslint-disable-next-line no-console
		console.info(
			"[DOCX-fallback] reject host-prepared bytes=%d dims=%s",
			fromHostPrepared?.byteLength ?? 0,
			pngDimsBrief(fromHostPrepared),
		);

		if (svg) {
			const live = await rasterizeLiveSvgToPng(svg, maxWidthPx);
			const okLive = acceptDiagramPng(live);
			if (okLive) return okLive;
			// eslint-disable-next-line no-console
			console.info(
				"[DOCX-fallback] reject live-svg bytes=%d dims=%s",
				live?.byteLength ?? 0,
				pngDimsBrief(live),
			);

			try {
				const png = await rasterizeSvgToPng(svg, maxWidthPx);
				const ok = acceptDiagramPng(contiguousUint8Array(png));
				if (ok) return ok;
				// eslint-disable-next-line no-console
				console.info(
					"[DOCX-fallback] reject cloned-svg bytes=%d dims=%s",
					png.byteLength,
					pngDimsBrief(png),
				);
			} catch {
				/* clone path may fail for some diagrams */
			}
		}

		/** Host capture last: html-to-image + foreignObject is often unreliable for Mermaid labels. */
		const fromHostClean = await rasterizeDiagramHostToPng(host, maxWidthPx);
		const okClean = acceptDiagramPng(fromHostClean);
		if (okClean) return okClean;
		// eslint-disable-next-line no-console
		console.info(
			"[DOCX-fallback] reject host-clean bytes=%d dims=%s",
			fromHostClean?.byteLength ?? 0,
			pngDimsBrief(fromHostClean),
		);

		const canvas = querySelectorDeep(host, "canvas");
		if (canvas instanceof HTMLCanvasElement) {
			const png = await rasterizeCanvasToPng(canvas, maxWidthPx);
			const ok = acceptDiagramPng(contiguousUint8Array(png));
			if (ok) return ok;
			// eslint-disable-next-line no-console
			console.info(
				"[DOCX-fallback] reject canvas bytes=%d dims=%s",
				png.byteLength,
				pngDimsBrief(png),
			);
		}

		const fromChartImg = await rasterizeLargestDataUrlImageToPng(host, maxWidthPx);
		if (fromChartImg) return fromChartImg;

		return null;
	} finally {
		sub.unload();
		host.remove();
	}
}

export async function renderPluginFenceToSvg(
	app: App,
	parentComponent: Component,
	language: string,
	body: string,
	sourcePath: string,
	maxWidthPx = 960,
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
	if (!isPluginDiagramFenceLanguage(language)) return null;
	/** Canvas charts: never embed SVG (misleading bbox / decorative svg). DOCX uses PNG path. */
	if (isEmicChartsCanvasFenceLanguage(language)) return null;

	const md = buildFenceMarkdown(language, body);
	const host = document.createElement("div");
	host.addClass("markdown-preview-view");
	host.addClass("markdown-reading-view");
	host.addClass("markdown-rendered");
	host.style.position = "fixed";
	host.style.visibility = "visible";
	host.style.opacity = "0";
	host.style.left = "-20000px";
	host.style.top = "0";
	host.style.width = `${maxWidthPx}px`;
	host.style.pointerEvents = "none";
	document.body.appendChild(host);

	const sub = new Component();
	parentComponent.addChild(sub);
	try {
		await MarkdownRenderer.render(app, md, host, sourcePath, sub);
		await waitForDomStable(host, { stableMs: 450, maxMs: 25000 });
		await waitForSvgOrCanvasDeep(host, { maxMs: 20000, intervalMs: 50 });

		let svg: SVGSVGElement | null = null;
		const mermaidSvg = querySelectorDeep(host, ".mermaid svg");
		if (mermaidSvg instanceof SVGSVGElement) {
			svg = mermaidSvg;
		}
		if (!svg) {
			svg = findLargestSvgDeep(host);
		}
		if (!svg) return null;
		prepareDiagramSvgForRasterExport(svg);
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);

		const dims = svgExportDisplayDimensions(svg);
		const srcW = dims.w;
		const srcH = dims.h;
		const scale = srcW > maxWidthPx ? maxWidthPx / srcW : 1;
		const width = Math.max(1, Math.round(srcW * scale));
		const height = Math.max(1, Math.round(srcH * scale));

		const clone = svg.cloneNode(true) as SVGSVGElement;
		clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		if (!clone.getAttribute("viewBox")) {
			clone.setAttribute("viewBox", `0 0 ${srcW} ${srcH}`);
		}
		clone.setAttribute("width", String(width));
		clone.setAttribute("height", String(height));

		const xml = new XMLSerializer().serializeToString(clone);
		const data = new TextEncoder().encode(xml);
		return { data: contiguousUint8Array(data), width, height };
	} finally {
		sub.unload();
		host.remove();
	}
}
