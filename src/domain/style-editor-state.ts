import type { BackgroundImageConfig, StyleTemplate } from "./style-template";

/** Editable slice shared by the report composer and the template editor panel. */
export interface StyleEditorState {
	styleTemplate: StyleTemplate;
	backgroundImage?: BackgroundImageConfig;
}
