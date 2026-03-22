// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { expandDetailsElementsForExport, stripCodeBlockChromeForExport } from "./html-export-sanitize";

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
