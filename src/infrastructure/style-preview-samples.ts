import type { StyleEditorTabId } from "../domain/style-editor-tab-ids";

const TITLES: Record<StyleEditorTabId, string> = {
	"page-print": "Page & print",
	typography: "Typography",
	"headings-credits": "Headings & credits",
	"links-tags": "Links & tags",
	code: "Code",
	"syntax-colors": "Syntax colors",
	callouts: "Callouts",
	blocks: "Blocks",
	"math-figures": "Math & figures",
};

/** Short markdown focused on the UI tab being edited (rendered like export HTML). */
const MARKDOWN: Record<StyleEditorTabId, string> = {
	"page-print": [
		"## Page and print sample",
		"",
		"Paragraph text shows **body** font, spacing, and colors from the *Typography* tab too.",
		"",
		"---",
		"",
		"Content after a horizontal rule (hr page-break behavior applies in print).",
		"",
		"Another paragraph before the rule below.",
		"",
		"---",
		"",
		"Final line on this sheet preview.",
	].join("\n"),

	typography: [
		"Sample paragraph with **strong** and *emphasis* for body font, size, line height, alignment, and spacing.",
		"",
		"Second paragraph to show paragraph spacing and justified or ragged text.",
		"",
		"Third short line.",
	].join("\n"),

	"headings-credits": [
		"# Main title (H1)",
		"",
		"## Section (H2)",
		"",
		"### Subsection (H3)",
		"",
		"#### Detail (H4)",
		"",
		"##### Small heading (H5)",
		"",
		"###### Minor heading (H6)",
		"",
		'<del>Credits block (uses del styling from the template)</del>',
	].join("\n"),

	"links-tags": [
		"[External link](https://example.com)",
		"",
		"[Internal style](Style%20preview.md)",
		"",
		"Inline tag example: #sample-tag",
	].join("\n"),

	code: [
		"Inline `code` and fenced block:",
		"",
		"```text",
		"Plain fenced block (wrap and borders follow Code tab).",
		"```",
		"",
		"==Default highlight== and body line after.",
		"",
		"```javascript",
		"const x = 1; // colors mostly on Syntax colors tab",
		"```",
	].join("\n"),

	"syntax-colors": [
		"Fenced code to exercise **hljs** / Prism token colors:",
		"",
		"```javascript",
		"// comment",
		"const keywords = true;",
		"let str = 'string';",
		"function fn(a) { return a + 1; }",
		"class Box { }",
		"export const n = 42;",
		"```",
		"",
		"```typescript",
		"type T = string | number;",
		"```",
	].join("\n"),

	callouts: [
		"> [!note] Note callout",
		"> Body with **bold** and a second line.",
		"",
		"> [!warning] Warning",
		"> Different accent color.",
		"",
		"> [!tip] Tip",
		"> Short content.",
	].join("\n"),

	blocks: [
		"| Column A | Column B |",
		"| --- | --- |",
		"| Alpha | Beta |",
		"| 1 | 2 |",
		"",
		"- Bullet one",
		"- Bullet two",
		"  - Nested item",
		"",
		"> Blockquote line one.",
		"> Blockquote line two.",
		"",
		"<details>",
		"<summary>Summary line</summary>",
		"",
		"Details body paragraph.",
		"",
		"</details>",
	].join("\n"),

	"math-figures": [
		"Inline math: $E = mc^2$ and display:",
		"",
		"$$",
		"\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
		"$$",
		"",
		"```mermaid",
		"flowchart LR",
		"  A[Diagram] --> B[Preview]",
		"```",
		"",
		"*Figure: Mermaid uses Diagrams / Math tab colors where applicable.*",
	].join("\n"),
};

export function getStylePreviewMarkdown(tabId: StyleEditorTabId): string {
	return MARKDOWN[tabId];
}

export function getStylePreviewTabTitle(tabId: StyleEditorTabId): string {
	return TITLES[tabId];
}
