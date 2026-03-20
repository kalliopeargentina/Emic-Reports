import { Modal, Setting, type App } from "obsidian";
import type { CoverConfig } from "../../domain/cover-config";

export class CoverConfigModal extends Modal {
	constructor(
		app: App,
		private config: CoverConfig,
		private onSave: (config: CoverConfig) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Cover configuration" });

		new Setting(contentEl)
			.setName("Title")
			.addText((text) =>
				text.setValue(this.config.title).onChange((value) => {
					this.config.title = value;
				}),
			);

		new Setting(contentEl)
			.setName("Subtitle")
			.addText((text) =>
				text.setValue(this.config.subtitle ?? "").onChange((value) => {
					this.config.subtitle = value;
				}),
			);

		new Setting(contentEl)
			.setName("Authors")
			.setDesc("Comma-separated")
			.addText((text) =>
				text.setValue(this.config.authors.join(", ")).onChange((value) => {
					this.config.authors = value
						.split(",")
						.map((part) => part.trim())
						.filter(Boolean);
				}),
			);

		new Setting(contentEl)
			.setName("Background image path")
			.addText((text) =>
				text.setValue(this.config.backgroundImagePath ?? "").onChange((value) => {
					this.config.backgroundImagePath = value.trim();
				}),
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					await this.onSave(this.config);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
