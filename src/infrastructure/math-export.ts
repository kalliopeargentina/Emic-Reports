/**
 * Export math (MathJax / Obsidian) as raster images for DOCX, PDF, and serialized HTML.
 * Preview uses live DOM; print/DOCX need pixels or Office Math (we use PNG for broad compatibility).
 */

import { toBlob } from "html-to-image";
import { Component, MarkdownRenderer, type App } from "obsidian";
import {
	contiguousUint8Array,
	isAcceptableMathPng,
	isValidPng,
	pngUint8ArrayToDataUrl,
} from "./binary-image";
import { revealOffscreenHostForCanvasReadback } from "./chart-canvas-snapshot";
import { waitForDomStable } from "./dom-settle";

const MATH_LAYOUT_STABLE_TICKS = 4;
const MATH_WAIT_SLICE_MS = 90;

const MATH_RASTER_PAD_X = 24;
const MATH_RASTER_PAD_Y_MIN = 36;
const MATH_RASTER_PAD_Y_FRAC = 0.22;

/**
 * Inline math: capture `mjx-math`, not `mjx-container` (container often spans a huge box with
 * the glyph in the corner — same bug as using scrollWidth for width).
 */
const MATH_RASTER_PAD_X_INLINE = 4;
const MATH_RASTER_PAD_Y_MIN_INLINE = 4;
const MATH_RASTER_PAD_Y_FRAC_INLINE = 0.08;

const DEFAULT_MATH_INK = "#0a0a0a";

export type MathRasterOptions = {
	/** CSS color for typeset math when baking to PNG (from style template `mathExportColor`). */
	inkColor?: string;
	/**
	 * When true, measure from `mjx-math` (tight glyph box) instead of full-line `scrollWidth`.
	 * Used for inline `$...$`; display `$$` / `math-block` should omit this or set false.
	 */
	inline?: boolean;
};

