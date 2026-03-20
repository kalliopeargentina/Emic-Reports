import type { BackgroundImageConfig, StyleTemplate } from "./style-template";

export const SAVED_STYLE_TEMPLATE_VERSION = 1 as const;

/** On-disk JSON next to the vault; editable templates only (built-ins are not saved). */
export interface SavedStyleTemplateFile {
	version: typeof SAVED_STYLE_TEMPLATE_VERSION;
	styleTemplate: StyleTemplate;
	backgroundImage?: BackgroundImageConfig;
	printBackground?: boolean;
}
