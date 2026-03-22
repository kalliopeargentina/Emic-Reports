/**
 * Obsidian's Markdown preview adds UI around fenced code (e.g. copy). Export serializes DOM → PDF;
 * remove that chrome so print output matches a clean code block.
 */
function isLikelyCodeBlockWrapper(el: HTMLElement): boolean {
	const c = el.className?.toString() ?? "";
	return (
		/code-block|codeblock|HyperMD-codeblock|markdown-code|el-pre|cm-embed-block/i.test(c) ||
		(el.childElementCount <= 4 && el.querySelector(":scope > pre") !== null)
	);
}

/**
 * Open shadow roots (some Obsidian/widgets render into shadow DOM) are not in `innerHTML` unless
 * flattened. Move shadow children into a light-DOM wrapper before serializing.
 */
export function flattenOpenShadowRootsForExport(root: HTMLElement): void {
	let progress = true;
	let guard = 0;
	while (progress && guard < 50) {
		guard += 1;
		progress = false;
		for (const el of Array.from(root.querySelectorAll("*"))) {
			const h = el as HTMLElement & { shadowRoot?: ShadowRoot | null };
			if (!h.shadowRoot) continue;
			progress = true;
			const mount = document.createElement("div");
			mount.className = "ra-export-shadow-flat";
			while (h.shadowRoot.firstChild) {
				mount.appendChild(h.shadowRoot.firstChild);
			}
			h.appendChild(mount);
		}
	}
}

/**
 * Foldable callouts (`[!note]-` etc.) may render with `.is-collapsed` and inline height limits on
 * `.callout-content`. Export/preview serializes that DOM — body looks empty. Unfold for export.
 *
 * Obsidian's app.css often sets `display:none` / `max-height:0` on collapsed callouts with
 * `!important`; removing inline props is not enough. We set competing `!important` inline styles so
 * they win in the preview modal and serialize into exported HTML for PDF.
 */
export function expandFoldableCalloutsForExport(root: HTMLElement): void {
	for (const el of Array.from(root.querySelectorAll(".callout"))) {
		const h = el as HTMLElement;
		h.classList.remove("is-collapsed");
		h.removeAttribute("hidden");
	}
	for (const el of Array.from(root.querySelectorAll(".callout-content"))) {
		const h = el as HTMLElement;
		h.removeAttribute("aria-hidden");
		h.removeAttribute("hidden");
		h.style.setProperty("display", "block", "important");
		h.style.setProperty("max-height", "none", "important");
		h.style.setProperty("height", "auto", "important");
		h.style.setProperty("overflow", "visible", "important");
		h.style.setProperty("visibility", "visible", "important");
		h.style.setProperty("opacity", "1", "important");
	}
}

/** Remove off-screen render positioning from the MarkdownRenderer host so it is not leaked into serialized HTML. */
export function clearOffscreenRenderHostStyles(host: HTMLElement): void {
	host.style.removeProperty("opacity");
	host.style.removeProperty("position");
	host.style.removeProperty("left");
	host.style.removeProperty("top");
	host.style.removeProperty("pointer-events");
}

/**
 * Replace `<details>` with always-visible content: summary becomes a bold paragraph, body stays as
 * normal flow (print/PDF often collapse &lt;details&gt; or show disclosure UI we don't want).
 */
export function expandDetailsElementsForExport(root: HTMLElement): void {
	for (const d of Array.from(root.querySelectorAll("details"))) {
		const wrap = document.createElement("div");
		wrap.className = "ra-export-details";
		const sm = d.querySelector(":scope > summary");
		if (sm) {
			const p = document.createElement("p");
			p.className = "ra-export-details-summary";
			while (sm.firstChild) {
				p.appendChild(sm.firstChild);
			}
			sm.remove();
			wrap.appendChild(p);
		}
		while (d.firstChild) {
			wrap.appendChild(d.firstChild);
		}
		d.replaceWith(wrap);
	}
}

/**
 * Whether plain text matches a CommonMark thematic break line (`---`, `***`, `___`, optional
 * spaces between markers like `* * *`).
 */
function paragraphTextLooksLikeThematicBreak(text: string): boolean {
	const compact = text
		.replace(/\u00A0/g, " ")
		.replace(/\s+/g, "");
	return /^(\*{3,}|_{3,}|-{3,})$/.test(compact);
}

/**
 * Some parsers render `***` as empty nested `<strong><em></em></strong>` instead of `<hr>`.
 */
function isEmptyThematicBreakEmphasisParagraph(p: HTMLParagraphElement): boolean {
	const raw = (p.textContent ?? "").replace(/\u00A0/g, " ").trim();
	if (raw.length > 0) return false;
	if (p.querySelector("a, img, code, pre, svg, canvas, table")) return false;
	if (p.querySelector("br")) return false;
	const inner = p.innerHTML.trim();
	if (inner.length === 0) return false;
	if (
		/<strong[^>]*>\s*<em[^>]*>\s*<\/em>\s*<\/strong>/i.test(inner) ||
		/<em[^>]*>\s*<strong[^>]*>\s*<\/strong>\s*<\/em>/i.test(inner)
	) {
		return true;
	}
	/** Lone empty strong/em can come from mis-tokenized `***` */
	if (/^<strong[^>]*>\s*<\/strong>\s*$/i.test(inner) || /^<em[^>]*>\s*<\/em>\s*$/i.test(inner)) {
		return true;
	}
	return false;
}

/**
 * Obsidian's MarkdownRenderer may emit `<hr>` for `---` but `<p>***</p>` / empty emphasis for
 * `***` or `___`, so export CSS (`.ra-render-frame hr`) and PDF pagination (`<hr>` splits pages)
 * miss those. DOCX already treats all three line forms as page breaks — align HTML/PDF with `<hr>`.
 */
export function normalizeThematicBreakElementsForExport(root: HTMLElement): void {
	for (const p of Array.from(root.querySelectorAll("p"))) {
		const text = (p.textContent ?? "").replace(/\u00A0/g, " ");
		if (paragraphTextLooksLikeThematicBreak(text)) {
			if (p.querySelector("a, img, code, pre, svg, canvas")) continue;
			const hr = document.createElement("hr");
			p.replaceWith(hr);
			continue;
		}
		if (isEmptyThematicBreakEmphasisParagraph(p)) {
			const hr = document.createElement("hr");
			p.replaceWith(hr);
		}
	}
}

export function stripCodeBlockChromeForExport(root: HTMLElement): void {
	root.querySelectorAll("pre button").forEach((b) => {
		(b as HTMLElement).remove();
	});

	for (const pre of Array.from(root.querySelectorAll("pre"))) {
		let el: HTMLElement | null = pre.parentElement;
		let foundWrapper: HTMLElement | null = null;
		for (let depth = 0; el && depth < 5; depth += 1, el = el.parentElement) {
			if (isLikelyCodeBlockWrapper(el)) {
				foundWrapper = el;
				break;
			}
		}
		if (foundWrapper) {
			foundWrapper.querySelectorAll("button").forEach((b) => {
				(b as HTMLElement).remove();
			});
		}

		const parent = pre.parentElement;
		if (parent) {
			parent.querySelectorAll(":scope > button").forEach((b) => {
				(b as HTMLElement).remove();
			});
		}

		const sib = pre.previousElementSibling;
		if (sib instanceof HTMLElement && sib.matches("button")) {
			sib.remove();
		}
	}
}
