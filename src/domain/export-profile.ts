export type OutputFormat = "pdf" | "docx" | "both";
export type PaperPreset = "A4" | "Letter" | "Legal" | "Custom";
export type MeasurementUnit = "mm" | "cm" | "in";

export interface CustomPageSize {
	width: number;
	height: number;
	unit: MeasurementUnit;
}

export interface ExportProfile {
	formats: OutputFormat;
	paperSize: PaperPreset;
	orientation: "portrait" | "landscape";
	customPageSize?: CustomPageSize;
	margins: {
		top: string;
		right: string;
		bottom: string;
		left: string;
	};
	printBackground: boolean;
	includeFrontmatter: boolean;
	includeToc: boolean;
	pageNumbers: boolean;
}

export function createDefaultExportProfile(): ExportProfile {
	return {
		formats: "pdf",
		paperSize: "A4",
		orientation: "portrait",
		margins: {
			top: "2cm",
			right: "2cm",
			bottom: "2cm",
			left: "2cm",
		},
		printBackground: false,
		includeFrontmatter: false,
		includeToc: false,
		pageNumbers: true,
	};
}
