import type { ReportProject } from "../domain/report-project";
import { PageSizeResolver } from "./page-size-resolver";

const pageSizeResolver = new PageSizeResolver();

/** How deep to unwrap a single wrapper div/section when flattening pagination candidates. */
const MAX_FLATTEN_DEPTH = 8;

function isUnwrappableTag(tagName: string): boolean {
	const u = tagName.toUpperCase();
	return u === "DIV" || u === "SECTION" || u === "ARTICLE" || u === "MAIN";
}

function shouldStopFlatten(el: Element): boolean {
	const tag = el.tagName.toUpperCase();
	if (tag === "PRE" || tag === "TABLE" || tag === "IMG" || tag === "SVG" || tag === "CANVAS") {
		return true;
	}
	if (el.classList.contains("callout")) return true;
	return false;
}

/**
 * When `#ra-root` has a single wrapper around all blocks (common for MarkdownRenderer),
 * unwrap so pagination can split siblings. Does not unwrap PRE/TABLE/callout or atomic blocks.
 */
export function flattenPaginableNodes(root: Element): Element[] {
	let nodes: Element[] = Array.from(root.children);
	let depth = 0;
	while (nodes.length === 1 && depth < MAX_FLATTEN_DEPTH) {
		const only = nodes[0]!;
		if (shouldStopFlatten(only)) break;
		if (!isUnwrappableTag(only.tagName)) break;
		const inner = Array.from(only.children);
		if (inner.length <= 1) break;
		nodes = inner;
		depth += 1;
	}
	return nodes;
}

/**
 * Whether we may replace this element with its children in the pagination queue.
 * Important: wrappers that contain BOTH a heading and a `.callout` sibling must be splittable —
 * do **not** reject expansion just because a **child** is a callout (that blocked heading+callout splits).
 * Never expand the callout root itself (`blockquote.callout` / `.callout` container).
 */
function canExpandPaginableNode(el: Element): boolean {
	const tag = el.tagName.toUpperCase();
	if (tag !== "DIV" && tag !== "SECTION" && tag !== "ARTICLE") return false;
	if (el.classList.contains("callout")) return false;
	const children = Array.from(el.children);
	if (children.length <= 1) return false;
	for (const c of children) {
		const ct = c.tagName.toUpperCase();
		if (ct === "PRE" || ct === "TABLE") return false;
	}
	return true;
}

/** Prefer direct child; Obsidian uses `.callout-content` immediately inside the callout root. */
function findCalloutContent(callout: HTMLElement): HTMLElement | null {
	for (let i = 0; i < callout.children.length; i++) {
		const c = callout.children[i]!;
		if (c.classList.contains("callout-content")) return c as HTMLElement;
	}
	const deep = callout.querySelector(".callout-content");
	return deep instanceof HTMLElement ? deep : null;
}

const MAX_CALLOUT_CONTENT_SPLITS = 48;

/**
 * When a callout is too tall for one PDF page, split it into several callout shells that each
 * contain one block child of `.callout-content` (title cloned only on the first segment).
 * Without this, the whole callout stays one node and `.ra-export-page-body { overflow:hidden }` clips it.
 */
export function splitCalloutByContentBlocks(originalNode: HTMLElement): HTMLElement[] | null {
	if (!originalNode.classList.contains("callout")) return null;
	const contentEl = findCalloutContent(originalNode);
	if (!contentEl) return null;
	const blocks = Array.from(contentEl.children);
	if (blocks.length <= 1) return null;
	if (blocks.length > MAX_CALLOUT_CONTENT_SPLITS) return null;

	const doc = originalNode.ownerDocument;
	if (!doc) return null;

	const tag = originalNode.tagName.toLowerCase();
	const titleDirect = originalNode.querySelector(":scope > .callout-title");
	const titleEl =
		titleDirect instanceof HTMLElement
			? titleDirect
			: (originalNode.querySelector(".callout-title") as HTMLElement | null);

	const segments: HTMLElement[] = [];
	for (let i = 0; i < blocks.length; i++) {
		const shell = doc.createElement(tag) as HTMLElement;
		for (let a = 0; a < originalNode.attributes.length; a++) {
			const attr = originalNode.attributes[a]!;
			shell.setAttribute(attr.name, attr.value);
		}
		if (titleEl && i === 0) {
			shell.appendChild(titleEl.cloneNode(true) as HTMLElement);
		}
		const newContent = doc.createElement("div");
		newContent.className = contentEl.className;
		newContent.appendChild(blocks[i]!.cloneNode(true));
		shell.appendChild(newContent);
		segments.push(shell);
	}
	return segments;
}

/** Match Reading / preview modal so block layout (e.g. callouts) measures consistently. */
const PAGE_BODY_CLASSES =
	"ra-render-frame ra-page-body markdown-preview-view markdown-reading-view markdown-rendered";

function createDiv(cls: string): HTMLDivElement {
	const el = document.createElement("div");
	el.className = cls;
	return el;
}

function clearElement(el: HTMLElement): void {
	el.replaceChildren();
}

export function paginateHtml(project: ReportProject, html: string): string[] {
	const pageSize = pageSizeResolver.resolve(project);
	const measureHost = createDiv("ra-measure-source");
	measureHost.style.width = pageSize.width;
	measureHost.style.minHeight = pageSize.height;
	document.body.appendChild(measureHost);

	const frame = createDiv("ra-paper-frame");
	frame.style.width = pageSize.width;
	frame.style.height = pageSize.height;
	applyPageStyles(frame, project);
	frame.style.paddingTop = project.styleTemplate.tokens.pageMarginTop;
	frame.style.paddingRight = project.styleTemplate.tokens.pageMarginRight;
	frame.style.paddingBottom = project.styleTemplate.tokens.pageMarginBottom;
	frame.style.paddingLeft = project.styleTemplate.tokens.pageMarginLeft;
	measureHost.appendChild(frame);

	const body = createDiv(PAGE_BODY_CLASSES);
	frame.appendChild(body);

	const doc = new DOMParser().parseFromString(`<div id="ra-root">${html}</div>`, "text/html");
	const sourceRoot = doc.getElementById("ra-root");
	const sourceNodes = sourceRoot ? flattenPaginableNodes(sourceRoot) : [];

	const queue: Element[] = [...sourceNodes];
	const pageElements: HTMLElement[][] = [];
	let currentPage: HTMLElement[] = [];

	const pushPage = () => {
		if (currentPage.length > 0) {
			pageElements.push(currentPage);
			currentPage = [];
		}
		clearElement(body);
	};

	while (queue.length > 0) {
		const originalNode = queue.shift()!;
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

			const calloutSegments = splitCalloutByContentBlocks(originalNode as HTMLElement);
			if (calloutSegments && calloutSegments.length > 1) {
				for (let i = calloutSegments.length - 1; i >= 0; i--) {
					queue.unshift(calloutSegments[i]!);
				}
				continue;
			}

			if (canExpandPaginableNode(originalNode)) {
				const children = Array.from(originalNode.children);
				for (let i = children.length - 1; i >= 0; i--) {
					queue.unshift(children[i]!);
				}
				continue;
			}

			pushPage();

			const retry = originalNode.cloneNode(true) as HTMLElement;
			body.appendChild(retry);
			currentPage.push(retry.cloneNode(true) as HTMLElement);

			if (body.scrollHeight > body.clientHeight) {
				// Single block still overflows page: keep it (PDF may clip) — do not re-queue.
			}
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