function resolveMathInkColor(inkColor: string | undefined): string {
	const raw = inkColor?.trim();
	if (raw && (/^#[0-9A-Fa-f]{3,8}$/.test(raw) || /^rgb\s*\(/i.test(raw) || /^rgba\s*\(/i.test(raw))) {
		return raw;
	}
	return DEFAULT_MATH_INK;
}

/**
 * MathJax + Obsidian use theme grays; raster capture keeps them literally.
 * Temporarily force template ink color; invoke returned restore() after capture.
 */
function applyMathExportRasterStyling(root: HTMLElement, ink: string): () => void {
	const restores: Array<() => void> = [];
	const setStyle = (el: HTMLElement, prop: string, value: string, priority?: string) => {
		const prev = el.style.getPropertyValue(prop);
		const prevPri = el.style.getPropertyPriority(prop);
		el.style.setProperty(prop, value, priority ?? "");
		restores.push(() => {
			if (prev) el.style.setProperty(prop, prev, prevPri);
			else el.style.removeProperty(prop);
		});
	};

	const visit = (node: Element) => {
		if (node instanceof HTMLElement) {
			setStyle(node, "color", ink, "important");
			setStyle(node, "opacity", "1", "important");
			for (const v of ["--text-normal", "--text-muted", "--text-faint", "--text-accent"]) {
				setStyle(node, v, ink, "important");
			}
		}
		if (node instanceof SVGElement) {
			const fill = node.getAttribute("fill");
			const stroke = node.getAttribute("stroke");
			const tag = node.tagName.toLowerCase();
			if (fill && fill !== "none" && (fill === "currentColor" || fill.startsWith("var("))) {
				const prevF = fill;
				node.setAttribute("fill", ink);
				restores.push(() => node.setAttribute("fill", prevF));
			} else if (!fill || fill === "none") {
				if (tag === "path" || tag === "text" || tag === "rect" || tag === "line") {
					const had = node.hasAttribute("fill");
					const prevF = node.getAttribute("fill");
					node.setAttribute("fill", ink);
					restores.push(() => {
						if (had && prevF !== null) node.setAttribute("fill", prevF);
						else node.removeAttribute("fill");
					});
				}
			}
			if (stroke && stroke !== "none") {
				const prevS = stroke;
				node.setAttribute("stroke", ink);
				restores.push(() => node.setAttribute("stroke", prevS));
			}
		}
		for (const c of Array.from(node.children)) {
			visit(c);
		}
	};

	const prevOverflow = root.style.overflow;
	const prevMaxH = root.style.maxHeight;
	root.style.overflow = "visible";
	root.style.maxHeight = "none";
	restores.push(() => {
		root.style.overflow = prevOverflow;
		root.style.maxHeight = prevMaxH;
	});

	visit(root);

	return () => {
		for (let i = restores.length - 1; i >= 0; i--) {
			restores[i]!();
		}
	};
}

/** Heuristic: display `$$` and/or inline `$...$` (not `$$`). */
export function markdownLikelyHasMath(markdown: string): boolean {
	if (markdown.includes("$$")) return true;
	if (/(^|[^$])\$(?!\$)([^\n$]+)\$(?!\$)/.test(markdown)) return true;
	return false;
}

function countMathNodes(host: HTMLElement): number {
	return (
		host.querySelectorAll("math-block").length +
		host.querySelectorAll("mjx-container").length +
		host.querySelectorAll(".math").length
	);
}

/**
 * Wait for MathJax (or similar) to insert nodes. If `expectContent`, keep polling while count is 0.
 */
export async function waitForMathLayout(
	host: HTMLElement,
	maxMs: number,
	expectContent: boolean,
): Promise<void> {
	const start = Date.now();
	let stable = 0;
	let last = -1;
	while (Date.now() - start < maxMs) {
		const n = countMathNodes(host);
		if (expectContent && n === 0) {
			await new Promise<void>((r) => window.setTimeout(r, MATH_WAIT_SLICE_MS));
			continue;
		}
		if (n === last) stable += 1;
		else stable = 0;
		last = n;
		if (stable >= MATH_LAYOUT_STABLE_TICKS) return;
		await new Promise<void>((r) => window.setTimeout(r, MATH_WAIT_SLICE_MS));
	}
}

async function rasterizeMathElement(
	el: HTMLElement,
	maxWidthPx: number,
	options?: MathRasterOptions,
): Promise<Uint8Array | null> {
	const ink = resolveMathInkColor(options?.inkColor);
	const inline = options?.inline === true;
	const innerMath = inline ? (el.querySelector("mjx-math") as HTMLElement | null) : null;
	/** Element passed to `toBlob` — must match size we compute (inline ≠ full `mjx-container`). */
	const captureEl = inline && innerMath ? innerMath : el;

	const prevCapture = {
		opacity: captureEl.style.opacity,
		visibility: captureEl.style.visibility,
		overflow: captureEl.style.overflow,
		maxHeight: captureEl.style.maxHeight,
	};
	const prevOuter =
		captureEl !== el
			? {
					opacity: el.style.opacity,
					visibility: el.style.visibility,
					overflow: el.style.overflow,
					maxHeight: el.style.maxHeight,
				}
			: null;

	captureEl.style.opacity = "1";
	captureEl.style.visibility = "visible";
	captureEl.style.overflow = "visible";
	captureEl.style.maxHeight = "none";
	if (prevOuter) {
		el.style.opacity = "1";
		el.style.visibility = "visible";
		el.style.overflow = "visible";
		el.style.maxHeight = "none";
	}
	void el.offsetHeight;
	void captureEl.offsetHeight;
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});

	const restoreColors = applyMathExportRasterStyling(captureEl, ink);
	void captureEl.offsetHeight;

	try {
		let wContent: number;
		let hContent: number;
		let padX: number;
		let padY: number;
		if (inline) {
			void captureEl.offsetHeight;
			const r = captureEl.getBoundingClientRect();
			/** Do not use `scrollHeight` — MathJax nodes often report a tall scroll box with little ink. */
			wContent = Math.max(2, Math.ceil(r.width));
			hContent = Math.max(2, Math.ceil(r.height));
			padX = MATH_RASTER_PAD_X_INLINE;
			padY = Math.max(
				MATH_RASTER_PAD_Y_MIN_INLINE,
				Math.ceil(hContent * MATH_RASTER_PAD_Y_FRAC_INLINE),
			);
		} else {
			const rect = el.getBoundingClientRect();
			wContent = Math.max(rect.width, el.scrollWidth, el.offsetWidth, 24);
			hContent = Math.max(rect.height, el.scrollHeight, el.offsetHeight, 20);
			padX = MATH_RASTER_PAD_X;
			padY = Math.max(MATH_RASTER_PAD_Y_MIN, Math.ceil(hContent * MATH_RASTER_PAD_Y_FRAC));
		}
		let w = Math.ceil(wContent + padX * 2);
		let h = Math.ceil(hContent + padY * 2);
		w = Math.min(w, maxWidthPx + padX * 2);
		h = Math.min(h, 4800);

		const blob = await toBlob(captureEl, {
			width: w,
			height: h,
			pixelRatio: 2,
			backgroundColor: "#ffffff",
			cacheBust: true,
			skipFonts: false,
			style: {
				overflow: "visible",
				maxHeight: "none",
			},
		});
		if (!blob || blob.size < 80) return null;
		const bytes = new Uint8Array(await blob.arrayBuffer());
		if (!isValidPng(bytes) || !isAcceptableMathPng(bytes)) return null;
		return contiguousUint8Array(bytes);
	} catch {
		return null;
	} finally {
		restoreColors();
		captureEl.style.opacity = prevCapture.opacity;
		captureEl.style.visibility = prevCapture.visibility;
		captureEl.style.overflow = prevCapture.overflow;
		captureEl.style.maxHeight = prevCapture.maxHeight;
		if (prevOuter) {
			el.style.opacity = prevOuter.opacity;
			el.style.visibility = prevOuter.visibility;
			el.style.overflow = prevOuter.overflow;
			el.style.maxHeight = prevOuter.maxHeight;
		}
	}
}

