/**
 * Export-time Mermaid SVG normalization for static raster engines.
 * Converts <foreignObject> labels into plain SVG <text> labels and resolves CSS variables.
 * This does not touch source markdown; only the temporary exported SVG bytes.
 */

function stripCssVars(value: string): string {
	return value.replace(/var\([^)]+\)/g, "currentColor");
}

function parseNum(value: string | null | undefined, fallback = 0): number {
	if (!value) return fallback;
	const n = Number.parseFloat(value);
	return Number.isFinite(n) ? n : fallback;
}

export function normalizeMermaidSvgForRaster(svgBytes: Uint8Array): Uint8Array {
	try {
		const xml = new TextDecoder().decode(svgBytes);
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, "image/svg+xml");
		const svg = doc.documentElement;
		if (!svg || svg.nodeName.toLowerCase() !== "svg") return svgBytes;

		// Resolve CSS var usage in style/text related attributes.
		const all = [svg, ...Array.from(svg.querySelectorAll("*"))];
		for (const el of all) {
			for (const name of ["fill", "stroke", "color", "style"]) {
				const v = el.getAttribute(name);
				if (!v || !v.includes("var(")) continue;
				el.setAttribute(name, stripCssVars(v));
			}
		}

		const foreignObjects = Array.from(svg.querySelectorAll("foreignObject"));
		for (const fo of foreignObjects) {
			const text = (fo.textContent ?? "").trim();
			if (!text) {
				fo.remove();
				continue;
			}
			const x = parseNum(fo.getAttribute("x"), 0);
			const y = parseNum(fo.getAttribute("y"), 0);
			const w = Math.max(1, parseNum(fo.getAttribute("width"), 0));
			const h = Math.max(1, parseNum(fo.getAttribute("height"), 0));

			const t = doc.createElementNS("http://www.w3.org/2000/svg", "text");
			t.setAttribute("x", String(x + w / 2));
			t.setAttribute("y", String(y + h / 2));
			t.setAttribute("text-anchor", "middle");
			t.setAttribute("dominant-baseline", "middle");
			t.setAttribute("font-size", "12");
			t.setAttribute("fill", "#111111");

			// Preserve rough line breaks from HTML label content.
			const lines = text
				.split(/\r?\n+/)
				.map((s) => s.trim())
				.filter(Boolean);
			if (lines.length <= 1) {
				t.textContent = lines[0] ?? text;
			} else {
				lines.forEach((line, idx) => {
					const span = doc.createElementNS("http://www.w3.org/2000/svg", "tspan");
					span.setAttribute("x", String(x + w / 2));
					span.setAttribute("dy", idx === 0 ? "0" : "1.15em");
					span.textContent = line;
					t.appendChild(span);
				});
				// Lift first line upward for visual centering.
				t.setAttribute("y", String(y + h / 2 - ((lines.length - 1) * 6)));
			}
			fo.parentNode?.insertBefore(t, fo.nextSibling);
			fo.remove();
		}

		const out = new XMLSerializer().serializeToString(svg);
		return new TextEncoder().encode(out);
	} catch {
		return svgBytes;
	}
}
