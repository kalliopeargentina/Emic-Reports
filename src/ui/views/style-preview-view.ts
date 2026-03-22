import { ItemView, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_STYLE_EDITOR_TAB_ID,
	isStyleEditorTabId,
	type StyleEditorTabId,
} from "../../domain/style-editor-tab-ids";
import type { StyleEditorState } from "../../domain/style-editor-state";
import { buildStylePreviewProject } from "../../infrastructure/style-preview-project";
import {
	getStylePreviewMarkdown,
	getStylePreviewTabTitle,
} from "../../infrastructure/style-preview-samples";
import { buildIsolatedPreviewPageDocument } from "../../infrastructure/pdf-print-html";
import type ReportArchitectPlugin from "../../main";

export const STYLE_PREVIEW_VIEW_TYPE = "emic-style-preview-view";

export class StylePreviewView extends ItemView {
	private iframeEl: HTMLIFrameElement | null = null;
	private statusEl: HTMLElement | null = null;
	private debounceMs = 280;
	private debounceHandle = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReportArchitectPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STYLE_PREVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Style preview";
	}

	getIcon(): string {
		return "eye";
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("ra-style-preview-root");
		this.statusEl = root.createDiv({
			cls: "ra-style-preview-status",
			text: "Waiting for style editor…",
		});
		const host = root.createDiv({ cls: "ra-style-preview-iframe-host" });
		this.iframeEl = host.createEl("iframe", {
			cls: "ra-style-preview-iframe",
			attr: {
				title: "Export style preview",
				// Mermaid / similar may need scripts inside the isolated document
				sandbox: "allow-scripts allow-same-origin",
			},
		});
		this.requestRefresh();
	}

	protected async onClose(): Promise<void> {
		window.clearTimeout(this.debounceHandle);
		this.debounceHandle = 0;
		this.iframeEl = null;
		this.statusEl = null;
		this.contentEl.empty();
		await super.onClose();
	}

	/** Debounced refresh when template or active tab changes. */
	requestRefresh(): void {
		window.clearTimeout(this.debounceHandle);
		this.debounceHandle = window.setTimeout(() => {
			void this.runRefresh();
		}, this.debounceMs);
	}

	private getSnapshot(): {
		activeStyleTabId: StyleEditorTabId;
		state: StyleEditorState;
	} | null {
		const src = this.plugin.stylePreviewSnapshotSource;
		if (!src) return null;
		const snap = src.getStylePreviewSnapshot();
		if (!snap) return null;
		const tabId = isStyleEditorTabId(snap.activeStyleTabId)
			? snap.activeStyleTabId
			: DEFAULT_STYLE_EDITOR_TAB_ID;
		return { activeStyleTabId: tabId, state: snap.state };
	}

	private async runRefresh(): Promise<void> {
		if (!this.iframeEl || !this.statusEl) return;

		const snap = this.getSnapshot();
		if (!snap) {
			this.statusEl.setText("Open the style template editor (ribbon or command) to live preview.");
			return;
		}

		const { activeStyleTabId, state } = snap;
		this.statusEl.setText(`Rendering ${getStylePreviewTabTitle(activeStyleTabId)}…`);

		try {
			const project = buildStylePreviewProject(state);
			const md = getStylePreviewMarkdown(activeStyleTabId);
			const html = await this.plugin.htmlRenderer.render(project, md);
			const css = this.plugin.cssTemplateEngine.build(project);
			const doc = buildIsolatedPreviewPageDocument(project, html, css);
			this.iframeEl.srcdoc = doc;
			this.statusEl.setText(`Preview — ${getStylePreviewTabTitle(activeStyleTabId)} (updates when you edit)`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.statusEl.setText(`Preview failed: ${msg}`);
		}
	}
}
