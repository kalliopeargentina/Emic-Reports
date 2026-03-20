/**
 * Obsidian / plugin widgets (e.g. some diagram UIs) may attach content in open shadow roots.
 * innerHTML/querySelector on the host misses that subtree.
 */

export function querySelectorDeep(root: ParentNode, selector: string): Element | null {
	const trySel = (node: ParentNode): Element | null => {
		try {
			return node.querySelector(selector);
		} catch {
			return null;
		}
	};

	const walk = (node: ParentNode): Element | null => {
		const hit = trySel(node);
		if (hit) return hit;
		let all: NodeListOf<Element>;
		try {
			all = node.querySelectorAll("*");
		} catch {
			return null;
		}
		for (let i = 0; i < all.length; i += 1) {
			const el = all[i]!;
			const sr = (el as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
			if (sr) {
				const inner = walk(sr);
				if (inner) return inner;
			}
		}
		return null;
	};

	return walk(root);
}

/** Chromium: serializes declarative/open shadow roots when supported. */
export function serializeElementHtml(element: HTMLElement): string {
	const withGetHtml = element as HTMLElement & {
		getHTML?: (opts?: { serializableShadowRoots?: boolean }) => string;
	};
	if (typeof withGetHtml.getHTML === "function") {
		try {
			return withGetHtml.getHTML({ serializableShadowRoots: true });
		} catch {
			// fall through
		}
	}
	return element.innerHTML;
}

export function hostHasSvgOrCanvas(host: ParentNode): boolean {
	return !!(querySelectorDeep(host, "svg") || querySelectorDeep(host, "canvas"));
}

/**
 * Prefer the main diagram SVG (largest bbox), not tiny UI icons.
 */
export function findLargestSvgDeep(root: ParentNode): SVGSVGElement | null {
	const candidates: SVGSVGElement[] = [];
	const collect = (node: ParentNode) => {
		let list: NodeListOf<Element>;
		try {
			list = node.querySelectorAll("svg");
		} catch {
			return;
		}
		for (let i = 0; i < list.length; i++) {
			const el = list[i];
			if (el instanceof SVGSVGElement) candidates.push(el);
		}
		let els: NodeListOf<Element>;
		try {
			els = node.querySelectorAll("*");
		} catch {
			return;
		}
		for (let i = 0; i < els.length; i++) {
			const el = els[i] as Element & { shadowRoot?: ShadowRoot | null };
			if (el.shadowRoot) collect(el.shadowRoot);
		}
	};
	collect(root);

	let best: SVGSVGElement | null = null;
	let bestArea = 0;
	for (const svg of candidates) {
		try {
			const bb = svg.getBBox();
			const w = bb.width;
			const h = bb.height;
			if (!Number.isFinite(w) || !Number.isFinite(h)) continue;
			const area = Math.abs(w * h);
			if (area > bestArea && w >= 2 && h >= 2) {
				bestArea = area;
				best = svg;
			}
		} catch {
			continue;
		}
	}
	if (best) return best;

	for (const svg of candidates) {
		const r = svg.getBoundingClientRect();
		const area = r.width * r.height;
		if (area > bestArea && r.width >= 2 && r.height >= 2) {
			bestArea = area;
			best = svg;
		}
	}
	return best;
}

/** Poll until an SVG or canvas appears (including inside shadow roots) or maxMs. */
export async function waitForSvgOrCanvasDeep(
	root: HTMLElement,
	opts: { maxMs?: number; intervalMs?: number } = {},
): Promise<void> {
	const maxMs = opts.maxMs ?? 20000;
	const intervalMs = opts.intervalMs ?? 80;
	const t0 = Date.now();
	while (Date.now() - t0 < maxMs) {
		if (hostHasSvgOrCanvas(root)) return;
		await new Promise((r) => window.setTimeout(r, intervalMs));
	}
}
