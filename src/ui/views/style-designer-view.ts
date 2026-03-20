import { Setting } from "obsidian";
import type { BackgroundImageConfig, StyleTemplate } from "../../domain/style-template";
import { renderReportBackgroundPicker } from "../components/report-background-picker";

/** Editable slice shared by the report composer and the template editor panel. */
export interface StyleEditorState {
	styleTemplate: StyleTemplate;
	backgroundImage?: BackgroundImageConfig;
}

export class StyleDesignerView {
	constructor(
		private container: HTMLElement,
		private state: StyleEditorState,
		private onChange: (state: StyleEditorState) => void,
		private options?: {
			/** When background image path is set/cleared, update print export flag. */
			onPrintBackgroundChange?: (printBackground: boolean) => void;
		},
	) {}

	render(): void {
		this.container.empty();
		this.container.createEl("h3", { text: "Visual style" });

		new Setting(this.container)
			.setName("Body font size")
			.addSlider((slider) =>
				slider
					.setLimits(8, 16, 1)
					.setValue(this.state.styleTemplate.tokens.fontSizeBody)
					.setDynamicTooltip()
					.onChange((next) => {
						this.state.styleTemplate.tokens.fontSizeBody = next;
						this.onChange(this.state);
					}),
			);

		new Setting(this.container)
			.setName("Body line-height")
			.addSlider((slider) =>
				slider
					.setLimits(1, 2, 0.1)
					.setValue(this.state.styleTemplate.tokens.lineHeightBody)
					.setDynamicTooltip()
					.onChange((next) => {
						this.state.styleTemplate.tokens.lineHeightBody = next;
						this.onChange(this.state);
					}),
			);

		new Setting(this.container)
			.setName("Text color")
			.addColorPicker((picker) =>
				picker.setValue(this.state.styleTemplate.tokens.colorText).onChange((next) => {
					this.state.styleTemplate.tokens.colorText = next;
					this.onChange(this.state);
				}),
			);

		renderReportBackgroundPicker(this.container, this.state.backgroundImage, (next) => {
			this.state.backgroundImage = next;
			this.options?.onPrintBackgroundChange?.(Boolean(next?.assetPath));
			this.onChange(this.state);
		});
	}
}
