/** docx/jszip + sha1: always copy so media is a tight buffer (no pooled/offset views). */
export function contiguousUint8Array(data: Uint8Array): Uint8Array {
	const out = new Uint8Array(data.byteLength);
	out.set(data);
	return out;
}

export function isValidPng(data: Uint8Array): boolean {
	if (data.byteLength < 67) return false;
	// PNG signature + minimum chunk structure
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

/** IHDR width/height (pixels). Returns null if buffer is too small or implausible. */
export function pngIhdrSize(data: Uint8Array): { w: number; h: number } | null {
	if (data.byteLength < 24 || !isValidPng(data)) return null;
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const w = dv.getUint32(16, false);
	const h = dv.getUint32(20, false);
	if (w === 0 || h === 0 || w > 16384 || h > 16384) return null;
	return { w, h };
}

/**
 * Filters icons / broken raster paths (tiny PNGs that pass isValidPng).
 * DOCX prerender and capture should require this so one slot is not a 400-byte sparkle.
 */
export function isAcceptableDiagramPng(data: Uint8Array): boolean {
	if (!isValidPng(data) || data.byteLength < 900) return false;
	const dim = pngIhdrSize(data);
	if (!dim) return false;
	return dim.w >= 64 && dim.h >= 64;
}

