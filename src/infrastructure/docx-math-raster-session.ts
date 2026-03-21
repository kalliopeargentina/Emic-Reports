import { type App, type Component } from "obsidian";
import type { StyleTokens } from "../domain/style-template";
import { docxMathRasterHostWidthPx, mathExportFontSizePt } from "./math-export-sizing";
import { renderDisplayMathMarkdownToPng, renderInlineMathMarkdownToPng } from "./math-export";
import { createAsyncConcurrencyLimiter } from "./async-concurrency";

/** Max concurrent MathJax + PNG raster passes during one DOCX export (keeps UI responsive). */
export const DOCX_MATH_RENDER_CONCURRENCY = 4;

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
		const w = docxMathRasterHostWidthPx(this.tokens, kind);
		const pt = mathExportFontSizePt(this.tokens, kind).toFixed(3);
		const ink = (this.tokens.mathExportColor ?? "").trim();
		return `${kind}|${ink}|${w}|${pt}|${body}`;
	}

	getOrRenderInline(tex: string): Promise<Uint8Array | null> {
		const body = tex.trim();
		if (!body) return Promise.resolve(null);
		const w = docxMathRasterHostWidthPx(this.tokens, "inline");
		const key = this.cacheKey("inline", body);
		let p = this.cache.get(key);
		if (!p) {
			p = this.limit(() =>
				renderInlineMathMarkdownToPng(this.app, this.component, body, this.sourcePath, w, {
					inkColor: this.tokens.mathExportColor,
					mathBodyFontSizePt: this.tokens.fontSizeBody,
					mathFontSizePt: mathExportFontSizePt(this.tokens, "inline"),
				}),
			);
			this.cache.set(key, p);
		}
		return p;
	}

	getOrRenderDisplay(tex: string): Promise<Uint8Array | null> {
		const body = tex.trim();
		if (!body) return Promise.resolve(null);
		const w = docxMathRasterHostWidthPx(this.tokens, "display");
		const key = this.cacheKey("display", body);
		let p = this.cache.get(key);
		if (!p) {
			p = this.limit(() =>
				renderDisplayMathMarkdownToPng(this.app, this.component, body, this.sourcePath, w, {
					inkColor: this.tokens.mathExportColor,
					mathBodyFontSizePt: this.tokens.fontSizeBody,
					mathFontSizePt: mathExportFontSizePt(this.tokens, "display"),
				}),
			);
			this.cache.set(key, p);
		}
		return p;
	}
}
