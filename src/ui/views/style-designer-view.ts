import { Setting } from "obsidian";
import type { ReportProject } from "../../domain/report-project";
import { renderReportBackgroundPicker } from "../components/report-background-picker";

export class StyleDesignerView {
	constructor(
		private container: HTMLElement,
		private project: ReportProject,
		private onChange: (project: ReportProject) => void,
	) {}

	render(): void {
		this.container.empty();
		this.container.createEl("h3", { text: "Visual style" });

		new Setting(this.container)
			.setName("Body font size")
			.addSlider((slider) =>
				slider
					.setLimits(8, 16, 1)
					.setValue(this.project.styleTemplate.tokens.fontSizeBody)
					.setDynamicTooltip()
					.onChange((next) => {
						this.project.styleTemplate.tokens.fontSizeBody = next;
						this.onChange(this.project);
					}),
			);

		new Setting(this.container)
			.setName("Body line-height")
			.addSlider((slider) =>
				slider
					.setLimits(1, 2, 0.1)
					.setValue(this.project.styleTemplate.tokens.lineHeightBody)
					.setDynamicTooltip()
					.onChange((next) => {
						this.project.styleTemplate.tokens.lineHeightBody = next;
						this.onChange(this.project);
					}),
			);

		new Setting(this.container)
			.setName("Text color")
			.addColorPicker((picker) =>
				picker.setValue(this.project.styleTemplate.tokens.colorText).onChange((next) => {
					this.project.styleTemplate.tokens.colorText = next;
					this.onChange(this.project);
				}),
			);

		renderReportBackgroundPicker(this.container, this.project.backgroundImage, (next) => {
			this.project.backgroundImage = next;
			this.project.exportOptions.printBackground = Boolean(next?.assetPath);
			this.onChange(this.project);
		});
	}
}
