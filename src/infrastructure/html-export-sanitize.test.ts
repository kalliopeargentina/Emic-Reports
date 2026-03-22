// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
	expandDetailsElementsForExport,
	expandFoldableCalloutsForExport,
	flattenOpenShadowRootsForExport,
	normalizeThematicBreakElementsForExport,
	stripCodeBlockChromeForExport,
} from "./html-export-sanitize";

describe("stripCodeBlockChromeForExport", () => {
	it("removes button inside pre", () => {
		const root = document.createElement("div");
		root.innerHTML = `<pre><code>x</code><button type="button">copy</button></pre>`;
		stripCodeBlockChromeForExport(root);
		expect(root.querySelectorAll("button").length).toBe(0);
		expect(root.querySelector("pre")).not.toBeNull();
	});

	it("removes buttons in a code-block-like wrapper", () => {
		const root = document.createElement("div");
		root.innerHTML = `
<div class="markdown-code-block">
  <button aria-label="Copy">c</button>
  <pre><code>ok</code></pre>
</div>`;
		stripCodeBlockChromeForExport(root);
		expect(root.querySelectorAll("button").length).toBe(0);
	});
});

describe("normalizeThematicBreakElementsForExport", () => {
	it("replaces paragraph-only --- *** ___ (and spaced variants) with hr", () => {
		const root = document.createElement("div");
		root.innerHTML = `<p>---</p><p>***</p><p>___</p><p>* * *</p><p>- - -</p>`;
		normalizeThematicBreakElementsForExport(root);
		const hrs = root.querySelectorAll("hr");
		expect(hrs.length).toBe(5);
		expect(root.querySelectorAll("p").length).toBe(0);
	});

	it("replaces empty nested strong/em (mis-tokenized ***) with hr", () => {
		const root = document.createElement("div");
		root.innerHTML = `<p><strong><em></em></strong></p>`;
		normalizeThematicBreakElementsForExport(root);
		expect(root.querySelectorAll("hr").length).toBe(1);
	});

	it("does not replace normal paragraphs", () => {
		const root = document.createElement("div");
		root.innerHTML = `<p>Intro text</p><p>--</p>`;
		normalizeThematicBreakElementsForExport(root);
		expect(root.querySelectorAll("hr").length).toBe(0);
		expect(root.querySelectorAll("p").length).toBe(2);
	});
});

describe("expandFoldableCalloutsForExport", () => {
	it("removes is-collapsed and forces visible callout-content with important inline styles", () => {
		const root = document.createElement("div");
		root.innerHTML = `<blockquote class="callout is-collapsed" data-callout="note">
<div class="callout-title"><span class="callout-title-inner">Note</span></div>
<div class="callout-content" style="max-height:0;overflow:hidden" aria-hidden="true"><p>Body</p></div>
</blockquote>`;
		expandFoldableCalloutsForExport(root);
		const bq = root.querySelector("blockquote.callout") as HTMLElement;
		expect(bq.classList.contains("is-collapsed")).toBe(false);
		const cc = root.querySelector(".callout-content") as HTMLElement;
		expect(cc.style.getPropertyValue("display")).toBe("block");
		expect(cc.style.getPropertyPriority("display")).toBe("important");
		expect(cc.style.getPropertyValue("max-height")).toBe("none");
		expect(cc.hasAttribute("aria-hidden")).toBe(false);
		expect(cc.textContent).toContain("Body");
	});
});

describe("flattenOpenShadowRootsForExport", () => {
	it("moves open shadow children into light DOM", () => {
		const root = document.createElement("div");
		const host = document.createElement("div");
		root.appendChild(host);
		const sr = host.attachShadow({ mode: "open" });
		const inner = document.createElement("span");
		inner.textContent = "shadow-text";
		sr.appendChild(inner);
		flattenOpenShadowRootsForExport(root);
		expect(host.querySelector(".ra-export-shadow-flat span")?.textContent).toBe("shadow-text");
	});
});

describe("expandDetailsElementsForExport", () => {
	it("unwraps details into div and summary paragraph", () => {
		const root = document.createElement("div");
		root.innerHTML = `<details><summary>Title</summary><p>Body</p></details>`;
		expandDetailsElementsForExport(root);
		expect(root.querySelector("details")).toBeNull();
		const wrap = root.querySelector(".ra-export-details");
		expect(wrap).not.toBeNull();
		expect(wrap?.textContent).toContain("Title");
		expect(wrap?.textContent).toContain("Body");
	});
});
