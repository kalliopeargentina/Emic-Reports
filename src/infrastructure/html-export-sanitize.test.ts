// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
	expandDetailsElementsForExport,
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
