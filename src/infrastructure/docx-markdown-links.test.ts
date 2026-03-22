import { describe, expect, it } from "vitest";
import { findMarkdownInlineLinks } from "./docx-markdown-links";

describe("findMarkdownInlineLinks", () => {
	it("parses link with parentheses in URL (balanced)", () => {
		const s = "See [wiki](https://en.wikipedia.org/wiki/Link_(film)) here.";
		const m = findMarkdownInlineLinks(s);
		expect(m).toHaveLength(1);
		expect(m[0]?.href).toBe("https://en.wikipedia.org/wiki/Link_(film)");
		expect(m[0]?.label).toBe("wiki");
	});

	it("skips image syntax", () => {
		const s = "![alt](x.png) and [t](y.md)";
		const m = findMarkdownInlineLinks(s);
		expect(m).toHaveLength(1);
		expect(m[0]?.label).toBe("t");
		expect(m[0]?.href).toBe("y.md");
	});

	it("parses angle-bracket destination with spaces", () => {
		const s = "[a](<https://a.com/path with spaces>)";
		const m = findMarkdownInlineLinks(s);
		expect(m).toHaveLength(1);
		expect(m[0]?.href).toBe("https://a.com/path with spaces");
	});
});
