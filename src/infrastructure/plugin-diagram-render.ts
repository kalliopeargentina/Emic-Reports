import { toBlob, toCanvas } from "html-to-image";
import { Component, MarkdownRenderer, type App } from "obsidian";
import {
	contiguousUint8Array,
	isValidPng,
	pngIsSolidNearWhite,
	pngLooksLikeCroppedDiagram,
} from "./binary-image";
import { waitForDomStable } from "./dom-settle";
import { prepareDiagramSvgForRasterExport } from "./svg-inline-styles";
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
	if (l === "mmd") return true;
	if (DIAGRAM_FENCE_LANGS.has(l)) return true;
	if (l.includes("emic") && (l.includes("chart") || l.includes("graph"))) return true;
	return false;
}

function parseFenceOpenerLang(line: string): string {
	const t = line.trim();
	const m = /^(`{3,}|~{3,})\s*(.*)$/.exec(t);
	if (!m) return "";
	const rest = (m[2] ?? "").trim();
	if (!rest) return "";
	return (rest.split(/\s+/)[0] ?? "").replace(/^[{}]+/, "");
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
	const bbox = svg.getBBox();
	const rect = svg.getBoundingClientRect();
	let w = Math.max(bbox.width || 0, rect.width || 0, 1);
	let h = Math.max(bbox.height || 0, rect.height || 0, 1);
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
	const bbox = svg.getBBox();
	let w = bbox.width || Number(svg.getAttribute("width")) || 400;
	let h = bbox.height || Number(svg.getAttribute("height")) || 300;
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

async function acceptDiagramPng(candidate: Uint8Array | null): Promise<Uint8Array | null> {
	if (!candidate || !isValidPng(candidate) || candidate.byteLength < 200) return null;
	if (pngLooksLikeCroppedDiagram(candidate)) return null;
	if (await pngIsSolidNearWhite(candidate)) return null;
	return contiguousUint8Array(candidate);
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
	captureAttempt: 1 | 2 = 1,
): Promise<Uint8Array | null> {
	if (!isPluginDiagramFenceLanguage(language)) return null;

	const md = "```" + language + "\n" + body + "\n```";
	const host = document.createElement("div");
	host.addClass("markdown-preview-view");
	host.addClass("markdown-reading-view");
	host.addClass("markdown-rendered");
	host.style.position = "fixed";
	host.style.visibility = "hidden";
	host.style.left = "-20000px";
	host.style.top = "0";
	host.style.width = `${maxWidthPx}px`;
	host.style.pointerEvents = "none";
	document.body.appendChild(host);

	const sub = new Component();
	parentComponent.addChild(sub);
	try {
		const stableMax = captureAttempt === 1 ? 28_000 : 45_000;
		const svgWaitMax = captureAttempt === 1 ? 26_000 : 40_000;
		const bodyLc = body.toLowerCase();
		const slowMermaidBody =
			bodyLc.includes("gantt") ||
			bodyLc.includes("sequencediagram") ||
			bodyLc.includes("gitgraph") ||
			bodyLc.includes("c4context") ||
			bodyLc.includes("block-beta");
		const mermaidHoldBase =
			language.trim().toLowerCase() === "mermaid" || language.trim().toLowerCase() === "mmd"
				? captureAttempt === 1
					? 650
					: 2_000
				: 0;
		const mermaidSlowExtra = mermaidHoldBase > 0 && slowMermaidBody ? (captureAttempt === 1 ? 900 : 1_800) : 0;
		const mermaidHoldMs = mermaidHoldBase + mermaidSlowExtra;

		await MarkdownRenderer.render(app, md, host, sourcePath, sub);
		await waitForDomStable(host, { stableMs: captureAttempt === 1 ? 450 : 600, maxMs: stableMax });
		await waitForSvgOrCanvasDeep(host, { maxMs: svgWaitMax, intervalMs: 50 });

		const svg = findLargestSvgDeep(host);

		if (mermaidHoldMs > 0) {
			await new Promise<void>((r) => window.setTimeout(r, mermaidHoldMs));
		}

		/** Prefer unmutated host first — html-to-image matches on-screen paint without our style rewrites. */
		const fromHostClean = await rasterizeDiagramHostToPng(host, maxWidthPx);
		const okClean = await acceptDiagramPng(fromHostClean);
		if (okClean) return okClean;

		if (svg) {
			prepareDiagramSvgForRasterExport(svg);
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
		}

		const fromHostPrepared = await rasterizeDiagramHostToPng(host, maxWidthPx);
		const okHost = await acceptDiagramPng(fromHostPrepared);
		if (okHost) return okHost;

		if (svg) {
			const live = await rasterizeLiveSvgToPng(svg, maxWidthPx);
			const okLive = await acceptDiagramPng(live);
			if (okLive) return okLive;

			try {
				const png = await rasterizeSvgToPng(svg, maxWidthPx);
				const ok = await acceptDiagramPng(contiguousUint8Array(png));
				if (ok) return ok;
			} catch {
				/* clone path may fail for some diagrams */
			}
		}

		const canvas = querySelectorDeep(host, "canvas");
		if (canvas instanceof HTMLCanvasElement) {
			const png = await rasterizeCanvasToPng(canvas, maxWidthPx);
			const ok = await acceptDiagramPng(contiguousUint8Array(png));
			if (ok) return ok;
		}
		return null;
	} finally {
		sub.unload();
		host.remove();
	}
}
