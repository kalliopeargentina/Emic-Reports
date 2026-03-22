import { describe, expect, it } from "vitest";
import {
	expandDetailsBlocksInMarkdown,
	expandInlineHashtagsToAnchorLinks,
} from "./export-markdown-transforms";

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

describe("expandDetailsBlocksInMarkdown", () => {
	it("preserves inline code like `<details>` inside details body", () => {
		const bt = "\u0060";
		const md =
			"<details>\n<summary>Title</summary>\n\nThis content is hidden inside a " +
			bt +
			"<details>" +
			bt +
			" tag.\n\n</details>";
		const out = expandDetailsBlocksInMarkdown(md);
		expect(out).toContain(`${bt}<details>${bt}`);
		expect(out).not.toMatch(/>>\s*tag/);
	});

	it("replaces details with bold summary and body without tags", () => {
		const md = `<details>
<summary>Click to expand HTML details block</summary>

This content is hidden inside a <details> tag.
You can use Markdown inside here too.

•	Item one
•	Item two

</details>

After.`;
		const out = expandDetailsBlocksInMarkdown(md);
		expect(out).not.toContain("<details");
		expect(out).not.toContain("</details>");
		expect(out).not.toContain("<summary");
		expect(out).toContain("**Click to expand HTML details block**");
		expect(out).toContain("This content is hidden");
		expect(out).toContain("After.");
	});

	it("leaves details inside fenced code unchanged", () => {
		const md =
			"```\n<details><summary>x</summary>inside fence</details>\n```\n\n<details><summary>o</summary>p</details>";
		const out = expandDetailsBlocksInMarkdown(md);
		expect(out).toContain("<details><summary>x</summary>inside fence</details>");
		expect(out).toContain("**o**");
		expect(out).toContain("p");
	});

	it("does not expand details inside double-quoted or single-quoted tag examples", () => {
		const md = `Say "<details></details>" or '<details/>' in docs.`;
		const out = expandDetailsBlocksInMarkdown(md);
		expect(out).toContain('"<details></details>"');
		expect(out).toContain("'<details/>'");
		expect(out).not.toContain("**");
	});
});
