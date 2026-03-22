import type { ReportProject } from "../domain/report-project";
import { mergeStyleTokens } from "../domain/style-template";
import { PageSizeResolver } from "./page-size-resolver";

const pageSizeResolver = new PageSizeResolver();

/**
 * Shared layout CSS for `.ra-print-sheet` + `.ra-export-page-body` (PDF, preview iframe, paginator measure).
 * Keeps {@link paginateHtml} scroll measurements aligned with Chromium print layout.
 */
export function buildPrintPageLayoutCss(project: ReportProject): string {
	const page = pageSizeResolver.resolve(project);
	const t = mergeStyleTokens(project.styleTemplate.tokens);
	return `
html, body { margin: 0; background: ${t.pageBackgroundColor} !important; }
.ra-print-sheet {
	width: ${page.width};
	height: ${page.height};
	margin: 0 auto;
	page-break-after: always;
	box-sizing: border-box;
	background: ${t.pageBackgroundColor};
}
.ra-export-page-body {
	height: 100%;
	overflow: hidden;
	box-sizing: border-box;
	padding-top: ${t.pageMarginTop};
	padding-right: ${t.pageMarginRight};
	padding-bottom: ${t.pageMarginBottom};
	padding-left: ${t.pageMarginLeft};
}
/* Large figures: cap to sheet; keep wikilink img dimensions when smaller (no width/height override). */
.ra-print-sheet .ra-export-page-body img:not(.ra-math-export-img),
.ra-print-sheet .ra-export-page-body svg {
	max-width: 100% !important;
	max-height: calc(${page.height} - ${t.pageMarginTop} - ${t.pageMarginBottom}) !important;
	object-fit: contain !important;
	object-position: center !important;
	box-sizing: border-box !important;
}
`.trim();
}
