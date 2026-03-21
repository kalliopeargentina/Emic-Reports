import { describe, expect, it } from "vitest";
import {
	countQuoteDepth,
	parseCalloutStartLine,
	stripQuoteLevels,
} from "./callout-markdown";

describe("parseCalloutStartLine", () => {
	it("parses depth-1 callout", () => {
		const p = parseCalloutStartLine("> [!note] Hello");
		expect(p).not.toBeNull();
		expect(p!.depth).toBe(1);
		expect(p!.rawType).toBe("note");
		expect(p!.restAfterBracket).toBe("Hello");
	});

	it("parses nested depth-2 callout", () => {
		const p = parseCalloutStartLine("> > [!tip] Nested title");
		expect(p).not.toBeNull();
		expect(p!.depth).toBe(2);
		expect(p!.rawType).toBe("tip");
		expect(p!.restAfterBracket).toBe("Nested title");
	});

	it("returns null for plain blockquote", () => {
		expect(parseCalloutStartLine("> just text")).toBeNull();
	});

	it("returns null for non-quote", () => {
		expect(parseCalloutStartLine("hello")).toBeNull();
	});
});

describe("countQuoteDepth / stripQuoteLevels", () => {
	it("counts nested quotes", () => {
		expect(countQuoteDepth("> > foo")).toBe(2);
		expect(countQuoteDepth("  > > [!x]")).toBe(2);
	});

	it("strips quote levels", () => {
		expect(stripQuoteLevels("> > inner", 1)).toBe("> inner");
		expect(stripQuoteLevels("> > inner", 2)).toBe("inner");
	});
});
