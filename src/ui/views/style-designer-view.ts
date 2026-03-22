import { Setting } from "obsidian";
import type { StyleEditorTabId } from "../../domain/style-editor-tab-ids";
import type { StyleEditorState } from "../../domain/style-editor-state";
import {
	applyTokenDefaults,
	renderAcademicStyleControls,
} from "../components/academic-style-controls";

export type { StyleEditorState } from "../../domain/style-editor-state";

export class StyleDesignerView {
	constructor(
		private container: HTMLElement,
		private state: StyleEditorState,
		private onChange: (state: StyleEditorState) => void,
		private options?: {
			onPrintBackgroundChange?: (printBackground: boolean) => void;
			onStyleTabChange?: (tabId: StyleEditorTabId) => void;
			initialStyleTabId?: StyleEditorTabId;
			stylePreviewToggle?: {
				toggle: () => Promise<void>;
			};
		},
	) {}

	render(): void {
		this.container.empty();
		applyTokenDefaults(this.state);
		new Setting(this.container).setHeading().setName("Visual style");
		renderAcademicStyleControls(this.container, this.state, this.onChange, this.options);
	}
}
