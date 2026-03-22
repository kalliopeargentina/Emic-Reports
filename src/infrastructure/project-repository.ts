import type { App } from "obsidian";
import { normalizeLoadedProject, type ReportProject } from "../domain/report-project";

export interface ProjectRepository {
	save(project: ReportProject): Promise<void>;
	getById(id: string): Promise<ReportProject | null>;
	list(): Promise<ReportProject[]>;
	delete(id: string): Promise<void>;
}

export class VaultProjectRepository implements ProjectRepository {
	constructor(private app: App) {}

	async save(project: ReportProject): Promise<void> {
		await this.ensureDirectory();
		const path = this.filePath(project.id);
		await this.app.vault.adapter.write(path, JSON.stringify(project, null, 2));
	}

	async getById(id: string): Promise<ReportProject | null> {
		const path = this.filePath(id);
		if (!(await this.app.vault.adapter.exists(path))) return null;
		const content = await this.app.vault.adapter.read(path);
		return normalizeLoadedProject(JSON.parse(content) as ReportProject);
	}

	async list(): Promise<ReportProject[]> {
		const dataRoot = this.dataRoot();
		if (!(await this.app.vault.adapter.exists(dataRoot))) return [];
		const listing = await this.app.vault.adapter.list(dataRoot);
		const projectFiles = listing.files.filter((filePath) => filePath.endsWith(".json"));
		const projects = await Promise.all(
			projectFiles.map(async (path) =>
				normalizeLoadedProject(JSON.parse(await this.app.vault.adapter.read(path)) as ReportProject),
			),
		);
		return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async delete(id: string): Promise<void> {
		const path = this.filePath(id);
		if (await this.app.vault.adapter.exists(path)) {
			await this.app.vault.adapter.remove(path);
		}
	}

	private async ensureDirectory(): Promise<void> {
		const pluginRoot = `${this.app.vault.configDir}/plugins/emic-reports`;
		const dataRoot = `${pluginRoot}/data`;
		const projectsRoot = `${dataRoot}/projects`;
		if (!(await this.app.vault.adapter.exists(pluginRoot))) {
			await this.app.vault.adapter.mkdir(pluginRoot);
		}
		if (!(await this.app.vault.adapter.exists(dataRoot))) {
			await this.app.vault.adapter.mkdir(dataRoot);
		}
		if (!(await this.app.vault.adapter.exists(projectsRoot))) {
			await this.app.vault.adapter.mkdir(projectsRoot);
		}
	}

	private filePath(id: string): string {
		return `${this.dataRoot()}/${id}.json`;
	}

	private dataRoot(): string {
		return `${this.app.vault.configDir}/plugins/emic-reports/data/projects`;
	}
}
