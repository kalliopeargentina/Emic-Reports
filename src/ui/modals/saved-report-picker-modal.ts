import { App, FuzzySuggestModal } from "obsidian";
import type { ReportProject } from "../../domain/report-project";

/**
 * Pick a saved report from the plugin project store (fuzzy search by name).
 */
export class SavedReportPickerModal extends FuzzySuggestModal<ReportProject> {
	constructor(
		app: App,
		private projects: ReportProject[],
		private onPick: (project: ReportProject) => void,
	) {
		super(app);
		this.setPlaceholder("Select a saved report");
		this.emptyStateText = "No saved reports.";
	}

	getItems(): ReportProject[] {
		return this.projects.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	getItemText(item: ReportProject): string {
		return item.name.trim() || item.id;
	}

	onChooseItem(item: ReportProject, _evt: MouseEvent | KeyboardEvent): void {
		this.onPick(item);
	}
}
