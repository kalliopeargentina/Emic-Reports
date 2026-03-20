import { Setting } from "obsidian";
import type { OutputFormat } from "../../domain/export-profile";

export function renderExportFormatSelector(
	container: HTMLElement,
	value: OutputFormat,
	onChange: (value: OutputFormat) => void,
): void {
	new Setting(container)
		.setName("Export format")
		.setDesc("Choose the output format for this report.")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("pdf", "PDF")
				.addOption("docx", "DOCX")
				.addOption("both", "Both")
				.setValue(value)
				.onChange((next) => onChange(next as OutputFormat)),
		);
}
