/**
 * Build a table of contents from rendered HTML headings and ensure anchor ids exist for links.
 */

function slugifyHeadingText(text: string): string {
	const base = text
		.trim()
		.toLowerCase()
		.replace(/[''`]/g, "")
		.replace(/[^a-z0-9\s-]/gi, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return base || "heading";
}

function collectHeadingElements(doc: Document): HTMLElement[] {
	return Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")) as HTMLElement[];
}

function textContentOfHeading(el: HTMLElement): string {
	return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Assigns stable `id` attributes to h1–h6 when missing (GFM-style slugs, deduped).
 */
export function ensureHeadingIds(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	const headings = collectHeadingElements(doc);
	const used = new Set<string>();

	for (const h of headings) {
		if (h.id && h.id.trim()) {
			used.add(h.id);
			continue;
		}
		const text = textContentOfHeading(h);
		let slug = slugifyHeadingText(text);
		let candidate = slug;
		let n = 1;
		while (used.has(candidate)) {
			n += 1;
			candidate = `${slug}-${n}`;
		}
		h.id = candidate;
		used.add(candidate);
	}

	return doc.body.innerHTML;
}

export type TocBuildOptions = {
	/** Section title (sentence case). */
	title?: string;
};

function escAttr(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Builds a `<nav class="ra-toc">` from existing heading elements (expects ids on headings).
 * Entries use rows (no list bullets); {@link applyTocPageNumbersToPaginatedSheets} fills page cells.
 */
export function buildTableOfContentsHtml(html: string, options?: TocBuildOptions): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	const headings = collectHeadingElements(doc);
	if (headings.length === 0) return "";

	const title = options?.title?.trim() || "Contents";
	const esc = (s: string) =>
		s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");

	const items: string[] = [];
	for (const h of headings) {
		const level = Number.parseInt(h.tagName.slice(1), 10);
		if (!Number.isFinite(level) || level < 1 || level > 6) continue;
		const id = h.id?.trim();
		if (!id) continue;
		const label = textContentOfHeading(h);
		if (!label) continue;
		items.push(
			`<div class="ra-toc-entry ra-toc-level-${level}" data-ra-toc-target="${escAttr(id)}">` +
				`<div class="ra-toc-text"><a class="ra-toc-link" href="#${esc(id)}">` +
				`<span class="ra-toc-label">${esc(label)}</span></a></div>` +
				`<span class="ra-toc-leader" aria-hidden="true"></span>` +
				`<span class="ra-toc-page" aria-hidden="true"></span>` +
				`</div>`,
		);
	}
	if (items.length === 0) return "";

	return `<nav class="ra-toc" aria-label="${esc(title)}">
<h2 class="ra-toc-title">${esc(title)}</h2>
<div class="ra-toc-entries">
${items.join("\n")}
</div>
</nav>`;
}

const TOC_PAGE_WRAP_ID = "ra-toc-page-apply-wrap";

/**
 * After {@link paginateHtml}, fills `.ra-toc-page` with the 1-based sheet index where each
 * heading id appears (same numbering as preview “Page N/M”).
 */
export function applyTocPageNumbersToPaginatedSheets(pages: string[]): string[] {
	if (pages.length === 0) return pages;

	const idToPage = new Map<string, number>();
	pages.forEach((fragment, pageIndex) => {
		const doc = new DOMParser().parseFromString(
			`<div id="${TOC_PAGE_WRAP_ID}">${fragment}</div>`,
			"text/html",
		);
		const wrap = doc.getElementById(TOC_PAGE_WRAP_ID);
		if (!wrap) return;
		const headings = wrap.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
		headings.forEach((el) => {
			const id = el.getAttribute("id")?.trim();
			if (id) idToPage.set(id, pageIndex + 1);
		});
	});

	return pages.map((fragment) => {
		if (!fragment.includes("ra-toc-entry")) return fragment;
		const doc = new DOMParser().parseFromString(
			`<div id="${TOC_PAGE_WRAP_ID}">${fragment}</div>`,
			"text/html",
		);
		const wrap = doc.getElementById(TOC_PAGE_WRAP_ID);
		if (!wrap) return fragment;
		wrap.querySelectorAll("[data-ra-toc-target]").forEach((row) => {
			const target = row.getAttribute("data-ra-toc-target")?.trim();
			if (!target) return;
			const pageEl = row.querySelector(".ra-toc-page");
			if (!pageEl) return;
			const num = idToPage.get(target);
			if (num !== undefined) {
				pageEl.textContent = String(num);
				pageEl.removeAttribute("aria-hidden");
			}
		});
		return wrap.innerHTML;
	});
}
