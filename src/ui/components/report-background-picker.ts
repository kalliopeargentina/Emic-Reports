import { Setting } from "obsidian";
import type { BackgroundImageConfig } from "../../domain/style-template";

export function renderReportBackgroundPicker(
	container: HTMLElement,
	value: BackgroundImageConfig | undefined,
	onChange: (value: BackgroundImageConfig | undefined) => void,
): void {
	const current = value ?? {
		assetPath: "",
		opacity: 0.15,
		fitMode: "cover" as const,
		applyTo: "body" as const,
	};

	new Setting(container)
		.setName("Background image path")
		.setDesc("Vault-relative path to an image.")
		.addText((text) =>
			text
				.setPlaceholder("assets/background.png")
				.setValue(current.assetPath)
				.onChange((next) => {
					const path = next.trim();
					onChange(path ? { ...current, assetPath: path } : undefined);
				}),
		);

	if (!value) return;

	new Setting(container)
		.setName("Background opacity")
		.addSlider((slider) =>
			slider
				.setLimits(0, 1, 0.05)
				.setValue(value.opacity)
				.setDynamicTooltip()
				.onChange((next) => onChange({ ...value, opacity: next })),
		);

	new Setting(container)
		.setName("Background fit")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("cover", "Cover")
				.addOption("contain", "Contain")
				.addOption("repeat", "Repeat")
				.setValue(value.fitMode)
				.onChange((next) => onChange({ ...value, fitMode: next as BackgroundImageConfig["fitMode"] })),
		);

	new Setting(container)
		.setName("Apply to")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("cover", "Cover")
				.addOption("body", "Body")
				.addOption("both", "Both")
				.setValue(value.applyTo)
				.onChange((next) => onChange({ ...value, applyTo: next as BackgroundImageConfig["applyTo"] })),
		);
}
