export interface CoverConfig {
	id: string;
	title: string;
	subtitle?: string;
	authors: string[];
	backgroundImagePath?: string;
	titleColor: string;
	subtitleColor: string;
	authorColor: string;
	titleAlign: "left" | "center" | "right";
	authorAlign: "left" | "center" | "right";
}

export function createDefaultCoverConfig(): CoverConfig {
	return {
		id: "default-cover",
		title: "Report title",
		subtitle: "",
		authors: [],
		backgroundImagePath: "",
		titleColor: "#111111",
		subtitleColor: "#333333",
		authorColor: "#111111",
		titleAlign: "center",
		authorAlign: "center",
	};
}
