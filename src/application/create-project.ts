import type { ProjectRepository } from "../infrastructure/project-repository";
import { createEmptyProject, type ReportProject } from "../domain/report-project";

export async function createProject(
	repository: ProjectRepository,
	name: string,
): Promise<ReportProject> {
	const project = createEmptyProject(name);
	await repository.save(project);
	return project;
}
