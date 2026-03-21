// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { flattenPaginableNodes, splitCalloutByContentBlocks } from "./html-paginator";

function rootFromHtml(inner: string): HTMLElement {
	const doc = new DOMParser().parseFromString(`<div id="ra-root">${inner}</div>`, "text/html");
	const r = doc.getElementById("ra-root");
	if (!r) throw new Error("no root");
	return r;
}

describe("flattenPaginableNodes", () => {
	it("unwraps a single wrapper div with multiple children", () => {
		const root = rootFromHtml(`<div class="outer"><p>a</p><p>b</p><p>c</p></div>`);
		const flat = flattenPaginableNodes(root);
		expect(flat.length).toBe(3);
		expect(flat.map((e) => e.tagName.toLowerCase())).toEqual(["p", "p", "p"]);
	});

	it("does not unwrap a single child container", () => {
		const root = rootFromHtml(`<div><p>only</p></div>`);
		const flat = flattenPaginableNodes(root);
		expect(flat.length).toBe(1);
		expect(flat[0]!.tagName.toLowerCase()).toBe("div");
	});

	it("does not unwrap callout blockquote", () => {
		const root = rootFromHtml(
			`<div><blockquote class="callout"><div class="callout-title">T</div></blockquote></div>`,
		);
		const flat = flattenPaginableNodes(root);
		expect(flat.length).toBe(1);
		// Wrapper kept (single inner block); callout must stay grouped
		expect(flat[0]!.querySelector("blockquote.callout")).not.toBeNull();
	});

	it("does not unwrap PRE with multiple text lines", () => {
		const root = rootFromHtml(`<div><pre><code>a\nb</code></pre></div>`);
		const flat = flattenPaginableNodes(root);
		expect(flat.length).toBe(1);
	});
});

describe("splitCalloutByContentBlocks", () => {
	it("returns multiple callout shells when callout-content has several blocks", () => {
		const root = rootFromHtml(`<blockquote class="callout" data-callout="note">
<div class="callout-title"><span class="callout-title-inner">Title</span></div>
<div class="callout-content"><p>One</p><p>Two</p><p>Three</p></div>
</blockquote>`);
		const bq = root.querySelector("blockquote.callout") as HTMLElement;
		const segs = splitCalloutByContentBlocks(bq);
		expect(segs).not.toBeNull();
		expect(segs).toHaveLength(3);
		const s0 = segs![0]!;
		const s1 = segs![1]!;
		const s2 = segs![2]!;
		expect(s0.querySelector(".callout-title")).not.toBeNull();
		expect(s1.querySelector(".callout-title")).toBeNull();
		expect(s0.outerHTML).toContain("One");
		expect(s2.outerHTML).toContain("Three");
	});

	it("returns null for a single block inside callout-content", () => {
		const root = rootFromHtml(`<div class="callout" data-callout="tip">
<div class="callout-content"><p>Only</p></div>
</div>`);
		const el = root.querySelector("div.callout") as HTMLElement;
		expect(splitCalloutByContentBlocks(el)).toBeNull();
	});
});
