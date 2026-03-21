import { type App, type Component } from "obsidian";
import type { StyleTokens } from "../domain/style-template";
import { renderDisplayMathMarkdownToPng, renderInlineMathMarkdownToPng } from "./math-export";
import { createAsyncConcurrencyLimiter } from "./async-concurrency";

/** Max concurrent MathJax + PNG raster passes during one DOCX export (keeps UI responsive). */
export const DOCX_MATH_RENDER_CONCURRENCY = 4;

export function docxInlineMathRasterWidthPx(tokens: StyleTokens): number {
	return Math.max(
		200,
		Math.round(640 * Math.max(0.35, Math.min(1.2, tokens.mathScalePercent / 100))),
	);
}

export function docxDisplayMathRasterWidthPx(tokens: StyleTokens): number {
	return Math.max(
		320,
		Math.round(900 * Math.max(0.4, Math.min(1.5, tokens.mathScalePercent / 100))),
	);
}

/**
 * Dedupes identical TeX, parallelizes distinct renders with a concurrency cap.
 */
export class DocxMathRasterSession {
	private readonly cache = new Map<string, Promise<Uint8Array | null>>();
	private readonly limit: ReturnType<typeof createAsyncConcurrencyLimiter>;

	constructor(
		private readonly app: App,
		private readonly component: Component,
		private readonly sourcePath: string,
		private readonly tokens: StyleTokens,
		concurrency: number = DOCX_MATH_RENDER_CONCURRENCY,
	) {
		this.limit = createAsyncConcurrencyLimiter(concurrency);
	}

	private cacheKey(kind: "inline" | "display", body: string): string {
		const w = kind === "inline" ? docxInlineMathRasterWidthPx(this.tokens) : docxDisplayMathRasterWidthPx(this.tokens);
		const ink = (this.tokens.mathExportColor ?? "").trim();
		return `${kind}|${ink}|${w}|${body}`;
	}

	getOrRenderInline(tex: string): Promise<Uint8Array | null> {
		const body = tex.trim();
		if (!body) return Promise.resolve(null);
		const w = docxInlineMathRasterWidthPx(this.tokens);
		const key = this.cacheKey("inline", body);
		let p = this.cache.get(key);
		if (!p) {
			p = this.limit(() =>
				renderInlineMathMarkdownToPng(this.app, this.component, body, this.sourcePath, w, {
					inkColor: this.tokens.mathExportColor,
				}),
			);
			this.cache.set(key, p);
		}
		return p;
	}

	getOrRenderDisplay(tex: string): Promise<Uint8Array | null> {
		const body = tex.trim();
		if (!body) return Promise.resolve(null);
		const w = docxDisplayMathRasterWidthPx(this.tokens);
		const key = this.cacheKey("display", body);
		let p = this.cache.get(key);
		if (!p) {
			p = this.limit(() =>
				renderDisplayMathMarkdownToPng(this.app, this.component, body, this.sourcePath, w, {
					inkColor: this.tokens.mathExportColor,
				}),
			);
			this.cache.set(key, p);
		}
		return p;
	}
}
