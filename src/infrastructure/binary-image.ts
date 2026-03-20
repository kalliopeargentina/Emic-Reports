/** docx/jszip + sha1: always copy so media is a tight buffer (no pooled/offset views). */
export function contiguousUint8Array(data: Uint8Array): Uint8Array {
	const out = new Uint8Array(data.byteLength);
	out.set(data);
	return out;
}

export function isValidPng(data: Uint8Array): boolean {
	if (data.byteLength < 67) return false;
	return (
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47 &&
		data[4] === 0x0d &&
		data[5] === 0x0a &&
		data[6] === 0x1a &&
		data[7] === 0x0a
	);
}

/** PNG IHDR width/height (big-endian at byte 16). */
export function pngIhdrSize(data: Uint8Array): { w: number; h: number } | null {
	if (!isValidPng(data) || data.byteLength < 24) return null;
	const dv = new DataView(data.buffer, data.byteOffset + 16, 8);
	const w = dv.getUint32(0, false);
	const h = dv.getUint32(4, false);
	if (!w || !h || w > 32767 || h > 32767) return null;
	return { w, h };
}

/**
 * Reject only obvious broken captures (e.g. 720×14 ribbons).
 * Gantt / timeline charts are often wide and short (~30–80px tall) — those must pass.
 */
export function pngLooksLikeCroppedDiagram(data: Uint8Array): boolean {
	const s = pngIhdrSize(data);
	if (!s) return true;
	const { w, h } = s;
	const minSide = Math.min(w, h);
	if (minSide < 8) return true;
	/** Hairline strip (720×14–type): very short and extremely wide; real Gantt is usually a bit taller. */
	const aspect = w >= h ? w / Math.max(1, h) : h / Math.max(1, w);
	if (h <= 14 && aspect > 42) return true;
	if (w <= 14 && aspect > 42) return true;
	return false;
}

/** Use before embedding in DOCX. */
export async function isAcceptableDiagramPng(data: Uint8Array | null | undefined): Promise<boolean> {
	if (!data || !isValidPng(data) || data.byteLength < 200) return false;
	if (pngLooksLikeCroppedDiagram(data)) return false;
	if (await pngIsSolidNearWhite(data)) return false;
	return true;
}

/**
 * True if a downscaled decode looks uniformly near-white (empty export).
 * Scales the full image into the sample so wide Gantt isn’t judged only on the top band.
 */
export async function pngIsSolidNearWhite(data: Uint8Array): Promise<boolean> {
	if (!isValidPng(data)) return false;
	const blob = new Blob([data], { type: "image/png" });
	const url = URL.createObjectURL(blob);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = () => reject(new Error("png"));
			i.src = url;
		});
		const sw = Math.min(96, Math.max(1, img.naturalWidth));
		const sh = Math.min(96, Math.max(1, img.naturalHeight));
		const c = document.createElement("canvas");
		c.width = sw;
		c.height = sh;
		const ctx = c.getContext("2d");
		if (!ctx) return false;
		ctx.drawImage(img, 0, 0, sw, sh);
		const pix = ctx.getImageData(0, 0, sw, sh).data;
		for (let i = 0; i < pix.length; i += 4) {
			const r = pix[i] ?? 0;
			const g = pix[i + 1] ?? 0;
			const b = pix[i + 2] ?? 0;
			if (r < 250 || g < 250 || b < 250) return false;
		}
		return true;
	} catch {
		return false;
	} finally {
		URL.revokeObjectURL(url);
	}
}
