/**
 * Emic-Charts-View (Ant Design Charts) renders to <canvas>. Serialized HTML and SVG export
 * paths lose pixels unless canvases are rasterized to <img data:...> first.
 */

export const CHART_CANVAS_WAIT_MAX_MS = 5000;

export async function waitForChartCanvasPaint(host: HTMLElement, maxMs: number): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < maxMs) {
		const canvases = Array.from(host.querySelectorAll("canvas")) as HTMLCanvasElement[];
		let painted = 0;
		for (const c of canvases) {
			const w = c.width || Math.round(c.getBoundingClientRect().width);
			const h = c.height || Math.round(c.getBoundingClientRect().height);
			if (w < 64 || h < 64) continue;
			try {
				const url = c.toDataURL("image/png");
				if (url.length > 3000) painted += 1;
			} catch {
				/* tainted canvas */
			}
		}
		if (painted > 0) return;
		await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
	}
}

/** Replace painted chart canvases with PNG data-URL <img> for export serialization / capture. */
export function replacePaintedCanvasesWithImages(host: HTMLElement): { replaced: number; total: number } {
	const canvases = Array.from(host.querySelectorAll("canvas")) as HTMLCanvasElement[];
	let replaced = 0;
	for (const canvas of canvases) {
		let dataUrl = "";
		try {
			dataUrl = canvas.toDataURL("image/png");
		} catch {
			continue;
		}
		if (!dataUrl || dataUrl.length < 3000) continue;
		const rect = canvas.getBoundingClientRect();
		const cssW = Math.max(1, Math.round(rect.width || canvas.width || 1));
		const cssH = Math.max(1, Math.round(rect.height || canvas.height || 1));
		const img = document.createElement("img");
		img.src = dataUrl;
		img.width = cssW;
		img.height = cssH;
		img.alt = "chart";
		img.style.display = "block";
		img.style.width = `${cssW}px`;
		img.style.height = `${cssH}px`;
		canvas.replaceWith(img);
		replaced += 1;
	}
	return { replaced, total: canvases.length };
}
