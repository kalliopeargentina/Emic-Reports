import { createAcademicExportTemplate, type StyleTemplate } from "../domain/style-template";

export function getAcademicExportV1Template(): StyleTemplate {
	return createAcademicExportTemplate();
}