/** Top-level `mjx-container` nodes (not nested inside another mjx-container). */
function rootMjxContainers(host: HTMLElement): HTMLElement[] {
	const all = Array.from(host.querySelectorAll("mjx-container")) as HTMLElement[];
	return all.filter((el) => el.parentElement?.tagName !== "MJX-CONTAINER");
}

/**
 * Replace `math-block` and root `mjx-container` nodes with `<img data:image/png>`.
 * Call after `revealOffscreenHostForCanvasReadback` on the same host.
 */
export async function replaceMathWithRasterImages(
	host: HTMLElement,
	maxWidthPx: number,
	options?: MathRasterOptions,
): Promise<{ replaced: number }> {
	let replaced = 0;

	const mathBlocks = Array.from(host.querySelectorAll("math-block")) as HTMLElement[];
	for (const block of mathBlocks) {
		if (!block.isConnected) continue;
		const png = await rasterizeMathElement(block, maxWidthPx, { ...options, inline: false });
		if (!png) continue;
		const dataUrl = pngUint8ArrayToDataUrl(png);
		const img = document.createElement("img");
		img.src = dataUrl;
		img.alt = "math";
		img.className = "ra-math-export-img";
		img.style.display = "block";
		img.style.margin = "0.75em auto";
		img.style.maxWidth = "100%";
		block.replaceWith(img);
		replaced += 1;
	}

	for (const mjx of rootMjxContainers(host)) {
		if (!mjx.isConnected) continue;
		if (mjx.closest(".ra-math-export-img")) continue;
		const png = await rasterizeMathElement(mjx, maxWidthPx, { ...options, inline: true });
		if (!png) continue;
		const dataUrl = pngUint8ArrayToDataUrl(png);
		const img = document.createElement("img");
		img.src = dataUrl;
		img.alt = "math";
		img.className = "ra-math-export-img";
		img.style.display = "inline-block";
		img.style.verticalAlign = "middle";
		img.style.maxWidth = "100%";
		mjx.replaceWith(img);
		replaced += 1;
	}

	return { replaced };
}

const OFFSCREEN_MATH_HOST_STYLES = {
	position: "fixed" as const,
	left: "-20000px",
	top: "0",
	pointerEvents: "none" as const,
	visibility: "visible" as const,
	opacity: "0",
};

/**
 * Render display math only (`$$ ... $$` body) and return PNG bytes for DOCX.
 */
export async function renderDisplayMathMarkdownToPng(
	app: App,
	parentComponent: Component,
	latex: string,
	sourcePath: string,
	maxWidthPx: number,
	options?: MathRasterOptions,
): Promise<Uint8Array | null> {
	const body = latex.trim();
	if (!body) return null;
	const md = `\n\n$$\n${body}\n$$\n\n`;
	const host = document.createElement("div");
	host.addClass("markdown-preview-view");
	host.addClass("markdown-reading-view");
	host.addClass("markdown-rendered");
	Object.assign(host.style, OFFSCREEN_MATH_HOST_STYLES);
	host.style.width = `${maxWidthPx}px`;
	document.body.appendChild(host);

	const sub = new Component();
	parentComponent.addChild(sub);
	try {
		await MarkdownRenderer.render(app, md, host, sourcePath, sub);
		await waitForDomStable(host, { stableMs: 350, maxMs: 20000 });
		await revealOffscreenHostForCanvasReadback(host);
		await waitForMathLayout(host, 15000, true);

		let target: HTMLElement | null = host.querySelector("math-block");
		if (!target) {
			const roots = rootMjxContainers(host);
			target = roots[0] ?? null;
		}
		if (!target) return null;
		return await rasterizeMathElement(target, maxWidthPx, { ...options, inline: false });
	} finally {
		sub.unload();
		host.remove();
	}
}

/**
 * Render a single inline math span (`$...$` body, without delimiters) and return PNG bytes for DOCX / previews.
 */
export async function renderInlineMathMarkdownToPng(
	app: App,
	parentComponent: Component,
	latex: string,
	sourcePath: string,
	maxWidthPx: number,
	options?: MathRasterOptions,
): Promise<Uint8Array | null> {
	const body = latex.trim();
	if (!body) return null;
	/** Short line so `mjx` is inline, not display. */
	const md = `\n\nx $${body}$ y\n\n`;
	const host = document.createElement("div");
	host.addClass("markdown-preview-view");
	host.addClass("markdown-reading-view");
	host.addClass("markdown-rendered");
	Object.assign(host.style, OFFSCREEN_MATH_HOST_STYLES);
	host.style.width = `${maxWidthPx}px`;
	document.body.appendChild(host);

	const sub = new Component();
	parentComponent.addChild(sub);
	try {
		await MarkdownRenderer.render(app, md, host, sourcePath, sub);
		await waitForDomStable(host, { stableMs: 350, maxMs: 20000 });
		await revealOffscreenHostForCanvasReadback(host);
		await waitForMathLayout(host, 15000, true);

		const roots = rootMjxContainers(host);
		const target = roots[0] ?? null;
		if (!target) return null;
		return await rasterizeMathElement(target, maxWidthPx, { ...options, inline: true });
	} finally {
		sub.unload();
		host.remove();
	}
}
