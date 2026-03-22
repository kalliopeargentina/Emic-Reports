import { describe, expect, it } from "vitest";
import { expandInlineHashtagsToAnchorLinks } from "./export-markdown-transforms";

describe("expandInlineHashtagsToAnchorLinks", () => {
	it("wraps hashtags outside code; skips markdown link fragments", () => {
		const md = "See #obsidian and [x](#headings).";
		const out = expandInlineHashtagsToAnchorLinks(md);
		expect(out).toContain("[#obsidian](#obsidian)");
		expect(out).toContain("[x](#headings)");
		expect(out.match(/#headings/g)?.length).toBe(1);
	});

	it("does not change fenced code", () => {
		const md = "```\n#not-a-tag\n```\n#real";
		const out = expandInlineHashtagsToAnchorLinks(md);
		expect(out).toContain("#not-a-tag");
		expect(out).toContain("[#real](#real)");
	});
});
