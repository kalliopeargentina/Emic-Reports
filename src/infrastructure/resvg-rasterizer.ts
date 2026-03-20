import { Resvg, initWasm } from "@resvg/resvg-wasm";
import wasmBytes from "@resvg/resvg-wasm/index_bg.wasm";
import { contiguousUint8Array, isAcceptableDiagramPng } from "./binary-image";

let initPromise: Promise<void> | null = null;

async function ensureResvgReady(): Promise<void> {
	if (!initPromise) {
		initPromise = initWasm(wasmBytes as unknown as BufferSource);
	}
	await initPromise;
}

export async function rasterizeSvgWithResvg(
	svgBytes: Uint8Array,
	targetWidth: number,
): Promise<Uint8Array | null> {
	try {
		await ensureResvgReady();
		const width = Math.max(1, Math.round(targetWidth));
		const resvg = new Resvg(svgBytes, {
			background: "white",
			fitTo: { mode: "width", value: width },
		});
		const rendered = resvg.render();
		const png = contiguousUint8Array(rendered.asPng());
		rendered.free();
		resvg.free();
		if (!isAcceptableDiagramPng(png)) return null;
		return png;
	} catch {
		return null;
	}
}
