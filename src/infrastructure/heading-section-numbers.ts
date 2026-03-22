import type { HeadingNumberingMode } from "../domain/style-template";

const INJECT_ROOT_ID = "ra-heading-section-inject-root";

function shouldSkipHeading(el: HTMLElement): boolean {
	return el.matches("h1.ra-cover-title") || el.matches("h2.ra-toc-title");
}

/**
 * Assigns `data-ra-section` (e.g. `1.2.3`) on headings in **document order** so PDF/preview
 * numbering matches the outline and survives pagination (CSS counters are unreliable per sheet).
 */
export function injectHeadingSectionNumbers(html: string, mode: HeadingNumberingMode): string {
	if (mode === "none") return html;

	const doc = new DOMParser().parseFromString(
		`<div id="${INJECT_ROOT_ID}">${html}</div>`,
		"text/html",
	);
	const root = doc.getElementById(INJECT_ROOT_ID);
	if (!root) return html;

	const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6")) as HTMLElement[];

	if (mode === "h1-h6") {
		const c = [0, 0, 0, 0, 0, 0];
		for (const el of headings) {
			if (shouldSkipHeading(el)) {
				el.removeAttribute("data-ra-section");
				continue;
			}
			const level = Number.parseInt(el.tagName.slice(1), 10) - 1;
			if (level < 0 || level > 5) continue;
			c[level] = (c[level] ?? 0) + 1;
			for (let i = level + 1; i < 6; i++) c[i] = 0;
			const label = c.slice(0, level + 1).join(".");
			el.setAttribute("data-ra-section", label);
		}
	} else {
		/** Match print CSS h2–h4 mode: h2 top level, h3/h4 nested. */
		let h2 = 0;
		let h3 = 0;
		let h4 = 0;
		for (const el of headings) {
			if (shouldSkipHeading(el)) {
				el.removeAttribute("data-ra-section");
				continue;
			}
			const tag = el.tagName.toLowerCase();
			if (tag === "h1" || tag === "h5" || tag === "h6") {
				el.removeAttribute("data-ra-section");
				continue;
			}
			if (tag === "h2") {
				h2 += 1;
				h3 = 0;
				h4 = 0;
				el.setAttribute("data-ra-section", String(h2));
			} else if (tag === "h3") {
				if (h2 < 1) h2 = 1;
				h3 += 1;
				h4 = 0;
				el.setAttribute("data-ra-section", `${h2}.${h3}`);
			} else if (tag === "h4") {
				if (h2 < 1) h2 = 1;
				if (h3 < 1) h3 = 1;
				h4 += 1;
				el.setAttribute("data-ra-section", `${h2}.${h3}.${h4}`);
			}
		}
	}

	return root.innerHTML;
}
