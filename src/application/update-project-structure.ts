import { normalizeNodeOrder, type ReportNode, type ReportProject } from "../domain/report-project";
import type { ProjectRepository } from "../infrastructure/project-repository";

export async function updateProjectStructure(
	repository: ProjectRepository,
	project: ReportProject,
	nodes: ReportNode[],
): Promise<ReportProject> {
	const updated: ReportProject = {
		...project,
		nodes: normalizeNodeOrder(nodes),
		updatedAt: new Date().toISOString(),
	};
	await repository.save(updated);
	return updated;
}
