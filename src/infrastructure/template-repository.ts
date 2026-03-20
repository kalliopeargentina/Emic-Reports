import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { createAcademicExportTemplate, normalizeStyleTemplate } from "../domain/style-template";
import {
	type SavedStyleTemplateFile,
	SAVED_STYLE_TEMPLATE_VERSION,
} from "../domain/saved-style-template";

const BUILTIN_ID = "academic-export-v1";

export interface ListedStyleTemplate {
	id: string;
	name: string;
	builtin: boolean;
}

export class TemplateRepository {
	constructor(
		private app: App,
		private getTemplatesFolder: () => string,
	) {}

	/** Built-in preset + JSON files under the configured vault folder. */
	async list(): Promise<ListedStyleTemplate[]> {
		const academic = createAcademicExportTemplate();
		const out: ListedStyleTemplate[] = [
			{ id: academic.id, name: academic.name, builtin: true },
		];

		const root = this.templateRoot();
		if (!(await this.app.vault.adapter.exists(root))) return out;

		const listing = await this.app.vault.adapter.list(root);
		const files = listing.files.filter((p) => p.endsWith(".json"));
		for (const filePath of files) {
			const resolvedPath = normalizePath(
				filePath.includes("/") || filePath.includes("\\") ? filePath : `${root}/${filePath}`,
			);
			try {
				const raw = await this.app.vault.adapter.read(resolvedPath);
				const parsed = JSON.parse(raw) as SavedStyleTemplateFile;
				if (parsed.version !== SAVED_STYLE_TEMPLATE_VERSION || !parsed.styleTemplate?.id) continue;
				if (parsed.styleTemplate.id === BUILTIN_ID) continue;
				out.push({
					id: parsed.styleTemplate.id,
					name: parsed.styleTemplate.name || parsed.styleTemplate.id,
					builtin: false,
				});
			} catch {
				// skip invalid files
			}
		}

		return out.sort((a, b) => {
			if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}

	async loadFull(id: string): Promise<SavedStyleTemplateFile | null> {
		if (id === BUILTIN_ID) {
			const t = createAcademicExportTemplate();
			return {
				version: SAVED_STYLE_TEMPLATE_VERSION,
				styleTemplate: t,
				printBackground: false,
			};
		}

		const path = this.filePathForId(id);
		if (!(await this.app.vault.adapter.exists(path))) return null;
		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as SavedStyleTemplateFile;
			if (parsed.version !== SAVED_STYLE_TEMPLATE_VERSION) return null;
			return {
				...parsed,
				styleTemplate: normalizeStyleTemplate(parsed.styleTemplate),
			};
		} catch {
			return null;
		}
	}

	async save(file: SavedStyleTemplateFile): Promise<void> {
		if (file.styleTemplate.id === BUILTIN_ID) {
			throw new Error("Cannot overwrite the built-in template; save as a new template.");
		}
		await this.ensureDirectory();
		const path = this.filePathForId(file.styleTemplate.id);
		await this.app.vault.adapter.write(path, JSON.stringify(file, null, 2));
	}

	async delete(id: string): Promise<void> {
		if (id === BUILTIN_ID) return;
		const path = this.filePathForId(id);
		if (await this.app.vault.adapter.exists(path)) {
			await this.app.vault.adapter.remove(path);
		}
	}

	private templateRoot(): string {
		const raw = this.getTemplatesFolder().trim();
		const folder = raw || "Utils/Emic-Report-Arquitect";
		return normalizePath(folder);
	}

	private filePathForId(id: string): string {
		const safe = id.replace(/[\\/:*?"<>|]/g, "-");
		return `${this.templateRoot()}/${safe}.json`;
	}

	private async ensureDirectory(): Promise<void> {
		const root = this.templateRoot();
		const parts = root.split("/").filter(Boolean);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.app.vault.adapter.exists(current))) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}

export { BUILTIN_ID as BUILTIN_TEMPLATE_ID };
