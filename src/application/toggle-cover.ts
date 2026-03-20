import type { ReportProject } from "../domain/report-project";
import type { ProjectRepository } from "../infrastructure/project-repository";

export async function toggleCover(
	repository: ProjectRepository,
	project: ReportProject,
	enabled: boolean,
): Promise<ReportProject> {
	const updated: ReportProject = {
		...project,
		coverEnabled: enabled,
		updatedAt: new Date().toISOString(),
	};
	await repository.save(updated);
	return updated;
}
