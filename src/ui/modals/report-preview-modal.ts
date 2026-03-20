import { Modal, Setting, type App } from "obsidian";
import type { ReportProject } from "../../domain/report-project";
import { paginateHtml } from "../../infrastructure/html-paginator";
import { PageSizeResolver } from "../../infrastructure/page-size-resolver";

export class ReportPreviewModal extends Modal {
	private pageSizeResolver = new PageSizeResolver();
	private pageEls: HTMLElement[] = [];
	private currentIndex = 0;
	private pageLabelEl: HTMLElement | null = null;
	private pageHostEl: HTMLElement | null = null;

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
		new Setting(controlsEl)
			.addButton((btn) =>
				btn.setButtonText("Previous").onClick(() => {
					this.goToPage(this.currentIndex - 1);
				}),
			)
			.addExtraButton((btn) =>
				btn.setIcon("left-arrow").setTooltip("Previous page").onClick(() => {
					this.goToPage(this.currentIndex - 1);
				}),
			)
			.addExtraButton((btn) =>
				btn.setIcon("right-arrow").setTooltip("Next page").onClick(() => {
					this.goToPage(this.currentIndex + 1);
				}),
			)
			.addButton((btn) =>
				btn.setButtonText("Next").onClick(() => {
					this.goToPage(this.currentIndex + 1);
				}),
			);

		this.pageLabelEl = controlsEl.createEl("span", { cls: "ra-page-label", text: "Page 1/1" });
		this.pageHostEl = this.contentEl.createDiv({ cls: "ra-live-preview" });

		void this.renderPages();
	}

	onClose(): void {
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
			const body = this.createPageBody(pageSize);
			const pageDoc = new DOMParser().parseFromString(`<div id="ra-page">${pageHtml}</div>`, "text/html");
			const pageRoot = pageDoc.getElementById("ra-page");
			const nodes = pageRoot ? Array.from(pageRoot.children) : [];
			for (const node of nodes) {
				body.appendChild(node.cloneNode(true));
			}
		}

		this.goToPage(0);
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
	}

	private createPageBody(pageSize: { width: string; height: string }): HTMLElement {
		if (!this.pageHostEl) {
			throw new Error("Preview host is not ready.");
		}
		const frame = this.pageHostEl.createDiv({ cls: "ra-paper-frame" });
		frame.style.width = pageSize.width;
		frame.style.height = pageSize.height;
		this.applyPageStyles(frame);
		frame.style.paddingTop = this.project.styleTemplate.tokens.pageMarginTop;
		frame.style.paddingRight = this.project.styleTemplate.tokens.pageMarginRight;
		frame.style.paddingBottom = this.project.styleTemplate.tokens.pageMarginBottom;
		frame.style.paddingLeft = this.project.styleTemplate.tokens.pageMarginLeft;

		const body = frame.createDiv({ cls: "ra-render-frame ra-page-body" });
		this.pageEls.push(frame);
		return body;
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
