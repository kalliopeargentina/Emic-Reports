import type { ReportProject } from "../domain/report-project";
import { paginateHtml } from "./html-paginator";
import { buildPrintPageLayoutCss } from "./print-layout-css";
import { applyTocPageNumbersToPaginatedSheets } from "./toc-html";

/** @public Re-export for callers that already imported from this module. */
export { buildPrintPageLayoutCss } from "./print-layout-css";

/** Same shape as the PDF exporter input. */
export interface HtmlPreviewBundle {
	html: string;
	css: string;
}

/** Avoid breaking out of &lt;script&gt; if user HTML contains literal &lt;/script&gt; (e.g. code samples). */
export function escapeHtmlForPreviewSrcdoc(html: string): string {
	return html.replace(/<\/script/gi, "<\\/script");
}

/**
 * One printable page in a **standalone** mini-document — same shell as PDF (no Obsidian app CSS).
 * Used by {@link ReportPreviewModal} so callouts / layout match headless print, not the vault UI.
 */
export function buildIsolatedPreviewPageDocument(
	project: ReportProject,
	pageInnerHtml: string,
	exportCss: string,
): string {
	const safe = escapeHtmlForPreviewSrcdoc(pageInnerHtml);
	const layoutCss = buildPrintPageLayoutCss(project);
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<style>${exportCss}</style>
<style>${layoutCss}</style>
</head>
<body>
<div class="ra-print-sheet">
<div class="ra-render-frame ra-export-page-body">${safe}</div>
</div>
</body>
</html>`;
}

/**
 * Builds the full HTML document written for headless/Electron PDF (print sheets + export CSS).
 * Shared with {@link PdfExporterElectron} and PDF smoke tests so tests exercise real output shape.
 */
export function buildPrintableHtmlDocument(project: ReportProject, bundle: HtmlPreviewBundle): string {
	const rawPages = paginateHtml(project, bundle.html, { exportCss: bundle.css });
	const pages = applyTocPageNumbersToPaginatedSheets(rawPages);
	const layoutCss = buildPrintPageLayoutCss(project);
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<style>${bundle.css}</style>
<style>
${layoutCss}
</style>
<script>
async function waitForAssets() {
	const images = Array.from(document.images || []);
	await Promise.all(images.map(async (img) => {
		try {
			if (img.decode) await img.decode();
		} catch {}
		if (img.complete && img.naturalWidth > 0) return;
		return new Promise((resolve) => {
			img.addEventListener("load", resolve, { once: true });
			img.addEventListener("error", resolve, { once: true });
		});
	}));
	if (document.fonts && document.fonts.ready) {
		try { await document.fonts.ready; } catch {}
	}
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	document.body.setAttribute("data-ra-ready", "1");
}
window.addEventListener("load", () => { void waitForAssets(); });
</script>
</head>
<body>
${pages
	.map(
		(pageHtml) => `<div class="ra-print-sheet">
<div class="ra-render-frame ra-export-page-body">${pageHtml}</div>
</div>`,
	)
	.join("\n")}
</body>
</html>`;
}
