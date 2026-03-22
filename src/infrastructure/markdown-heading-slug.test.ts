import { describe, expect, it } from "vitest";
import { slugifyHeadingForAnchor } from "./markdown-heading-slug";

describe("slugifyHeadingForAnchor", () => {
	it("matches typical section titles", () => {
		expect(slugifyHeadingForAnchor("Headings")).toBe("headings");
		expect(slugifyHeadingForAnchor("Tags & Metadata")).toBe("tags-metadata");
		expect(slugifyHeadingForAnchor("Text Formatting")).toBe("text-formatting");
	});

	it("strips emoji for TOC-style titles", () => {
		expect(slugifyHeadingForAnchor("📑 Table of Contents")).toBe("table-of-contents");
	});
});
