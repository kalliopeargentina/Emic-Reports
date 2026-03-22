import { describe, expect, it } from "vitest";
import {
	deepestSyntheticFolderHeadingLevel,
	shiftMarkdownAtxHeadings,
} from "./markdown-atx-heading-shift";

describe("shiftMarkdownAtxHeadings", () => {
	it("shifts ATX headings by addLevels and clamps at 6", () => {
		const md = "# A\n\n## B\n\n###### C\n";
		expect(shiftMarkdownAtxHeadings(md, 2)).toBe("### A\n\n#### B\n\n###### C\n");
	});

	it("does not change headings inside fenced blocks", () => {
		const md = "# Out\n\n```md\n# In\n## Also\n```\n\n## After\n";
		expect(shiftMarkdownAtxHeadings(md, 1)).toBe("## Out\n\n```md\n# In\n## Also\n```\n\n### After\n");
	});

	it("handles ~~~ fences", () => {
		const md = "~~~\n# no\n~~~\n# yes\n";
		expect(shiftMarkdownAtxHeadings(md, 1)).toBe("~~~\n# no\n~~~\n## yes\n");
	});
});

describe("deepestSyntheticFolderHeadingLevel", () => {
	it("matches folder composer levels", () => {
		expect(deepestSyntheticFolderHeadingLevel(1, 1)).toBe(1);
		expect(deepestSyntheticFolderHeadingLevel(1, 2)).toBe(2);
		expect(deepestSyntheticFolderHeadingLevel(2, 3)).toBe(4);
	});
});
