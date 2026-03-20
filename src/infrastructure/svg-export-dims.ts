/**
 * Pixel width/height for scaling and rasterizing an SVG.
 *
 * Mermaid Gantt (and similar) uses a very wide user-space in getBBox() while the
 * visible diagram is viewBox / CSS-sized. Taking max(bbox, rect) for width makes
 * scale = maxWidth / 7800 and crushes height (~16px) after export cap.
 */
export function svgExportDisplayDimensions(svg: SVGSVGElement): { w: number; h: number } {
	const rect = svg.getBoundingClientRect();
	const rw = Math.max(rect.width || 0, 1);
	const rh = Math.max(rect.height || 0, 1);

	let bbW = 0;
	let bbH = 0;
	try {
		const bb = svg.getBBox();
		bbW = bb.width || 0;
		bbH = bb.height || 0;
	} catch {
		/* not laid out */
	}

	let vbW = 0;
	let vbH = 0;
	const vbAttr = svg.getAttribute("viewBox");
	if (vbAttr) {
		const p = vbAttr.trim().split(/[\s,]+/).map(Number);
		if (p.length === 4 && p.every((n) => Number.isFinite(n)) && p[2]! > 0 && p[3]! > 0) {
			vbW = p[2]!;
			vbH = p[3]!;
		}
	}

	const layoutW = vbW > 0 ? Math.max(vbW, rw) : rw;
	const layoutH = vbH > 0 ? Math.max(vbH, rh) : rh;

	/* Wide internal coordinates vs visible layout (e.g. Gantt timeline span). */
	if (bbW > layoutW * 1.12 && bbW > 200) {
		return { w: layoutW, h: layoutH };
	}

	return {
		w: Math.max(bbW, rw, 1),
		h: Math.max(bbH, rh, 1),
	};
}
