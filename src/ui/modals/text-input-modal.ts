import { App, Modal, Setting, TextComponent } from "obsidian";

export type TextInputModalOptions = {
	title: string;
	description?: string;
	placeholder?: string;
	initialValue?: string;
	submitLabel?: string;
};

/**
 * Single-line text submit (e.g. new report name).
 */
export class TextInputModal extends Modal {
	private text?: TextComponent;

	constructor(
		app: App,
		private options: TextInputModalOptions,
		private onSubmit: (value: string) => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const {
			title,
			description,
			placeholder = "",
			initialValue = "",
			submitLabel = "Create",
		} = this.options;
		this.titleEl.setText(title);
		if (description) {
			this.contentEl.createEl("p", { text: description, cls: "setting-item-description" });
		}
		new Setting(this.contentEl).setName("Name").addText((text) => {
			this.text = text;
			text.setPlaceholder(placeholder).setValue(initialValue);
		});
		new Setting(this.contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText(submitLabel)
					.setCta()
					.onClick(() => {
						const v = this.text?.getValue().trim() ?? "";
						void (async () => {
							try {
								await this.onSubmit(v);
							} finally {
								this.close();
							}
						})();
					}),
			);
	}
}
