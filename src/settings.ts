import { App, PluginSettingTab, Setting } from "obsidian";
import ReportArchitectPlugin from "./main";

export type ExportFormat = "pdf" | "docx" | "both";

export interface ReportArchitectSettings {
	defaultOutputFolder: string;
	defaultPaperSize: "A4" | "Letter" | "Legal";
	defaultFormat: ExportFormat;
	openPreviewOnExport: boolean;
	projectsIndex: Array<{ id: string; name: string; updatedAt: string }>;
}

export const DEFAULT_SETTINGS: ReportArchitectSettings = {
	defaultOutputFolder: "Emic report architect",
	defaultPaperSize: "A4",
	defaultFormat: "pdf",
	openPreviewOnExport: true,
	projectsIndex: [],
};

export class ReportArchitectSettingTab extends PluginSettingTab {
	plugin: ReportArchitectPlugin;

	constructor(app: App, plugin: ReportArchitectPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default output folder")
			.addText((text) =>
				text
					.setPlaceholder("Emic report architect")
					.setValue(this.plugin.settings.defaultOutputFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultOutputFolder = value.trim() || "Emic report architect";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default paper size")
			.setDesc("Used for preview and PDF export defaults.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("A4", "A4")
					.addOption("Letter", "Letter")
					.addOption("Legal", "Legal")
					.setValue(this.plugin.settings.defaultPaperSize)
					.onChange(async (value) => {
						this.plugin.settings.defaultPaperSize = value as "A4" | "Letter" | "Legal";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default export format")
			.setDesc("Which format is pre-selected in the export panel.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("pdf", "PDF")
					.addOption("docx", "DOCX")
					.addOption("both", "Both")
					.setValue(this.plugin.settings.defaultFormat)
					.onChange(async (value) => {
						this.plugin.settings.defaultFormat = value as ExportFormat;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open preview on export")
			.setDesc("Open a preview modal before exporting.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.openPreviewOnExport).onChange(async (value) => {
					this.plugin.settings.openPreviewOnExport = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
