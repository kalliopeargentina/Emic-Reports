// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { injectHeadingSectionNumbers } from "./heading-section-numbers";

describe("injectHeadingSectionNumbers", () => {
	it("h1-h6: outline matches document order across siblings", () => {
		const html = `<h1 id="a">A</h1><h2 id="b">B</h2><h2 id="c">C</h2><h3 id="d">D</h3>`;
		const out = injectHeadingSectionNumbers(html, "h1-h6");
		const doc = new DOMParser().parseFromString(`<div>${out}</div>`, "text/html");
		const root = doc.body.firstElementChild!;
		expect(root.querySelector("#a")?.getAttribute("data-ra-section")).toBe("1");
		expect(root.querySelector("#b")?.getAttribute("data-ra-section")).toBe("1.1");
		expect(root.querySelector("#c")?.getAttribute("data-ra-section")).toBe("1.2");
		expect(root.querySelector("#d")?.getAttribute("data-ra-section")).toBe("1.2.1");
	});

	it("skips cover and TOC titles", () => {
		const html = `<h1 class="ra-cover-title">Cover</h1><h1 id="x">Real</h1><h2 class="ra-toc-title">TOC</h2><h2 id="y">Y</h2>`;
		const out = injectHeadingSectionNumbers(html, "h1-h6");
		const doc = new DOMParser().parseFromString(`<div>${out}</div>`, "text/html");
		const root = doc.body.firstElementChild!;
		expect(root.querySelector(".ra-cover-title")?.hasAttribute("data-ra-section")).toBe(false);
		expect(root.querySelector("#x")?.getAttribute("data-ra-section")).toBe("1");
		expect(root.querySelector(".ra-toc-title")?.hasAttribute("data-ra-section")).toBe(false);
		expect(root.querySelector("#y")?.getAttribute("data-ra-section")).toBe("1.1");
	});

	it("h2-h4: numbers h2–h4 only", () => {
		const html = `<h1 id="a">A</h1><h2 id="b">B</h2><h2 id="c">C</h2><h3 id="d">D</h3>`;
		const out = injectHeadingSectionNumbers(html, "h2-h4");
		const doc = new DOMParser().parseFromString(`<div>${out}</div>`, "text/html");
		const root = doc.body.firstElementChild!;
		expect(root.querySelector("#a")?.hasAttribute("data-ra-section")).toBe(false);
		expect(root.querySelector("#b")?.getAttribute("data-ra-section")).toBe("1");
		expect(root.querySelector("#c")?.getAttribute("data-ra-section")).toBe("2");
		expect(root.querySelector("#d")?.getAttribute("data-ra-section")).toBe("2.1");
	});
});
