// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createAcademicExportTemplate, mergeStyleTokens } from "../domain/style-template";
import { highlightCodeToDocxRuns } from "./docx-code-highlight";

const tokens = mergeStyleTokens(createAcademicExportTemplate().tokens);

describe("highlightCodeToDocxRuns", () => {
	const toDocx = (hex: string) => hex.replace(/^#/, "").toUpperCase();
	const pt2hp = (pt: number) => Math.max(2, Math.round(pt * 2));

	it("emits multiple runs for highlighted Python", () => {
		const runs = highlightCodeToDocxRuns(
			'def hello():\n    return "x"',
			"python",
			tokens,
			toDocx,
			pt2hp,
		);
		expect(runs.length).toBeGreaterThan(2);
	});

	it("produces runs for plaintext fallback", () => {
		const runs = highlightCodeToDocxRuns("a\nb", "", tokens, toDocx, pt2hp);
		expect(runs.length).toBeGreaterThanOrEqual(2);
	});
});
