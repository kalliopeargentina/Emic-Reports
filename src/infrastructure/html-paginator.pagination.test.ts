// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../domain/report-project";
import { paginateHtml } from "./html-paginator";

function countSubstr(hay: string, needle: string): number {
	let n = 0;
	let pos = 0;
	while (pos < hay.length) {
		const i = hay.indexOf(needle, pos);
		if (i < 0) break;
		n++;
		pos = i + needle.length;
	}
	return n;
}

describe("paginateHtml integration", () => {
	it("preserves all callout blockquotes when splitting heading + callout (wrapper expand)", () => {
		const project = createEmptyProject("test");
		project.paperSize = "Custom";
		project.customPageSize = { width: 210, height: 50, unit: "mm" };

		const html = `<div class="markdown-preview-sizer">
<h1>1. Callouts</h1>
<blockquote class="callout" data-callout="note">
<div class="callout-title">Title</div>
<div class="callout-content"><p>Body text inside callout.</p></div>
</blockquote>
</div>`;

		const inputCallouts = countSubstr(html, "blockquote");
		expect(inputCallouts).toBeGreaterThan(0);

		const pages = paginateHtml(project, html);
		const merged = pages.join("\n");
		expect(countSubstr(merged, "blockquote")).toBe(inputCallouts);
		expect(merged).toContain("data-callout=\"note\"");
		expect(merged).toContain("Body text inside callout");
	});

	it("does not drop paragraphs when paginating long content", () => {
		const project = createEmptyProject("test");
		project.paperSize = "Custom";
		project.customPageSize = { width: 210, height: 60, unit: "mm" };

		const parts: string[] = [];
		for (let i = 0; i < 12; i++) {
			parts.push(`<p id="p-${i}">Paragraph ${i}</p>`);
		}
		const html = `<div>${parts.join("")}</div>`;

		const pages = paginateHtml(project, html);
		const merged = pages.join("");
		for (let i = 0; i < 12; i++) {
			expect(merged).toContain(`id="p-${i}"`);
		}
	});
});
