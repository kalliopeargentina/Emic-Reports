/**
 * Headless Chromium → real PDF bytes → pdf-parse text (same HTML as {@link buildPrintableHtmlDocument}).
 * Skips if no Chrome/Edge/Chromium is installed (common in minimal CI).
 */
// @vitest-environment happy-dom — paginateHtml needs DOM; PDFParse + Chromium run in same test

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../domain/report-project";
import { CssTemplateEngine } from "./css-template-engine";
import { resolveChromiumBinary } from "./chromium-resolve";
import { buildPrintableHtmlDocument } from "./pdf-print-html";

const execFileAsync = promisify(execFile);

const chromium = resolveChromiumBinary();
const describePdf = chromium ? describe : describe.skip;

describePdf("PDF export smoke (headless Chromium → pdf-parse)", () => {
	it(
		"buildPrintableHtmlDocument output prints and extracted text includes marker",
		async () => {
			const dir = mkdtempSync(join(tmpdir(), "emic-reports-pdf-"));
			try {
				const project = createEmptyProject("pdf-smoke");
				const css = new CssTemplateEngine().build(project);
				/** Single token so PDF text extraction can still match if spaces are inserted */
				const marker = "SMOKETESTPDFEXPORT";
				const innerHtml = `<h2>Callouts</h2>
<div class="callout" data-callout="note">
<div class="callout-title-inner">Note</div>
<div class="callout-content"><p>${marker}</p></div>
</div>`;
				const doc = buildPrintableHtmlDocument(project, { html: innerHtml, css });
				const htmlPath = join(dir, "smoke.html");
				const pdfPath = join(dir, "smoke.pdf");
				writeFileSync(htmlPath, doc, "utf8");
				const htmlUrl = pathToFileURL(htmlPath).href;

				await execFileAsync(
					chromium!,
					[
						"--headless",
						"--disable-gpu",
						"--disable-print-preview",
						"--no-first-run",
						"--no-default-browser-check",
						"--allow-file-access-from-files",
						"--no-pdf-header-footer",
						"--virtual-time-budget=20000",
						`--print-to-pdf=${pdfPath}`,
						"--print-to-pdf-no-header",
						htmlUrl,
					],
					{ timeout: 120000 },
				);

				const buf = readFileSync(pdfPath);
				expect(buf.length).toBeGreaterThan(400);
				const parser = new PDFParse({ data: new Uint8Array(buf) });
				const textResult = await parser.getText();
				await parser.destroy();
				expect(textResult.pages.length).toBeGreaterThan(0);
				const flat = (textResult.text ?? "").replace(/\s+/g, "");
				expect(flat).toContain(marker);
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		120000,
	);
});
