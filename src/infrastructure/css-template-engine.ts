import type { ReportProject } from "../domain/report-project";
import { PageSizeResolver } from "./page-size-resolver";

export class CssTemplateEngine {
	private pageSizeResolver = new PageSizeResolver();

	build(project: ReportProject): string {
		const t = project.styleTemplate.tokens;
		const pageSize = this.pageSizeResolver.resolve(project);
		const numberingCss = this.buildHeadingNumberingCss(project.styleTemplate.printRules.headingNumbering);
		const backgroundCss = this.buildBackgroundCss(project);

		return `
:root {
	--ra-font-body: ${t.fontBody};
	--ra-font-heading: ${t.fontHeading};
	--ra-font-mono: ${t.fontMono};
	--ra-text: ${t.colorText};
	--ra-muted: ${t.colorMuted};
	--ra-accent: ${t.colorAccent};
	--ra-body-size: ${t.fontSizeBody}pt;
	--ra-body-line-height: ${t.lineHeightBody};
	--ra-p-spacing: ${t.paragraphSpacing}px;
	--ra-section-spacing: ${t.sectionSpacing}px;
	--ra-page-margin-top: ${t.pageMarginTop};
	--ra-page-margin-right: ${t.pageMarginRight};
	--ra-page-margin-bottom: ${t.pageMarginBottom};
	--ra-page-margin-left: ${t.pageMarginLeft};
}

.ra-render-frame {
	color: var(--ra-text);
	font-family: var(--ra-font-body);
	font-size: var(--ra-body-size);
	line-height: var(--ra-body-line-height);
	background: #ffffff !important;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

.ra-render-frame p {
	margin-top: var(--ra-p-spacing);
	text-align: justify;
}

.ra-render-frame h1, .ra-render-frame h2, .ra-render-frame h3, .ra-render-frame h4, .ra-render-frame h5, .ra-render-frame h6 {
	font-family: var(--ra-font-heading);
	color: var(--ra-text);
	page-break-after: avoid;
	page-break-inside: avoid;
	margin-top: var(--ra-section-spacing);
}

.ra-render-frame h1 { font-size: ${t.h1Size}pt; }
.ra-render-frame h2 { font-size: ${t.h2Size}pt; }
.ra-render-frame h3 { font-size: ${t.h3Size}pt; }
.ra-render-frame h4 { font-size: ${t.h4Size}pt; }
.ra-render-frame h5 { font-size: ${t.h5Size}pt; }
.ra-render-frame h6 { font-size: ${t.h6Size}pt; }

.ra-render-frame code, .ra-render-frame pre {
	font-family: var(--ra-font-mono);
}

.ra-render-frame img, .ra-render-frame svg, .ra-render-frame table {
	page-break-inside: avoid;
}

.ra-cover-page {
	position: relative;
	min-height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
}

.ra-cover-bg {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0.2;
}

.ra-cover-content {
	position: relative;
	z-index: 1;
}

.ra-cover-title {
	font-size: ${t.h1Size}pt;
	margin-bottom: 8px;
}

.ra-cover-subtitle {
	font-size: ${t.h3Size}pt;
	margin-bottom: 6px;
}

.ra-cover-authors {
	font-size: ${t.fontSizeBody}pt;
}

${numberingCss}
${backgroundCss}

@media print {
	@page {
		size: ${pageSize.width} ${pageSize.height};
		margin: var(--ra-page-margin-top) var(--ra-page-margin-right) var(--ra-page-margin-bottom) var(--ra-page-margin-left);
	}
	body {
		color: var(--ra-text) !important;
	}
	.ra-page-break {
		page-break-after: always;
	}
}
`.trim();
	}

	private buildHeadingNumberingCss(mode: "none" | "h2-h4" | "h1-h6"): string {
		if (mode === "none") return "";
		if (mode === "h2-h4") {
			return `
.ra-render-frame { counter-reset: h2counter h3counter h4counter; }
.ra-render-frame h2 { counter-increment: h2counter; counter-reset: h3counter; }
.ra-render-frame h2::before { content: counter(h2counter) ". "; }
.ra-render-frame h3 { counter-increment: h3counter; counter-reset: h4counter; }
.ra-render-frame h3::before { content: counter(h2counter) "." counter(h3counter) ". "; }
.ra-render-frame h4 { counter-increment: h4counter; }
.ra-render-frame h4::before { content: counter(h2counter) "." counter(h3counter) "." counter(h4counter) ". "; }
`.trim();
		}
		return `
.ra-render-frame { counter-reset: h1counter h2counter h3counter h4counter h5counter h6counter; }
.ra-render-frame h1 { counter-increment: h1counter; counter-reset: h2counter; }
.ra-render-frame h1::before { content: counter(h1counter) ". "; }
.ra-render-frame h2 { counter-increment: h2counter; counter-reset: h3counter; }
.ra-render-frame h2::before { content: counter(h1counter) "." counter(h2counter) ". "; }
`.trim();
	}

	private buildBackgroundCss(project: ReportProject): string {
		if (!project.backgroundImage?.assetPath) return "";
		return `
.ra-render-frame {
	position: relative;
}
.ra-render-frame::before {
	content: "";
	position: fixed;
	inset: 0;
	z-index: -1;
	background-image: url("${project.backgroundImage.assetPath}");
	background-position: center center;
	background-size: ${project.backgroundImage.fitMode === "repeat" ? "auto" : project.backgroundImage.fitMode};
	background-repeat: ${project.backgroundImage.fitMode === "repeat" ? "repeat" : "no-repeat"};
	opacity: ${project.backgroundImage.opacity};
}
`.trim();
	}
}
