import { App, FuzzySuggestModal, TFolder } from "obsidian";

export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private onPick: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder("Select a folder");
		this.emptyStateText = "No folders in vault.";
	}

	getItems(): TFolder[] {
		const root = this.app.vault.getRoot();
		const out: TFolder[] = [];
		const walk = (folder: TFolder): void => {
			out.push(folder);
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					walk(child);
				}
			}
		};
		walk(root);
		return out;
	}

	getItemText(item: TFolder): string {
		return item.path || "/";
	}

	onChooseItem(item: TFolder, _evt: MouseEvent | KeyboardEvent): void {
		this.onPick(item);
	}
}
