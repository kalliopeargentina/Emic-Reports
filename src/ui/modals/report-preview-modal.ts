import { Modal, type App } from "obsidian";
import type { ReportProject } from "../../domain/report-project";
import { paginateHtml } from "../../infrastructure/html-paginator";
import { buildIsolatedPreviewPageDocument } from "../../infrastructure/pdf-print-html";
import { PageSizeResolver } from "../../infrastructure/page-size-resolver";

export class ReportPreviewModal extends Modal {
	private pageSizeResolver = new PageSizeResolver();
	/** One slot per page (visibility toggled); contains scale wrapper + isolated iframe (same document shell as PDF). */
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

		/** Export CSS is injected only inside each iframe (standalone document like PDF), not on the modal — Obsidian UI CSS was hiding callout content. */

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
		const css = this.previewCss.trim() ? this.previewCss : "/* no export css */";
		const pages = paginateHtml(this.project, this.previewHtml, { exportCss: css });

		for (const pageHtml of pages) {
			const slot = this.createPageSlot(pageSize);
			const iframe = slot.querySelector("iframe.ra-preview-page-iframe") as HTMLIFrameElement | null;
			if (iframe) {
				iframe.srcdoc = buildIsolatedPreviewPageDocument(this.project, pageHtml, css);
				iframe.addEventListener(
					"load",
					() => {
						requestAnimationFrame(() => this.updatePreviewPageScale());
					},
					{ once: true },
				);
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
	 * One page = one iframe with the same standalone HTML as PDF (export CSS + layout only inside the document).
	 */
	private createPageSlot(pageSize: { width: string; height: string }): HTMLElement {
		if (!this.pageHostEl) {
			throw new Error("Preview host is not ready.");
		}
		const slot = this.pageHostEl.createDiv({ cls: "ra-preview-page-slot ra-page-hidden" });
		const outer = slot.createDiv({ cls: "ra-preview-scale-outer" });
		const inner = outer.createDiv({ cls: "ra-preview-scale-inner" });
		const iframe = inner.createEl("iframe", {
			cls: "ra-preview-page-iframe",
		});
		iframe.setAttribute("sandbox", "allow-same-origin");
		iframe.setAttribute("title", "Report page preview");
		iframe.style.width = pageSize.width;
		iframe.style.height = pageSize.height;
		iframe.style.border = "0";
		iframe.style.display = "block";
		iframe.style.background = "white";
		this.pageEls.push(slot);
		return slot;
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
		const iframe = slot.querySelector("iframe.ra-preview-page-iframe") as HTMLIFrameElement | null;
		if (!outer || !inner || !iframe) return;

		const hostW = this.pageHostEl.clientWidth;
		const hostH = this.pageHostEl.clientHeight;
		if (hostW < 4 || hostH < 4) return;

		const fw = iframe.offsetWidth;
		const fh = iframe.offsetHeight;
		if (fw < 1 || fh < 1) return;

		const s = Math.min(hostW / fw, hostH / fh, 1);

		inner.style.width = `${fw}px`;
		inner.style.height = `${fh}px`;
		inner.style.transform = `scale(${s})`;
		inner.style.transformOrigin = "0 0";

		outer.style.width = `${fw * s}px`;
		outer.style.height = `${fh * s}px`;
	}
}
