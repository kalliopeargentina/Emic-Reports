// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createEmptyProject, type ReportProject } from "../domain/report-project";
import { CssTemplateEngine } from "./css-template-engine";
import { paginateHtml } from "./html-paginator";

/** Match PDF/preview: paginator measures with full export CSS. */
function paginateLikeExport(project: ReportProject, html: string): string[] {
	const css = new CssTemplateEngine().build(project);
	return paginateHtml(project, html, { exportCss: css });
}

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

describe("paginateHtml consecutive hr (blank sheets)", () => {
	it("inserts an empty page when two hr have no content between them", () => {
		const project = createEmptyProject("test");
		project.paperSize = "Custom";
		project.customPageSize = { width: 210, height: 200, unit: "mm" };

		const html = `<div><p id="a">A</p><hr><hr><p id="b">B</p></div>`;
		const pages = paginateLikeExport(project, html);
		// A | (blank) | B  → 3 sheets; middle page has no element markup
		expect(pages.length).toBe(3);
		expect(pages[0]).toContain('id="a"');
		expect(pages[1]?.trim()).toBe("");
		expect(pages[2]).toContain('id="b"');
	});

	it("does not add a leading blank page for a lone hr at the start", () => {
		const project = createEmptyProject("test");
		project.paperSize = "Custom";
		project.customPageSize = { width: 210, height: 200, unit: "mm" };

		const html = `<div><hr><p id="only">Only</p></div>`;
		const pages = paginateLikeExport(project, html);
		expect(pages.length).toBe(1);
		expect(pages[0]).toContain('id="only"');
	});
});

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

		const pages = paginateLikeExport(project, html);
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

		const pages = paginateLikeExport(project, html);
		const merged = pages.join("");
		for (let i = 0; i < 12; i++) {
			expect(merged).toContain(`id="p-${i}"`);
		}
	});
});
