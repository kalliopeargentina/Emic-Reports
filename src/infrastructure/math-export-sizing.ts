import type { StyleTokens } from "../domain/style-template";

/**
 * Must match `pixelRatio` passed to `toBlob` in `math-export` rasterizeMathElement.
 * PNG IHDR width/height are this many times the CSS layout pixels — Word needs logical px.
 */
export const MATH_RASTER_PIXEL_RATIO = 2;

/**
 * Absolute math font size (pt) from body size × template scale.
 * Same formula for PDF raster, DOCX raster, and DOCX image sizing.
 */
export function mathExportFontSizePt(tokens: StyleTokens, mode: "inline" | "display"): number {
	const scale =
		mode === "inline" ? tokens.mathInlineScalePercent : tokens.mathDisplayScalePercent;
	return (tokens.fontSizeBody * scale) / 100;
}

/**
 * Offscreen Markdown host width for MathJax layout (DOCX raster).
 * Scales with font size so wide display formulas still fit.
 */
export function docxMathRasterHostWidthPx(tokens: StyleTokens, mode: "inline" | "display"): number {
	const pt = mathExportFontSizePt(tokens, mode);
	const base = mode === "display" ? 260 : 200;
	const slope = mode === "display" ? 58 : 48;
	return Math.max(mode === "display" ? 280 : 200, Math.round(base + pt * slope));
}

/**
 * DOCX `ImageRun` size in **layout px** (Word, 96dpi convention).
 *
 * 1) Raster uses `pixelRatio: 2` — IHDR ÷ {@link MATH_RASTER_PIXEL_RATIO} → logical px.
 * 2) Font size (inline vs display %) is **already** baked into the PNG by MathJax + `mathFontSizePt`.
 * 3) **Do not** shrink to a small max-height: formulas are often **much** taller than one body line
 *    (fractions, matrices). The old `maxH ≈ line height` logic made `s = maxH/lh` tiny → illegible
 *    DOCX while PDF looked fine (browser uses intrinsic img size + `max-width`, not a height cap).
 * 4) Only **downscale uniformly** when **width** exceeds a flow limit (narrow inline column vs wide page).
 */
export function docxMathImageTransformationPx(
	_tokens: StyleTokens,
	mode: "inline" | "display",
	dim: { w: number; h: number },
): { width: number; height: number } {
	if (dim.w <= 0 || dim.h <= 0) {
		return { width: 1, height: 1 };
	}
	const lw = dim.w / MATH_RASTER_PIXEL_RATIO;
	const lh = dim.h / MATH_RASTER_PIXEL_RATIO;

	const maxW = mode === "inline" ? 520 : 1180;
	const s = Math.min(1, maxW / lw);
	const w = lw * s;
	const h = lh * s;

	return {
		width: Math.max(1, Math.round(w)),
		height: Math.max(1, Math.round(h)),
	};
}
