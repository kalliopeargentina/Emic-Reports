import { describe, expect, it } from "vitest";
import { preprocessDocxFootnotesForExport } from "./docx-footnotes-preprocess";

describe("preprocessDocxFootnotesForExport", () => {
	it("strips column-0 footnote definitions and keeps references", () => {
		const md = "Hello[^1]\n\n[^1]: First note.\n";
		const { lines, definitions } = preprocessDocxFootnotesForExport(md.split("\n"));
		expect(lines.join("\n").trimEnd()).toBe("Hello[^1]");
		expect([...definitions.entries()]).toEqual([["1", "First note."]]);
	});

	it("recognizes definitions with leading whitespace (composer indent)", () => {
		const { lines, definitions } = preprocessDocxFootnotesForExport([
			"    Here[^1]",
			"",
			"    [^1]: Indented def.",
		]);
		expect(lines).toEqual(["    Here[^1]", ""]);
		expect([...definitions.entries()]).toEqual([["1", "Indented def."]]);
	});

	it("strips CRLF from lines before matching definitions", () => {
		const { lines, definitions } = preprocessDocxFootnotesForExport(["Hello[^1]\r", "", "[^1]: Body\r"]);
		expect(lines.join("\n").trimEnd()).toBe("Hello[^1]");
		expect(definitions.get("1")).toBe("Body");
	});
});
