import type { ReportProject } from "../domain/report-project";
import { PageSizeResolver } from "./page-size-resolver";

const pageSizeResolver = new PageSizeResolver();

export function paginateHtml(project: ReportProject, html: string): string[] {
	const pageSize = pageSizeResolver.resolve(project);
	const measureHost = document.body.createDiv({ cls: "ra-measure-source" });
	measureHost.style.width = pageSize.width;
	measureHost.style.minHeight = pageSize.height;

	const frame = measureHost.createDiv({ cls: "ra-paper-frame" });
	frame.style.width = pageSize.width;
	frame.style.height = pageSize.height;
	applyPageStyles(frame, project);
	frame.style.paddingTop = project.styleTemplate.tokens.pageMarginTop;
	frame.style.paddingRight = project.styleTemplate.tokens.pageMarginRight;
	frame.style.paddingBottom = project.styleTemplate.tokens.pageMarginBottom;
	frame.style.paddingLeft = project.styleTemplate.tokens.pageMarginLeft;

	const body = frame.createDiv({ cls: "ra-render-frame ra-page-body" });

	const doc = new DOMParser().parseFromString(`<div id="ra-root">${html}</div>`, "text/html");
	const sourceRoot = doc.getElementById("ra-root");
	const sourceNodes = sourceRoot ? Array.from(sourceRoot.children) : [];

	const pageElements: HTMLElement[][] = [];
	let currentPage: HTMLElement[] = [];

	const pushPage = () => {
		if (currentPage.length > 0) {
			pageElements.push(currentPage);
			currentPage = [];
		}
		body.empty();
	};

	for (const originalNode of sourceNodes) {
		const tagName = originalNode.tagName.toUpperCase();
		if (tagName === "HR") {
			pushPage();
			continue;
		}

		const clone = originalNode.cloneNode(true) as HTMLElement;
		body.appendChild(clone);
		currentPage.push(clone.cloneNode(true) as HTMLElement);

		if (body.scrollHeight > body.clientHeight) {
			body.removeChild(clone);
			currentPage.pop();
			pushPage();

			const firstOnNext = originalNode.cloneNode(true) as HTMLElement;
			body.appendChild(firstOnNext);
			currentPage.push(firstOnNext.cloneNode(true) as HTMLElement);
		}
	}

	pushPage();
	measureHost.remove();

	if (pageElements.length === 0) {
		return [html];
	}

	return pageElements.map((elements) => elements.map((el) => el.outerHTML).join("\n"));
}

function applyPageStyles(target: HTMLElement, project: ReportProject): void {
	target.style.setProperty("--ra-font-body", project.styleTemplate.tokens.fontBody);
	target.style.setProperty("--ra-font-heading", project.styleTemplate.tokens.fontHeading);
	target.style.setProperty("--ra-font-mono", project.styleTemplate.tokens.fontMono);
	target.style.setProperty("--ra-text", project.styleTemplate.tokens.colorText);
	target.style.setProperty("--ra-body-size", `${project.styleTemplate.tokens.fontSizeBody}pt`);
	target.style.setProperty(
		"--ra-body-line-height",
		String(project.styleTemplate.tokens.lineHeightBody),
	);
	target.style.setProperty("--ra-p-spacing", `${project.styleTemplate.tokens.paragraphSpacing}px`);
	target.style.setProperty(
		"--ra-section-spacing",
		`${project.styleTemplate.tokens.sectionSpacing}px`,
	);
}
