import { Modal, type App } from "obsidian";
import type { ReportProject } from "../../domain/report-project";
import { paginateHtml } from "../../infrastructure/html-paginator";
import { PageSizeResolver } from "../../infrastructure/page-size-resolver";

export class ReportPreviewModal extends Modal {
	private pageSizeResolver = new PageSizeResolver();
	/** One slot per page (visibility toggled); contains scale wrapper + paper frame. */
	private pageEls: HTMLElement[] = [];
	private currentIndex = 0;
	private pageLabelEl: HTMLElement | null = null;
	private pageHostEl: HTMLElement | null = null;
	private previewResizeObs: ResizeObserver | null = null;

	constructor(
		app: App,
		private project: ReportProject,
		private previewHtml: string,
		private previewCss = "",
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Report preview");
		this.contentEl.empty();
		this.contentEl.addClass("ra-preview-modal");

		if (this.previewCss.trim()) {
			this.contentEl.createEl("style", { text: this.previewCss });
		}

		const controlsEl = this.contentEl.createDiv({ cls: "ra-preview-controls" });
		const prevBtn = controlsEl.createEl("button", { cls: "mod-cta", text: "Previous" });
		prevBtn.addEventListener("click", () => this.goToPage(this.currentIndex - 1));
		const nextBtn = controlsEl.createEl("button", { cls: "mod-cta", text: "Next" });
		nextBtn.addEventListener("click", () => this.goToPage(this.currentIndex + 1));
		this.pageLabelEl = controlsEl.createEl("span", { cls: "ra-page-label", text: "Page 1/1" });
		this.pageHostEl = this.contentEl.createDiv({ cls: "ra-live-preview ra-preview-fit-host" });

		void this.renderPages();
	}

	onClose(): void {
		this.previewResizeObs?.disconnect();
		this.previewResizeObs = null;
		this.contentEl.empty();
	}

	private async renderPages(): Promise<void> {
		if (!this.pageHostEl) return;
		this.pageHostEl.empty();
		this.pageEls = [];
		this.currentIndex = 0;

		const pageSize = this.pageSizeResolver.resolve(this.project);
		const pages = paginateHtml(this.project, this.previewHtml);
		for (const pageHtml of pages) {
			const body = this.createPageSlotAndBody(pageSize);
			const pageDoc = new DOMParser().parseFromString(`<div id="ra-page">${pageHtml}</div>`, "text/html");
			const pageRoot = pageDoc.getElementById("ra-page");
			const nodes = pageRoot ? Array.from(pageRoot.children) : [];
			for (const node of nodes) {
				body.appendChild(node.cloneNode(true));
			}
		}

		this.goToPage(0);
		this.attachPreviewResizeObserver();
		requestAnimationFrame(() => {
			this.updatePreviewPageScale();
			requestAnimationFrame(() => this.updatePreviewPageScale());
		});
	}

	private goToPage(index: number): void {
		if (this.pageEls.length === 0) return;
		const clamped = Math.max(0, Math.min(index, this.pageEls.length - 1));
		this.currentIndex = clamped;
		this.pageEls.forEach((page, i) => {
			page.toggleClass("ra-page-hidden", i !== clamped);
		});
		if (this.pageLabelEl) {
			this.pageLabelEl.setText(`Page ${clamped + 1}/${this.pageEls.length}`);
		}
		requestAnimationFrame(() => this.updatePreviewPageScale());
	}

	/**
	 * Slots fill the preview host; inner paper keeps true page size, then scales down to fit (no modal resize).
	 */
	private createPageSlotAndBody(pageSize: { width: string; height: string }): HTMLElement {
		if (!this.pageHostEl) {
			throw new Error("Preview host is not ready.");
		}
		const slot = this.pageHostEl.createDiv({ cls: "ra-preview-page-slot ra-page-hidden" });
		const outer = slot.createDiv({ cls: "ra-preview-scale-outer" });
		const inner = outer.createDiv({ cls: "ra-preview-scale-inner" });
		const frame = inner.createDiv({ cls: "ra-paper-frame ra-preview-paged" });
		frame.style.width = pageSize.width;
		frame.style.height = pageSize.height;
		this.applyPageStyles(frame);
		frame.style.paddingTop = this.project.styleTemplate.tokens.pageMarginTop;
		frame.style.paddingRight = this.project.styleTemplate.tokens.pageMarginRight;
		frame.style.paddingBottom = this.project.styleTemplate.tokens.pageMarginBottom;
		frame.style.paddingLeft = this.project.styleTemplate.tokens.pageMarginLeft;

		const body = frame.createDiv({
			cls: "ra-render-frame ra-page-body markdown-preview-view markdown-reading-view markdown-rendered",
		});
		this.pageEls.push(slot);
		return body;
	}

	private attachPreviewResizeObserver(): void {
		if (!this.pageHostEl) return;
		this.previewResizeObs?.disconnect();
		this.previewResizeObs = new ResizeObserver(() => {
			requestAnimationFrame(() => this.updatePreviewPageScale());
		});
		this.previewResizeObs.observe(this.pageHostEl);
	}

	private updatePreviewPageScale(): void {
		if (!this.pageHostEl) return;
		const slot = this.pageEls[this.currentIndex];
		if (!slot) return;

		const outer = slot.querySelector(".ra-preview-scale-outer") as HTMLElement | null;
		const inner = slot.querySelector(".ra-preview-scale-inner") as HTMLElement | null;
		const frame = slot.querySelector(".ra-paper-frame") as HTMLElement | null;
		if (!outer || !inner || !frame) return;

		const hostW = this.pageHostEl.clientWidth;
		const hostH = this.pageHostEl.clientHeight;
		if (hostW < 4 || hostH < 4) return;

		const fw = frame.offsetWidth;
		const fh = frame.offsetHeight;
		if (fw < 1 || fh < 1) return;

		const s = Math.min(hostW / fw, hostH / fh, 1);

		inner.style.width = `${fw}px`;
		inner.style.height = `${fh}px`;
		inner.style.transform = `scale(${s})`;
		inner.style.transformOrigin = "0 0";

		outer.style.width = `${fw * s}px`;
		outer.style.height = `${fh * s}px`;
	}

	private applyPageStyles(target: HTMLElement): void {
		target.style.setProperty("--ra-font-body", this.project.styleTemplate.tokens.fontBody);
		target.style.setProperty("--ra-font-heading", this.project.styleTemplate.tokens.fontHeading);
		target.style.setProperty("--ra-font-mono", this.project.styleTemplate.tokens.fontMono);
		target.style.setProperty("--ra-text", this.project.styleTemplate.tokens.colorText);
		target.style.setProperty("--ra-body-size", `${this.project.styleTemplate.tokens.fontSizeBody}pt`);
		target.style.setProperty(
			"--ra-body-line-height",
			String(this.project.styleTemplate.tokens.lineHeightBody),
		);
		target.style.setProperty(
			"--ra-p-spacing",
			`${this.project.styleTemplate.tokens.paragraphSpacing}px`,
		);
		target.style.setProperty(
			"--ra-section-spacing",
			`${this.project.styleTemplate.tokens.sectionSpacing}px`,
		);
	}
}
