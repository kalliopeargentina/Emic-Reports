import { Setting } from "obsidian";
import type { ReportProject } from "../../domain/report-project";

export function renderPageSizePicker(
	container: HTMLElement,
	project: ReportProject,
	onChange: (project: ReportProject) => void,
): void {
	new Setting(container)
		.setName("Page size")
		.setDesc("Select a preset or custom size.")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("A4", "A4")
				.addOption("Letter", "Letter")
				.addOption("Legal", "Legal")
				.addOption("Custom", "Custom")
				.setValue(project.paperSize)
				.onChange((next) => {
					onChange({ ...project, paperSize: next as ReportProject["paperSize"] });
				}),
		);

	if (project.paperSize === "Custom") {
		const row = container.createDiv({ cls: "ra-custom-size-row" });
		new Setting(row)
			.setName("Custom width")
			.addText((text) =>
				text
					.setPlaceholder("210")
					.setValue(String(project.customPageSize?.width ?? 210))
					.onChange((next) => {
						const width = Number(next) || 210;
						onChange({
							...project,
							customPageSize: {
								width,
								height: project.customPageSize?.height ?? 297,
								unit: project.customPageSize?.unit ?? "mm",
							},
						});
					}),
			);
		new Setting(row)
			.setName("Custom height")
			.addText((text) =>
				text
					.setPlaceholder("297")
					.setValue(String(project.customPageSize?.height ?? 297))
					.onChange((next) => {
						const height = Number(next) || 297;
						onChange({
							...project,
							customPageSize: {
								width: project.customPageSize?.width ?? 210,
								height,
								unit: project.customPageSize?.unit ?? "mm",
							},
						});
					}),
			);
	}
}
