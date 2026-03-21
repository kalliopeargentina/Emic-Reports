import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCalloutStartLine } from "./callout-markdown";

const FIXTURE = join(process.cwd(), "obsidian_syntax_test.md");

function extractCalloutsSection(md: string): string {
	const start = md.indexOf("\n## Callouts\n");
	if (start < 0) throw new Error("## Callouts section not found");
	const rest = md.slice(start);
	const end = rest.indexOf("\n## Math\n");
	return end >= 0 ? rest.slice(0, end) : rest;
}

describe("obsidian_syntax_test.md — Callouts section", () => {
	it("fixture file exists at repo root", () => {
		expect(existsSync(FIXTURE)).toBe(true);
	});

	it("every callout opener line parses with parseCalloutStartLine", () => {
		const md = readFileSync(FIXTURE, "utf8");
		const section = extractCalloutsSection(md);
		const lines = section.split("\n");
		const openers: string[] = [];
		for (const line of lines) {
			const t = line.trim();
			if (/^>\s+\[!/.test(t) || /^>\s*>\s*\[!/.test(t)) {
				openers.push(line);
			}
		}
		expect(openers.length).toBeGreaterThan(5);

		for (const line of openers) {
			const p = parseCalloutStartLine(line);
			expect(p, `expected callout parse: ${line}`).not.toBeNull();
			expect(p!.rawType.length).toBeGreaterThan(0);
		}
	});

	it("nested callout line from fixture has depth 2", () => {
		const md = readFileSync(FIXTURE, "utf8");
		const section = extractCalloutsSection(md);
		const nested = section.split("\n").find((l) => l.includes("[!WARNING]") && l.trim().startsWith("> >"));
		expect(nested).toBeDefined();
		const p = parseCalloutStartLine(nested!);
		expect(p).not.toBeNull();
		expect(p!.depth).toBe(2);
		expect(p!.rawType).toBe("warning");
	});
});
