import type { ReportProject } from "../domain/report-project";

export interface ResolvedPageSize {
	width: string;
	height: string;
}

export class PageSizeResolver {
	resolve(project: ReportProject): ResolvedPageSize {
		const portrait = this.resolvePortrait(project);
		if (project.orientation === "landscape") {
			return { width: portrait.height, height: portrait.width };
		}
		return portrait;
	}

	private resolvePortrait(project: ReportProject): ResolvedPageSize {
		switch (project.paperSize) {
			case "A4":
				return { width: "210mm", height: "297mm" };
			case "Letter":
				return { width: "8.5in", height: "11in" };
			case "Legal":
				return { width: "8.5in", height: "14in" };
			case "Custom":
				if (project.customPageSize) {
					const { width, height, unit } = project.customPageSize;
					return { width: `${width}${unit}`, height: `${height}${unit}` };
				}
				return { width: "210mm", height: "297mm" };
			default:
				return { width: "210mm", height: "297mm" };
		}
	}
}
