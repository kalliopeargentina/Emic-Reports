import { Setting } from "obsidian";
import {
	mergePrintRules,
	mergeStyleTokens,
	type PrintRules,
	type StyleTokens,
	type TextAlignOption,
} from "../../domain/style-template";
import type { StyleEditorState } from "../../domain/style-editor-state";
import { renderReportBackgroundPicker } from "./report-background-picker";

function sectionHeading(container: HTMLElement, title: string): void {
	container.createEl("h4", { cls: "ra-style-section-title", text: title });
}

export function applyTokenDefaults(state: StyleEditorState): void {
	state.styleTemplate.tokens = mergeStyleTokens(state.styleTemplate.tokens);
	state.styleTemplate.printRules = mergePrintRules(state.styleTemplate.printRules);
}

export function renderAcademicStyleControls(
	container: HTMLElement,
	state: StyleEditorState,
	onChange: (state: StyleEditorState) => void,
	options?: {
		onPrintBackgroundChange?: (printBackground: boolean) => void;
	},
): void {
	const t = state.styleTemplate.tokens;
	const pr = state.styleTemplate.printRules;

	const patchTokens = (patch: Partial<StyleTokens>): void => {
		Object.assign(state.styleTemplate.tokens, patch);
		onChange(state);
	};

	const patchPrint = (patch: Partial<PrintRules>): void => {
		Object.assign(state.styleTemplate.printRules, patch);
		onChange(state);
	};

	const textAlignOptions: Record<TextAlignOption, string> = {
		left: "Left",
		center: "Center",
		right: "Right",
		justify: "Justify",
	};

	sectionHeading(container, "Body and paragraph");
	new Setting(container)
		.setName("Body font family")
		.setDesc("Font stack for body text (for example latin modern roman).")
		.addText((text) =>
			text.setValue(t.fontBody).onChange((v) => {
				patchTokens({ fontBody: v });
			}),
		);
	new Setting(container)
		.setName("Body font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 16, 1)
				.setValue(t.fontSizeBody)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ fontSizeBody: v })),
		);
	new Setting(container)
		.setName("Body line-height")
		.addSlider((slider) =>
			slider
				.setLimits(1, 2, 0.1)
				.setValue(t.lineHeightBody)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ lineHeightBody: v })),
		);
	new Setting(container)
		.setName("Tab size")
		.addSlider((slider) =>
			slider.setLimits(2, 8, 1).setValue(t.tabSize).setDynamicTooltip().onChange((v) => patchTokens({ tabSize: v })),
		);
	new Setting(container)
		.setName("Paragraph alignment")
		.addDropdown((dropdown) => {
			for (const [val, label] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, label);
			}
			dropdown.setValue(t.paragraphTextAlign).onChange((v) => patchTokens({ paragraphTextAlign: v as TextAlignOption }));
		});
	new Setting(container)
		.setName("Paragraph spacing (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.paragraphSpacing)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ paragraphSpacing: v })),
		);
	new Setting(container)
		.setName("Section spacing (px)")
		.setDesc("Space before headings.")
		.addSlider((slider) =>
			slider
				.setLimits(0, 48, 1)
				.setValue(t.sectionSpacing)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ sectionSpacing: v })),
		);
	new Setting(container)
		.setName("Text color")
		.addColorPicker((picker) => picker.setValue(t.colorText).onChange((v) => patchTokens({ colorText: v })));

	sectionHeading(container, "Page margins (print)");
	for (const [key, label] of [
		["pageMarginTop", "Top"],
		["pageMarginRight", "Right"],
		["pageMarginBottom", "Bottom"],
		["pageMarginLeft", "Left"],
	] as const) {
		const marginKey = key;
		new Setting(container)
			.setName(`Margin ${label}`)
			.addText((text) =>
				text.setPlaceholder("2cm").setValue(t[marginKey]).onChange((v) => {
					patchTokens({ [marginKey]: v.trim() || "2cm" } as Partial<StyleTokens>);
				}),
			);
	}
	new Setting(container)
		.setName("Page background color")
		.addColorPicker((picker) =>
			picker
				.setValue(t.pageBackgroundColor)
				.onChange((v) => patchTokens({ pageBackgroundColor: v })),
		);

	sectionHeading(container, "Links");
	new Setting(container)
		.setName("Link color")
		.addColorPicker((picker) => picker.setValue(t.linkColor).onChange((v) => patchTokens({ linkColor: v })));
	new Setting(container)
		.setName("Underline links")
		.addToggle((toggle) =>
			toggle.setValue(t.linkUnderline).onChange((v) => patchTokens({ linkUnderline: v })),
		);

	sectionHeading(container, "Emphasis");
	new Setting(container)
		.setName("Strong color")
		.addColorPicker((picker) => picker.setValue(t.strongColor).onChange((v) => patchTokens({ strongColor: v })));
	new Setting(container)
		.setName("Emphasis color")
		.addColorPicker((picker) => picker.setValue(t.emColor).onChange((v) => patchTokens({ emColor: v })));

	sectionHeading(container, "Headings");
	new Setting(container)
		.setName("Heading font family")
		.addText((text) =>
			text.setValue(t.fontHeading).onChange((v) => patchTokens({ fontHeading: v })),
		);
	new Setting(container)
		.setName("Heading line-height")
		.addSlider((slider) =>
			slider
				.setLimits(0.8, 2, 0.05)
				.setValue(t.headingLineHeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ headingLineHeight: v })),
		);
	new Setting(container)
		.setName("Heading font weight")
		.addSlider((slider) =>
			slider
				.setLimits(400, 900, 100)
				.setValue(t.headingFontWeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ headingFontWeight: v })),
		);
	new Setting(container)
		.setName("Heading margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 48, 1)
				.setValue(t.headingMarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ headingMarginTop: v })),
		);
	new Setting(container)
		.setName("Heading margin bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.headingMarginBottom)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ headingMarginBottom: v })),
		);
	for (const [label, key, min, max] of [
		["H1 size (pt)", "h1Size", 10, 28],
		["H2 size (pt)", "h2Size", 8, 20],
		["H3 size (pt)", "h3Size", 8, 20],
		["H4 size (pt)", "h4Size", 8, 20],
		["H5 size (pt)", "h5Size", 8, 18],
		["H6 size (pt)", "h6Size", 8, 18],
	] as const) {
		new Setting(container).setName(label).addSlider((slider) =>
			slider
				.setLimits(min, max, 1)
				.setValue(t[key])
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ [key]: v })),
		);
	}
	new Setting(container)
		.setName("H1 font family")
		.setDesc("Small caps font for titles (for example latin modern roman caps).")
		.addText((text) =>
			text.setValue(t.h1FontFamily).onChange((v) => patchTokens({ h1FontFamily: v })),
		);
	new Setting(container)
		.setName("H1 alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.h1TextAlign).onChange((v) => patchTokens({ h1TextAlign: v as TextAlignOption }));
		});
	new Setting(container)
		.setName("H1 font weight")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", "Normal")
				.addOption("bold", "Bold")
				.setValue(t.h1FontWeight)
				.onChange((v) => patchTokens({ h1FontWeight: v as "normal" | "bold" })),
		);
	new Setting(container)
		.setName("H6 font family")
		.addText((text) =>
			text.setValue(t.h6FontFamily).onChange((v) => patchTokens({ h6FontFamily: v })),
		);
	new Setting(container)
		.setName("H6 alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.h6TextAlign).onChange((v) => patchTokens({ h6TextAlign: v as TextAlignOption }));
		});
	new Setting(container)
		.setName("H6 margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.h6MarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ h6MarginTop: v })),
		);

	sectionHeading(container, "Credits (del)");
	new Setting(container)
		.setName("Credits font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.creditsFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ creditsFontSize: v })),
		);
	new Setting(container)
		.setName("Credits margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.creditsMarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ creditsMarginTop: v })),
		);
	new Setting(container)
		.setName("Credits padding bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.creditsPaddingBottom)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ creditsPaddingBottom: v })),
		);

	sectionHeading(container, "Code and pre");
	new Setting(container)
		.setName("Code block background")
		.addColorPicker((picker) =>
			picker.setValue(t.codeBlockBackground).onChange((v) => patchTokens({ codeBlockBackground: v })),
		);
	new Setting(container)
		.setName("Code normal color (CSS var)")
		.addColorPicker((picker) =>
			picker.setValue(t.codeNormalColor).onChange((v) => patchTokens({ codeNormalColor: v })),
		);
	new Setting(container)
		.setName("Inline code color")
		.addColorPicker((picker) =>
			picker.setValue(t.codeInlineColor).onChange((v) => patchTokens({ codeInlineColor: v })),
		);
	new Setting(container)
		.setName("Code font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.codeFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ codeFontSize: v })),
		);
	new Setting(container)
		.setName("Pre background")
		.addColorPicker((picker) =>
			picker.setValue(t.preBackground).onChange((v) => patchTokens({ preBackground: v })),
		);
	new Setting(container)
		.setName("Pre border style")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("dashed", "Dashed")
				.addOption("solid", "Solid")
				.addOption("none", "None")
				.setValue(t.preBorderStyle)
				.onChange((v) => patchTokens({ preBorderStyle: v as StyleTokens["preBorderStyle"] })),
		);
	new Setting(container)
		.setName("Pre border width")
		.setDesc("Border width for pre blocks, for example 1px 0 for top and bottom only.")
		.addText((text) =>
			text.setPlaceholder("1px 0").setValue(t.preBorderWidth).onChange((v) => patchTokens({ preBorderWidth: v })),
		);
	new Setting(container)
		.setName("Pre border color")
		.addColorPicker((picker) =>
			picker.setValue(t.preBorderColor).onChange((v) => patchTokens({ preBorderColor: v })),
		);
	new Setting(container)
		.setName("Pre border radius (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 12, 1)
				.setValue(t.preBorderRadius)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ preBorderRadius: v })),
		);
	new Setting(container)
		.setName("Pre line-height")
		.addSlider((slider) =>
			slider
				.setLimits(0.8, 2, 0.05)
				.setValue(t.preLineHeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ preLineHeight: v })),
		);
	new Setting(container)
		.setName("Code block spacing before (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.codeBlockSpacingBefore)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ codeBlockSpacingBefore: v })),
		);
	new Setting(container)
		.setName("Code block spacing after (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.codeBlockSpacingAfter)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ codeBlockSpacingAfter: v })),
		);

	sectionHeading(container, "Math");
	new Setting(container)
		.setName("Math scale (%)")
		.addSlider((slider) =>
			slider
				.setLimits(50, 120, 5)
				.setValue(t.mathScalePercent)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ mathScalePercent: v })),
		);

	sectionHeading(container, "Figures and images");
	new Setting(container)
		.setName("Image margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.imageMarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ imageMarginTop: v })),
		);
	new Setting(container)
		.setName("Image margin bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.imageMarginBottom)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ imageMarginBottom: v })),
		);
	new Setting(container)
		.setName("Image horizontal margin")
		.setDesc("Horizontal margin for images; use auto to center.")
		.addText((text) =>
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- css keyword
			text.setPlaceholder("auto").setValue(t.imageMarginHorizontal).onChange((v) => patchTokens({ imageMarginHorizontal: v })),
		);
	new Setting(container)
		.setName("Caption font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(6, 12, 1)
				.setValue(t.captionFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ captionFontSize: v })),
		);
	new Setting(container)
		.setName("Caption margin bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.captionMarginBottom)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ captionMarginBottom: v })),
		);

	sectionHeading(container, "Tables");
	new Setting(container)
		.setName("Table font family")
		.addText((text) =>
			text.setValue(t.tableFontFamily).onChange((v) => patchTokens({ tableFontFamily: v })),
		);
	new Setting(container)
		.setName("Table font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.tableFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ tableFontSize: v })),
		);
	new Setting(container)
		.setName("Table text alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.tableTextAlign).onChange((v) => patchTokens({ tableTextAlign: v as TextAlignOption }));
		});
	new Setting(container)
		.setName("Table cell padding")
		.setDesc("Padding for table cells, for example 2px 5px.")
		.addText((text) =>
			text.setValue(t.tableCellPadding).onChange((v) => patchTokens({ tableCellPadding: v })),
		);
	new Setting(container)
		.setName("Table header font weight")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", "Normal")
				.addOption("bold", "Bold")
				.setValue(t.thFontWeight)
				.onChange((v) => patchTokens({ thFontWeight: v as "normal" | "bold" })),
		);

	sectionHeading(container, "Lists");
	new Setting(container)
		.setName("List font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 16, 1)
				.setValue(t.listFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ listFontSize: v })),
		);
	new Setting(container)
		.setName("List line-height")
		.addSlider((slider) =>
			slider
				.setLimits(1, 2, 0.05)
				.setValue(t.listLineHeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ listLineHeight: v })),
		);
	new Setting(container)
		.setName("Custom bullet (academic style)")
		.addToggle((toggle) =>
			toggle.setValue(t.listCustomBullet).onChange((v) => patchTokens({ listCustomBullet: v })),
		);
	new Setting(container)
		.setName("Bullet horizontal offset")
		.setDesc("Left position for custom bullet, e.g. -1.15em.")
		.addText((text) =>
			text.setValue(t.listBulletOffset).onChange((v) => patchTokens({ listBulletOffset: v })),
		);
	new Setting(container)
		.setName("Bullet character")
		.setDesc("Single character used for custom bullets.")
		.addText((text) =>
			text
				.setValue(t.listBulletChar)
				.onChange((v) => patchTokens({ listBulletChar: v.trim() || "\u2022" })),
		);
	new Setting(container)
		.setName("Bullet vertical offset")
		.setDesc("Top position for custom bullet, e.g. -0.05em.")
		.addText((text) =>
			text
				.setValue(t.listBulletTopOffset)
				.onChange((v) => patchTokens({ listBulletTopOffset: v.trim() || "-0.05em" })),
		);
	new Setting(container)
		.setName("List indent per level (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(6, 36, 1)
				.setValue(t.listIndentPerLevel)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ listIndentPerLevel: v })),
		);

	sectionHeading(container, "Blockquote and diagrams");
	new Setting(container)
		.setName("Blockquote alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.blockquoteTextAlign).onChange((v) => patchTokens({ blockquoteTextAlign: v as TextAlignOption }));
		});
	new Setting(container)
		.setName("Blockquote font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.blockquoteFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteFontSize: v })),
		);
	new Setting(container)
		.setName("Blockquote vertical margin (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.blockquoteMarginY)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteMarginY: v })),
		);
	new Setting(container)
		.setName("Mermaid diagram color")
		.addColorPicker((picker) =>
			picker.setValue(t.mermaidColor).onChange((v) => patchTokens({ mermaidColor: v })),
		);

	sectionHeading(container, "Print rules");
	new Setting(container)
		.setName("Heading numbering")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("none", "None")
				.addOption("h2-h4", "Levels 2 to 4 (academic)")
				.addOption("h1-h6", "Levels 1 to 6")
				.setValue(pr.headingNumbering)
				.onChange((v) => patchPrint({ headingNumbering: v as PrintRules["headingNumbering"] })),
		);
	new Setting(container)
		.setName("Horizontal rule as page break")
		.setDesc("Match academic export: a horizontal rule starts a new page.")
		.addToggle((toggle) =>
			toggle.setValue(pr.hrAsPageBreak).onChange((v) => patchPrint({ hrAsPageBreak: v })),
		);
	new Setting(container)
		.setName("Table page-break inside")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("avoid", "Avoid")
				.addOption("auto", "Auto")
				.setValue(pr.tableBreakBehavior)
				.onChange((v) => patchPrint({ tableBreakBehavior: v as "avoid" | "auto" })),
		);
	new Setting(container)
		.setName("Pre page-break inside")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("avoid", "Avoid")
				.addOption("auto", "Auto")
				.setValue(pr.prePageBreakInside)
				.onChange((v) => patchPrint({ prePageBreakInside: v as "avoid" | "auto" })),
		);
	new Setting(container)
		.setName("Image caption style")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("centered-small", "Centered small")
				.addOption("plain", "Plain")
				.setValue(pr.imageCaptionStyle)
				.onChange((v) => patchPrint({ imageCaptionStyle: v as PrintRules["imageCaptionStyle"] })),
		);

	// Background image (report / template)
	new Setting(container)
		.setName("Cover background opacity")
		.addSlider((slider) =>
			slider
				.setLimits(0, 1, 0.05)
				.setValue(t.coverBackgroundOpacity)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ coverBackgroundOpacity: v })),
		);
	renderReportBackgroundPicker(container, state.backgroundImage, (next) => {
		state.backgroundImage = next;
		options?.onPrintBackgroundChange?.(Boolean(next?.assetPath));
		onChange(state);
	});
}
