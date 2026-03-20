import type { App } from "obsidian";
import {
	createAcademicExportTemplate,
	type StyleTemplate,
} from "../domain/style-template";

export class TemplateRepository {
	constructor(private app: App) {}

	async list(): Promise<StyleTemplate[]> {
		const templates: StyleTemplate[] = [createAcademicExportTemplate()];
		const templateRoot = this.templateRoot();
		if (!(await this.app.vault.adapter.exists(templateRoot))) return templates;
		const listing = await this.app.vault.adapter.list(templateRoot);
		const files = listing.files.filter((p) => p.endsWith(".json"));
		for (const file of files) {
			const content = await this.app.vault.adapter.read(file);
			templates.push(JSON.parse(content) as StyleTemplate);
		}
		return templates;
	}

	async save(template: StyleTemplate): Promise<void> {
		await this.ensureDirectory();
		const path = `${this.templateRoot()}/${template.id}.json`;
		await this.app.vault.adapter.write(path, JSON.stringify(template, null, 2));
	}

	private async ensureDirectory(): Promise<void> {
		const pluginRoot = `${this.app.vault.configDir}/plugins/emic-reports`;
		const dataRoot = `${pluginRoot}/data`;
		const templateRoot = `${dataRoot}/templates`;
		if (!(await this.app.vault.adapter.exists(pluginRoot))) {
			await this.app.vault.adapter.mkdir(pluginRoot);
		}
		if (!(await this.app.vault.adapter.exists(dataRoot))) {
			await this.app.vault.adapter.mkdir(dataRoot);
		}
		if (!(await this.app.vault.adapter.exists(templateRoot))) {
			await this.app.vault.adapter.mkdir(templateRoot);
		}
	}

	private templateRoot(): string {
		return `${this.app.vault.configDir}/plugins/emic-reports/data/templates`;
	}
}
