import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { createAcademicExportTemplate } from "../../domain/style-template";
import {
	SAVED_STYLE_TEMPLATE_VERSION,
	type SavedStyleTemplateFile,
} from "../../domain/saved-style-template";
import type ReportArchitectPlugin from "../../main";
import { BUILTIN_TEMPLATE_ID } from "../../infrastructure/template-repository";
import { cloneJson } from "../../utils/json-clone";
import { StyleDesignerView, type StyleEditorState } from "./style-designer-view";

export const TEMPLATE_EDITOR_VIEW_TYPE = "emic-template-editor-view";

export class TemplateEditorView extends ItemView {
	private draft: StyleEditorState & { printBackground: boolean };
	private editingId: string;
	private templateName: string;
	private isBuiltin: boolean;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReportArchitectPlugin,
	) {
		super(leaf);
		const academic = createAcademicExportTemplate();
		this.editingId = academic.id;
		this.templateName = academic.name;
		this.isBuiltin = true;
		this.draft = {
			styleTemplate: cloneJson(academic),
			printBackground: false,
		};
	}

	getViewType(): string {
		return TEMPLATE_EDITOR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Emic style templates";
	}

	getIcon(): string {
		return "palette";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();

		container.createEl("h2", { text: "Style template editor" });

		const templates = await this.plugin.templateRepository.list();

		new Setting(container)
			.setName("Template")
			.setDesc("Choose a template to edit or create a new one.")
			.addDropdown((dropdown) => {
				for (const t of templates) {
					dropdown.addOption(t.id, t.builtin ? `${t.name} (built-in)` : t.name);
				}
				dropdown.setValue(this.editingId);
				dropdown.onChange(async (value) => {
					const loaded = await this.plugin.templateRepository.loadFull(value);
					if (!loaded) {
						new Notice("Template not found.");
						return;
					}
					this.editingId = loaded.styleTemplate.id;
					this.templateName = loaded.styleTemplate.name;
					this.isBuiltin = loaded.styleTemplate.id === BUILTIN_TEMPLATE_ID;
					this.draft = {
						styleTemplate: cloneJson(loaded.styleTemplate),
						backgroundImage: loaded.backgroundImage
							? { ...loaded.backgroundImage }
							: undefined,
						printBackground: Boolean(loaded.printBackground),
					};
					await this.render();
				});
			});

		new Setting(container)
			.setName("Template name")
			.setDesc("Display name for this template when saved.")
			.addText((text) =>
				text.setValue(this.templateName).onChange((v) => {
					this.templateName = v.trim() || "Untitled template";
					this.draft.styleTemplate.name = this.templateName;
				}),
			);

		new Setting(container).addButton((btn) =>
			btn.setButtonText("New template").onClick(() => {
				const base = createAcademicExportTemplate();
				const id = globalThis.crypto?.randomUUID?.() ?? `tpl-${Date.now()}`;
				this.editingId = id;
				this.templateName = "New template";
				this.isBuiltin = false;
				this.draft = {
					styleTemplate: { ...cloneJson(base), id, name: this.templateName },
					printBackground: false,
				};
				void this.render();
			}),
		);

		const stylePanel = container.createDiv({ cls: "ra-style-panel" });
		const styleState: StyleEditorState = {
			styleTemplate: this.draft.styleTemplate,
			backgroundImage: this.draft.backgroundImage,
		};
		new StyleDesignerView(stylePanel, styleState, (next) => {
			this.draft.styleTemplate = next.styleTemplate;
			this.draft.backgroundImage = next.backgroundImage;
		}, {
			onPrintBackgroundChange: (v) => {
				this.draft.printBackground = v;
			},
		}).render();

		new Setting(container)
			.addButton((btn) =>
				btn.setButtonText("Save template").setCta().onClick(() => {
					void this.saveTemplate();
				}),
			)
			.addButton((btn) =>
				btn.setButtonText("Delete template").onClick(() => {
					void this.deleteTemplate();
				}),
			);
	}

	private async saveTemplate(): Promise<void> {
		if (this.isBuiltin) {
			new Notice(
				"The built-in template cannot be edited in place. Create a new template first using the button above, then save.",
			);
			return;
		}

		const file: SavedStyleTemplateFile = {
			version: SAVED_STYLE_TEMPLATE_VERSION,
			styleTemplate: {
				...cloneJson(this.draft.styleTemplate),
				name: this.templateName,
			},
			backgroundImage: this.draft.backgroundImage,
			printBackground: this.draft.printBackground,
		};

		try {
			await this.plugin.templateRepository.save(file);
			new Notice(`Saved template: ${file.styleTemplate.name}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(msg);
		}
	}

	private async deleteTemplate(): Promise<void> {
		if (this.isBuiltin) {
			new Notice("The built-in template cannot be deleted.");
			return;
		}
		await this.plugin.templateRepository.delete(this.editingId);
		new Notice("Template deleted.");
		const academic = createAcademicExportTemplate();
		this.editingId = academic.id;
		this.templateName = academic.name;
		this.isBuiltin = true;
		this.draft = {
			styleTemplate: cloneJson(academic),
			printBackground: false,
		};
		await this.render();
	}
}
