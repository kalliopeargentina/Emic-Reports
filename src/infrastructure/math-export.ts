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
import { MATH_RASTER_PIXEL_RATIO } from "./math-export-sizing";

const MATH_LAYOUT_STABLE_TICKS = 4;
const MATH_WAIT_SLICE_MS = 90;

/** Fallback when measuring full `el` (no `mjx-math`); keep moderate — huge values caused dead space. */
const MATH_RASTER_PAD_X = 16;
const MATH_RASTER_PAD_Y_MIN = 12;
const MATH_RASTER_PAD_Y_FRAC = 0.08;

/** Tight capture on `mjx-math` (DOCX/PDF): small symmetric pad — ink bbox handles most margin. */
const MATH_RASTER_PAD_X_MJX = 8;
const MATH_RASTER_PAD_Y_MIN_MJX = 6;
const MATH_RASTER_PAD_Y_FRAC_MJX = 0.06;
/** Extra px below SVG ink when using `getBBox()` (descenders / anti-aliasing). */
const MATH_RASTER_INK_PAD_V = 6;

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
	 * Inline vs display affects font size and padding; **both** modes prefer capturing
	 * `mjx-math` when present so the PNG is not full-column width with empty margins.
	 */
	inline?: boolean;
	/**
	 * Absolute `font-size` in **pt** on `mjx-math` before capture (body pt × scale / 100).
	 * Preferred over legacy percent — `%` was relative to inconsistent parents and often looked unchanged.
	 */
	mathFontSizePt?: number;
	/**
	 * Body font size (pt) from the style template. Used with `mathInlineScalePercent` /
	 * `mathDisplayScalePercent` in `replaceMathWithRasterImages` to compute pt when rasterizing.
	 */
	mathBodyFontSizePt?: number;
	/** Template scale for inline math (PDF/HTML replace path). */
	mathInlineScalePercent?: number;
	/** Template scale for display math (PDF/HTML replace path). */
	mathDisplayScalePercent?: number;
	/**
	 * @deprecated Legacy: interpreted as % of `mathBodyFontSizePt` when `mathFontSizePt` is absent.
	 */
	mathFontSizePercent?: number;
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

/** Apply template `font-size: Npt` to `mjx-math` under the capture root before rasterizing. */
function applyMathJaxFontSizePtToCaptureRoot(root: HTMLElement, sizePt: number | undefined): () => void {
	if (sizePt == null || !Number.isFinite(sizePt) || sizePt <= 0) return () => {};
	const mathel = root.querySelectorAll("mjx-math");
	const list: HTMLElement[] =
		mathel.length > 0 ? (Array.from(mathel) as HTMLElement[]) : [root];
	const snapshots = list.map((el) => ({
		el,
		fontSize: el.style.fontSize,
		priority: el.style.getPropertyPriority("font-size"),
	}));
	for (const { el } of snapshots) {
		el.style.setProperty("font-size", `${sizePt}pt`, "important");
	}
	return () => {
		for (const { el, fontSize, priority } of snapshots) {
			if (fontSize) el.style.setProperty("font-size", fontSize, priority);
			else el.style.removeProperty("font-size");
		}
	};
}

/** Brief pause so layout can settle after changing `font-size` (avoid `typesetPromise` — it can reset nodes). */
async function delayAfterMathFontChange(): Promise<void> {
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}

/**
 * `mjx-math` layout height often includes blank strut below the SVG; trim to SVG ink height so PNGs
 * are not mostly whitespace under the formula (fixes Word baseline + block spacing).
 */
function tightMathJaxHeightPx(captureEl: HTMLElement, rectHeight: number): number {
	const h = Math.max(2, Math.ceil(rectHeight));
	const svg = captureEl.querySelector("svg");
	if (!(svg instanceof SVGSVGElement)) return h;
	try {
		const b = svg.getBBox();
		if (!(b.height > 0) || !Number.isFinite(b.height)) return h;
		const inkH = Math.ceil(b.height) + MATH_RASTER_INK_PAD_V;
		if (inkH < h) return Math.max(inkH, 8);
	} catch {
		/* getBBox can throw on detached / not-yet-laid-out SVG */
	}
	return h;
}

function resolveMathFontSizePtForRaster(options?: MathRasterOptions): number | undefined {
	if (options?.mathFontSizePt != null && Number.isFinite(options.mathFontSizePt) && options.mathFontSizePt > 0) {
		return options.mathFontSizePt;
	}
	if (
		options?.mathBodyFontSizePt != null &&
		options?.mathFontSizePercent != null &&
		Number.isFinite(options.mathBodyFontSizePt) &&
		Number.isFinite(options.mathFontSizePercent)
	) {
		return (options.mathBodyFontSizePt * options.mathFontSizePercent) / 100;
	}
	return undefined;
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
	/**
	 * Prefer `mjx-math` for both inline and display: block wrappers (`math-block`, `mjx-container`)
	 * are often full line width while MathJax centers the SVG — capturing the outer box bakes huge
	 * side margins into the PNG and makes formulas look tiny in Word.
	 */
	const mjxMath = el.querySelector("mjx-math") as HTMLElement | null;
	const captureEl = mjxMath ?? el;

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
	const fontPt = resolveMathFontSizePtForRaster(options);
	const restoreMathFs = applyMathJaxFontSizePtToCaptureRoot(captureEl, fontPt);
	void captureEl.offsetHeight;
	await delayAfterMathFontChange();
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
			hContent = tightMathJaxHeightPx(captureEl, r.height);
			padX = MATH_RASTER_PAD_X_INLINE;
			padY = Math.max(
				MATH_RASTER_PAD_Y_MIN_INLINE,
				Math.ceil(hContent * MATH_RASTER_PAD_Y_FRAC_INLINE),
			);
		} else if (mjxMath) {
			/** Tight bounds from `mjx-math` — do not use `el` full-line width. */
			void captureEl.offsetHeight;
			const r = captureEl.getBoundingClientRect();
			wContent = Math.max(2, Math.ceil(r.width));
			hContent = tightMathJaxHeightPx(captureEl, r.height);
			padX = MATH_RASTER_PAD_X_MJX;
			padY = Math.max(
				MATH_RASTER_PAD_Y_MIN_MJX,
				Math.ceil(hContent * MATH_RASTER_PAD_Y_FRAC_MJX),
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
			pixelRatio: MATH_RASTER_PIXEL_RATIO,
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
		restoreMathFs();
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
	const bodyPt = options?.mathBodyFontSizePt ?? 10;
	const inlineScale = options?.mathInlineScalePercent ?? 90;
	const displayScale = options?.mathDisplayScalePercent ?? 90;
	const inlinePt = (bodyPt * inlineScale) / 100;
	const displayPt = (bodyPt * displayScale) / 100;

	const mathBlocks = Array.from(host.querySelectorAll("math-block")) as HTMLElement[];
	for (const block of mathBlocks) {
		if (!block.isConnected) continue;
		const png = await rasterizeMathElement(block, maxWidthPx, {
			...options,
			inline: false,
			mathFontSizePt: displayPt,
		});
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
		const png = await rasterizeMathElement(mjx, maxWidthPx, {
			...options,
			inline: true,
			mathFontSizePt: inlinePt,
		});
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
	const bodyPt = options?.mathBodyFontSizePt ?? 10;
	host.style.fontSize = `${bodyPt}pt`;
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
	const bodyPt = options?.mathBodyFontSizePt ?? 10;
	host.style.fontSize = `${bodyPt}pt`;
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
