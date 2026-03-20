/**
 * html-to-image clones the DOM but does not apply computed CSS to children inside <svg>.
 * Mermaid needs key paint + transform + marker props inlined. We only copy a curated list
 * so we do not set display/visibility/filter/etc. that can flatten the whole diagram to white.
 */

const SVG_EXPORT_PROPS: string[] = [
	"fill",
	"stroke",
	"stroke-width",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-miterlimit",
	"marker",
	"marker-start",
	"marker-mid",
	"marker-end",
	"transform",
	"transform-origin",
	"transform-box",
	"opacity",
	"fill-opacity",
	"stroke-opacity",
	"fill-rule",
	"clip-rule",
	"color",
	"paint-order",
	"vector-effect",
	"dominant-baseline",
	"text-anchor",
	"font-family",
	"font-size",
	"font-weight",
	"font-style",
	"letter-spacing",
	"stop-color",
	"stop-opacity",
	"text-decoration",
	"line-height",
	/** Keep diagram in view without pulling layout props that break rasterization */
	"overflow",
];

/** Labels inside <foreignObject> — only typography/colors; avoid width/height/flex that can collapse. */
const FO_EXPORT_PROPS: string[] = [
	"color",
	"background-color",
	"font-family",
	"font-size",
	"font-weight",
	"font-style",
	"line-height",
	"text-align",
	"letter-spacing",
	"word-spacing",
	"opacity",
	"text-decoration",
];

function copyListedStyles(el: HTMLElement | SVGElement, props: string[]): void {
	const cs = getComputedStyle(el);
	for (const prop of props) {
		const value = cs.getPropertyValue(prop);
		if (!value) continue;
		if (value === "none" && prop !== "stroke" && prop !== "fill" && !prop.startsWith("marker")) {
			continue;
		}
		if (
			(prop === "fill" || prop === "stroke") &&
			(value === "rgba(0, 0, 0, 0)" || value === "transparent")
		) {
			continue;
		}
		el.style.setProperty(prop, value, cs.getPropertyPriority(prop));
	}
}

export function inlineComputedSvgStyles(root: SVGSVGElement): void {
	const nodes: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];
	for (const el of nodes) {
		if (el instanceof SVGElement) {
			copyListedStyles(el, SVG_EXPORT_PROPS);
		}
	}
}

function inlineForeignObjectHtmlStyles(root: SVGSVGElement): void {
	for (const fo of Array.from(root.querySelectorAll("foreignObject"))) {
		for (const el of Array.from(fo.querySelectorAll("*"))) {
			if (el instanceof HTMLElement) {
				copyListedStyles(el, FO_EXPORT_PROPS);
			}
		}
	}
}

function ensureSvgNamespaces(svg: SVGSVGElement): void {
	if (!svg.getAttribute("xmlns")) {
		svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	}
	if (!svg.getAttribute("xmlns:xlink")) {
		svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
	}
}

function ensureSvgViewBox(svg: SVGSVGElement): void {
	if (svg.getAttribute("viewBox")) return;
	try {
		const b = svg.getBBox();
		if (b.width > 0 && b.height > 0) {
			svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
		}
	} catch {
		/* getBBox can throw if not laid out */
	}
}

/**
 * Inline styles for Mermaid / SVG diagrams before raster paths that serialize SVG or clone DOM.
 * Two passes help inherited marker/transform values settle.
 */
export function prepareDiagramSvgForRasterExport(svg: SVGSVGElement): void {
	inlineComputedSvgStyles(svg);
	inlineForeignObjectHtmlStyles(svg);
	inlineComputedSvgStyles(svg);
	inlineForeignObjectHtmlStyles(svg);
	ensureSvgNamespaces(svg);
	ensureSvgViewBox(svg);
}
