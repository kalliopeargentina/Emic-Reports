import { App, PluginSettingTab, Setting } from "obsidian";
import ReportArchitectPlugin from "./main";

export type ExportFormat = "pdf" | "docx" | "both";

export interface ReportArchitectSettings {
	defaultOutputFolder: string;
	/** Vault-relative folder where style template JSON files are stored. */
	templatesFolder: string;
	defaultPaperSize: "A4" | "Letter" | "Legal";
	defaultFormat: ExportFormat;
	openPreviewOnExport: boolean;
	projectsIndex: Array<{ id: string; name: string; updatedAt: string }>;
	/** Style template id for the "Print active note" command (empty = first available / built-in). */
	quickPrintTemplateId: string;
}

export const DEFAULT_SETTINGS: ReportArchitectSettings = {
	defaultOutputFolder: "Emic report architect",
	templatesFolder: "Utils/Emic-Report-Arquitect",
	defaultPaperSize: "A4",
	defaultFormat: "pdf",
	openPreviewOnExport: true,
	projectsIndex: [],
	quickPrintTemplateId: "",
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
			.setHeading()
			.setName("Reports")
			.setDesc(
				"Saved reports live in the plugin data folder. Use the report composer to open, rename, save, create, or delete them.",
			);

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
			.setName("Default template for quick print")
			.setDesc('Used when you run the command "Print active note". Export format follows "Default export format". Falls back to the first listed template if the id is missing.')
			.addDropdown((dropdown) => {
				void (async () => {
					const list = await this.plugin.templateRepository.list();
					for (const t of list) {
						dropdown.addOption(t.id, t.builtin ? `${t.name} (built-in)` : t.name);
					}
					const cur = this.plugin.settings.quickPrintTemplateId;
					const valid = cur && list.some((t) => t.id === cur);
					dropdown.setValue(valid ? cur : (list[0]?.id ?? ""));
					dropdown.onChange(async (value) => {
						this.plugin.settings.quickPrintTemplateId = value;
						await this.plugin.saveSettings();
					});
				})();
			});

		new Setting(containerEl)
			.setName("Folder for templates")
			.setDesc("Use a folder inside the vault for style template JSON files.")
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- example vault path
					.setPlaceholder("Utils/Emic-Report-Arquitect")
					.setValue(this.plugin.settings.templatesFolder)
					.onChange(async (value) => {
						this.plugin.settings.templatesFolder =
							value.trim() || DEFAULT_SETTINGS.templatesFolder;
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
