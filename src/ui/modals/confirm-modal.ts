import { App, Modal, Setting } from "obsidian";

export type ConfirmModalOptions = {
	title: string;
	message: string;
	confirmText?: string;
	/** When true, style the confirm button as destructive. */
	isDangerous?: boolean;
};

/**
 * Simple confirm / cancel dialog.
 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private options: ConfirmModalOptions,
		private onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { title, message, confirmText = "Confirm", isDangerous } = this.options;
		this.titleEl.setText(title);
		this.contentEl.createEl("p", { text: message, cls: "ra-confirm-message" });
		new Setting(this.contentEl)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				}),
			)
			.addButton((btn) => {
				const b = btn.setButtonText(confirmText).onClick(() => {
					void (async () => {
						try {
							await this.onConfirm();
						} finally {
							this.close();
						}
					})();
				});
				if (isDangerous) b.setWarning();
				else b.setCta();
			});
	}
}
