import type { ReportProject } from "../domain/report-project";
import { mergeStyleTokens } from "../domain/style-template";
import { paginateHtml } from "./html-paginator";
import { PageSizeResolver } from "./page-size-resolver";

const pageSizeResolver = new PageSizeResolver();

/** Same shape as the PDF exporter input. */
export interface HtmlPreviewBundle {
	html: string;
	css: string;
}

/**
 * Builds the full HTML document written for headless/Electron PDF (print sheets + export CSS).
 * Shared with {@link PdfExporterElectron} and PDF smoke tests so tests exercise real output shape.
 */
export function buildPrintableHtmlDocument(project: ReportProject, bundle: HtmlPreviewBundle): string {
	const page = pageSizeResolver.resolve(project);
	const pages = paginateHtml(project, bundle.html);
	const t = mergeStyleTokens(project.styleTemplate.tokens);
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<style>${bundle.css}</style>
<style>
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
