import { Setting } from "obsidian";
import {
	mergePrintRules,
	mergeStyleTokens,
	type PreWhiteSpaceMode,
	type PrintRules,
	type StyleTokens,
	type TextAlignOption,
} from "../../domain/style-template";
import {
	DEFAULT_STYLE_EDITOR_TAB_ID,
	type StyleEditorTabId,
} from "../../domain/style-editor-tab-ids";
import type { StyleEditorState } from "../../domain/style-editor-state";
import { renderReportBackgroundPicker } from "./report-background-picker";

function sectionHeading(container: HTMLElement, title: string): void {
	container.createEl("h4", { cls: "ra-style-section-title", text: title });
}

/** Map highlight CSS (#hex or rgb/rgba) to a hex string Obsidian's color picker accepts. */
function highlightBackgroundCssToPickerHex(css: string): string {
	const t = css.trim();
	const hex8 = /^#([0-9a-f]{8})$/i.exec(t);
	if (hex8) return `#${hex8[1]!.slice(0, 6).toLowerCase()}`;
	const hex6 = /^#([0-9a-f]{6})$/i.exec(t);
	if (hex6) return `#${hex6[1]!.toLowerCase()}`;
	const hex3 = /^#([0-9a-f]{3})$/i.exec(t);
	if (hex3) {
		const [r, g, b] = hex3[1]!.split("").map((c) => c + c);
		return `#${r}${g}${b}`.toLowerCase();
	}
	const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(t);
	if (m) {
		const r = Math.min(255, Math.max(0, parseInt(m[1]!, 10)));
		const g = Math.min(255, Math.max(0, parseInt(m[2]!, 10)));
		const b = Math.min(255, Math.max(0, parseInt(m[3]!, 10)));
		const h = (n: number) => n.toString(16).padStart(2, "0");
		return `#${h(r)}${h(g)}${h(b)}`;
	}
	return "#ffeb3b";
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
		/** Fired when the user selects a style tab (preview can switch sample). */
		onStyleTabChange?: (tabId: StyleEditorTabId) => void;
		/** Restore tab after re-render (e.g. template switch). */
		initialStyleTabId?: StyleEditorTabId;
		/** Toolbar button above tabs toggles the export style preview pane (label stays "Preview"). */
		stylePreviewToggle?: {
			toggle: () => Promise<void>;
		};
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

	if (options?.stylePreviewToggle) {
		const toggle = options.stylePreviewToggle;
		const bar = container.createDiv({ cls: "ra-style-editor-preview-bar" });
		const btn = bar.createEl("button", {
			type: "button",
			cls: "mod-cta ra-style-editor-preview-toggle",
			text: "Preview",
		});
		btn.addEventListener("click", () => {
			void toggle.toggle();
		});
	}

	const tabBar = container.createDiv({ cls: "ra-style-tab-bar" });
	const tabPanelsRoot = container.createDiv({ cls: "ra-style-tab-panels" });
	const panelPagePrint = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel" });
	const panelTypography = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });
	const panelLinksTags = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });
	const panelHeadingsCredits = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });
	const panelCode = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });
	const panelSyntaxColors = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });
	const panelCallouts = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });
	const panelBlocks = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });
	const panelMathFigures = tabPanelsRoot.createDiv({ cls: "ra-style-tab-panel ra-style-tab-panel--hidden" });

	const tabDefs: { id: string; label: string; panel: HTMLElement }[] = [
		{ id: "page-print", label: "Page & print", panel: panelPagePrint },
		{ id: "typography", label: "Typography", panel: panelTypography },
		{ id: "headings-credits", label: "Headings & credits", panel: panelHeadingsCredits },
		{ id: "links-tags", label: "Links & tags", panel: panelLinksTags },
		{ id: "code", label: "Code", panel: panelCode },
		{ id: "syntax-colors", label: "Syntax colors", panel: panelSyntaxColors },
		{ id: "callouts", label: "Callouts", panel: panelCallouts },
		{ id: "blocks", label: "Blocks", panel: panelBlocks },
		{ id: "math-figures", label: "Math & figures", panel: panelMathFigures },
	];

	function setActiveStyleTab(id: string, silent?: boolean): void {
		for (const def of tabDefs) {
			def.panel.classList.toggle("ra-style-tab-panel--hidden", def.id !== id);
		}
		for (const btn of Array.from(tabBar.querySelectorAll<HTMLButtonElement>(".ra-style-tab"))) {
			btn.classList.toggle("ra-style-tab--active", btn.dataset.tabId === id);
		}
		if (!silent) options?.onStyleTabChange?.(id as StyleEditorTabId);
	}

	for (const def of tabDefs) {
		const btn = tabBar.createEl("button", {
			type: "button",
			cls: "ra-style-tab",
			text: def.label,
		});
		btn.dataset.tabId = def.id;
		btn.addEventListener("click", () => setActiveStyleTab(def.id));
	}
	setActiveStyleTab(options?.initialStyleTabId ?? DEFAULT_STYLE_EDITOR_TAB_ID, true);

	sectionHeading(panelTypography, "Body and paragraph");
	new Setting(panelTypography)
		.setName("Body font family")
		.setDesc("Font stack for body text (for example latin modern roman).")
		.addText((text) =>
			text.setValue(t.fontBody).onChange((v) => {
				patchTokens({ fontBody: v });
			}),
		);
	new Setting(panelTypography)
		.setName("Body font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 16, 1)
				.setValue(t.fontSizeBody)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ fontSizeBody: v })),
		);
	new Setting(panelTypography)
		.setName("Body line-height")
		.addSlider((slider) =>
			slider
				.setLimits(1, 2, 0.1)
				.setValue(t.lineHeightBody)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ lineHeightBody: v })),
		);
	new Setting(panelTypography)
		.setName("Tab size")
		.addSlider((slider) =>
			slider.setLimits(2, 8, 1).setValue(t.tabSize).setDynamicTooltip().onChange((v) => patchTokens({ tabSize: v })),
		);
	new Setting(panelTypography)
		.setName("Paragraph alignment")
		.addDropdown((dropdown) => {
			for (const [val, label] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, label);
			}
			dropdown.setValue(t.paragraphTextAlign).onChange((v) => patchTokens({ paragraphTextAlign: v as TextAlignOption }));
		});
	new Setting(panelTypography)
		.setName("Paragraph spacing (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.paragraphSpacing)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ paragraphSpacing: v })),
		);
	new Setting(panelTypography)
		.setName("Section spacing (px)")
		.setDesc("Space before headings.")
		.addSlider((slider) =>
			slider
				.setLimits(0, 48, 1)
				.setValue(t.sectionSpacing)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ sectionSpacing: v })),
		);
	new Setting(panelTypography)
		.setName("Text color")
		.addColorPicker((picker) => picker.setValue(t.colorText).onChange((v) => patchTokens({ colorText: v })));

	sectionHeading(panelPagePrint, "Page margins (print)");
	for (const [key, label] of [
		["pageMarginTop", "Top"],
		["pageMarginRight", "Right"],
		["pageMarginBottom", "Bottom"],
		["pageMarginLeft", "Left"],
	] as const) {
		const marginKey = key;
		new Setting(panelPagePrint)
			.setName(`Margin ${label}`)
			.addText((text) =>
				text.setPlaceholder("2cm").setValue(t[marginKey]).onChange((v) => {
					patchTokens({ [marginKey]: v.trim() || "2cm" } as Partial<StyleTokens>);
				}),
			);
	}
	new Setting(panelPagePrint)
		.setName("Page background color")
		.addColorPicker((picker) =>
			picker
				.setValue(t.pageBackgroundColor)
				.onChange((v) => patchTokens({ pageBackgroundColor: v })),
		);

	sectionHeading(panelLinksTags, "Links & tags (HTML, PDF, DOCX)");
	new Setting(panelLinksTags)
		.setName("External link color (http, mailto)")
		.setDesc(
			":root variables --ra-export-link-external-*, --ra-export-link-internal-*, --ra-export-inline-tag-* (see generated CSS).",
		)
		.addColorPicker((picker) =>
			picker
				.setValue(t.exportLinkExternalColor)
				.onChange((v) => patchTokens({ exportLinkExternalColor: v })),
		);
	new Setting(panelLinksTags)
		.setName("External link underline")
		.addToggle((toggle) =>
			toggle
				.setValue(t.exportLinkExternalUnderline)
				.onChange((v) => patchTokens({ exportLinkExternalUnderline: v })),
		);
	new Setting(panelLinksTags)
		.setName("Internal link color (headings, vault paths)")
		.addColorPicker((picker) =>
			picker
				.setValue(t.exportLinkInternalColor)
				.onChange((v) => patchTokens({ exportLinkInternalColor: v })),
		);
	new Setting(panelLinksTags)
		.setName("Internal link underline")
		.addToggle((toggle) =>
			toggle
				.setValue(t.exportLinkInternalUnderline)
				.onChange((v) => patchTokens({ exportLinkInternalUnderline: v })),
		);
	new Setting(panelLinksTags)
		.setName("Inline tag color (#tag)")
		.setDesc("DOCX only: in HTML/PDF preview and PDF export, inline #tags stay plain body text.")
		.addColorPicker((picker) =>
			picker
				.setValue(t.exportInlineTagColor)
				.onChange((v) => patchTokens({ exportInlineTagColor: v })),
		);
	new Setting(panelLinksTags)
		.setName("Inline tag underline")
		.addToggle((toggle) =>
			toggle
				.setValue(t.exportInlineTagUnderline)
				.onChange((v) => patchTokens({ exportInlineTagUnderline: v })),
		);

	sectionHeading(panelTypography, "Emphasis");
	new Setting(panelTypography)
		.setName("Strong color")
		.addColorPicker((picker) => picker.setValue(t.strongColor).onChange((v) => patchTokens({ strongColor: v })));
	new Setting(panelTypography)
		.setName("Emphasis color")
		.addColorPicker((picker) => picker.setValue(t.emColor).onChange((v) => patchTokens({ emColor: v })));

	sectionHeading(panelHeadingsCredits, "Headings");
	new Setting(panelHeadingsCredits)
		.setName("Heading font family")
		.addText((text) =>
			text.setValue(t.fontHeading).onChange((v) => patchTokens({ fontHeading: v })),
		);
	new Setting(panelHeadingsCredits)
		.setName("Heading line-height")
		.addSlider((slider) =>
			slider
				.setLimits(0.8, 2, 0.05)
				.setValue(t.headingLineHeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ headingLineHeight: v })),
		);
	new Setting(panelHeadingsCredits)
		.setName("Heading font weight")
		.addSlider((slider) =>
			slider
				.setLimits(400, 900, 100)
				.setValue(t.headingFontWeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ headingFontWeight: v })),
		);
	new Setting(panelHeadingsCredits)
		.setName("Heading margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 48, 1)
				.setValue(t.headingMarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ headingMarginTop: v })),
		);
	new Setting(panelHeadingsCredits)
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
		new Setting(panelHeadingsCredits).setName(label).addSlider((slider) =>
			slider
				.setLimits(min, max, 1)
				.setValue(t[key])
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ [key]: v })),
		);
	}
	new Setting(panelHeadingsCredits)
		.setName("H1 font family")
		.setDesc("Small caps font for titles (for example latin modern roman caps).")
		.addText((text) =>
			text.setValue(t.h1FontFamily).onChange((v) => patchTokens({ h1FontFamily: v })),
		);
	new Setting(panelHeadingsCredits)
		.setName("H1 alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.h1TextAlign).onChange((v) => patchTokens({ h1TextAlign: v as TextAlignOption }));
		});
	new Setting(panelHeadingsCredits)
		.setName("H1 font weight")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", "Normal")
				.addOption("bold", "Bold")
				.setValue(t.h1FontWeight)
				.onChange((v) => patchTokens({ h1FontWeight: v as "normal" | "bold" })),
		);
	new Setting(panelHeadingsCredits)
		.setName("H6 font family")
		.addText((text) =>
			text.setValue(t.h6FontFamily).onChange((v) => patchTokens({ h6FontFamily: v })),
		);
	new Setting(panelHeadingsCredits)
		.setName("H6 alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.h6TextAlign).onChange((v) => patchTokens({ h6TextAlign: v as TextAlignOption }));
		});
	new Setting(panelHeadingsCredits)
		.setName("H6 margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.h6MarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ h6MarginTop: v })),
		);

	sectionHeading(panelHeadingsCredits, "Credits (del)");
	new Setting(panelHeadingsCredits)
		.setName("Credits font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.creditsFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ creditsFontSize: v })),
		);
	new Setting(panelHeadingsCredits)
		.setName("Credits margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.creditsMarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ creditsMarginTop: v })),
		);
	new Setting(panelHeadingsCredits)
		.setName("Credits padding bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.creditsPaddingBottom)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ creditsPaddingBottom: v })),
		);

	sectionHeading(panelCode, "Code and pre");
	new Setting(panelCode)
		.setName("Code block background")
		.addColorPicker((picker) =>
			picker.setValue(t.codeBlockBackground).onChange((v) => patchTokens({ codeBlockBackground: v })),
		);
	new Setting(panelCode)
		.setName("Code normal color (CSS var)")
		.addColorPicker((picker) =>
			picker.setValue(t.codeNormalColor).onChange((v) => patchTokens({ codeNormalColor: v })),
		);
	new Setting(panelCode)
		.setName("Inline code color")
		.addColorPicker((picker) =>
			picker.setValue(t.codeInlineColor).onChange((v) => patchTokens({ codeInlineColor: v })),
		);
	new Setting(panelCode)
		.setName("Code font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.codeFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ codeFontSize: v })),
		);
	new Setting(panelCode)
		.setName("Pre background")
		.addColorPicker((picker) =>
			picker.setValue(t.preBackground).onChange((v) => patchTokens({ preBackground: v })),
		);
	new Setting(panelCode)
		.setName("Pre border style")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("dashed", "Dashed")
				.addOption("solid", "Solid")
				.addOption("none", "None")
				.setValue(t.preBorderStyle)
				.onChange((v) => patchTokens({ preBorderStyle: v as StyleTokens["preBorderStyle"] })),
		);
	new Setting(panelCode)
		.setName("Pre border width")
		.setDesc("Border width for pre blocks, for example 1px 0 for top and bottom only.")
		.addText((text) =>
			text.setPlaceholder("1px 0").setValue(t.preBorderWidth).onChange((v) => patchTokens({ preBorderWidth: v })),
		);
	new Setting(panelCode)
		.setName("Pre border color")
		.addColorPicker((picker) =>
			picker.setValue(t.preBorderColor).onChange((v) => patchTokens({ preBorderColor: v })),
		);
	new Setting(panelCode)
		.setName("Pre border radius (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 12, 1)
				.setValue(t.preBorderRadius)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ preBorderRadius: v })),
		);
	new Setting(panelCode)
		.setName("Pre line-height")
		.addSlider((slider) =>
			slider
				.setLimits(0.8, 2, 0.05)
				.setValue(t.preLineHeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ preLineHeight: v })),
		);
	new Setting(panelCode)
		.setName("Pre white space")
		.setDesc("How fenced code blocks wrap in PDF/HTML export.")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("pre-wrap", "Wrap long lines")
				.addOption("pre", "Do not wrap (strict)")
				.setValue(t.preWhiteSpace)
				.onChange((v) => patchTokens({ preWhiteSpace: v as PreWhiteSpaceMode })),
		);
	new Setting(panelCode)
		.setName("Default highlight background")
		.setDesc(
			"Used for ==text==. Named colors use =={red} text== (Emic-QDA style). " +
				"Picker sets a solid color; use the text field for rgba() or other CSS.",
		)
		.addColorPicker((picker) =>
			picker
				.setValue(highlightBackgroundCssToPickerHex(t.highlightDefaultBackground))
				.onChange((v) => patchTokens({ highlightDefaultBackground: v })),
		)
		.addText((text) =>
			text
				.setPlaceholder("rgba(255, 235, 59, 0.45)")
				.setValue(t.highlightDefaultBackground)
				.onChange((v) => patchTokens({ highlightDefaultBackground: v })),
		);
	new Setting(panelCode)
		.setName("Highlight border radius (px)")
		.setDesc("Applies to ==highlight== in export HTML/PDF.")
		.addSlider((slider) =>
			slider
				.setLimits(0, 12, 1)
				.setValue(t.highlightBorderRadiusPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ highlightBorderRadiusPx: v })),
		);
	new Setting(panelCode)
		.setName("Highlight padding (CSS)")
		.setDesc("Padding inside mark highlights, for example 0 0.12em.")
		.addText((text) =>
			text.setPlaceholder("0 0.12em").setValue(t.highlightPaddingCss).onChange((v) => patchTokens({ highlightPaddingCss: v })),
		);
	new Setting(panelCode)
		.setName("Code block spacing before (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.codeBlockSpacingBefore)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ codeBlockSpacingBefore: v })),
		);
	new Setting(panelCode)
		.setName("Code block spacing after (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.codeBlockSpacingAfter)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ codeBlockSpacingAfter: v })),
		);

	sectionHeading(panelSyntaxColors, "Syntax highlighting (export HTML/PDF)");
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight base color")
		.setDesc("Default text color inside fenced code blocks.")
		.addColorPicker((picker) => picker.setValue(t.hljsBaseColor).onChange((v) => patchTokens({ hljsBaseColor: v })));
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight comment / quote")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsCommentColor).onChange((v) => patchTokens({ hljsCommentColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight keyword")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsKeywordColor).onChange((v) => patchTokens({ hljsKeywordColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight literal (number, variable, …)")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsLiteralColor).onChange((v) => patchTokens({ hljsLiteralColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight string")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsStringColor).onChange((v) => patchTokens({ hljsStringColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight title / class / type")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsTitleColor).onChange((v) => patchTokens({ hljsTitleColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight name (symbol, tag, …)")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsNameColor).onChange((v) => patchTokens({ hljsNameColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight deletion")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsDeletionColor).onChange((v) => patchTokens({ hljsDeletionColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight attribute / meta")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsAttrColor).onChange((v) => patchTokens({ hljsAttrColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Syntax highlight punctuation / params")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsPunctuationColor).onChange((v) => patchTokens({ hljsPunctuationColor: v })),
		);
	new Setting(panelSyntaxColors)
		.setName("Prism variable color (export)")
		.addColorPicker((picker) =>
			picker.setValue(t.hljsPrismVariableColor).onChange((v) => patchTokens({ hljsPrismVariableColor: v })),
		);

	sectionHeading(panelCallouts, "Callouts");
	new Setting(panelCallouts)
		.setName("Left accent width (px)")
		.addSlider((slider) =>
			slider
				.setLimits(2, 12, 1)
				.setValue(t.calloutBorderLeftWidthPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutBorderLeftWidthPx: v })),
		);
	new Setting(panelCallouts)
		.setName("Border radius (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 16, 1)
				.setValue(t.calloutBorderRadiusPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutBorderRadiusPx: v })),
		);
	new Setting(panelCallouts)
		.setName("Background tint strength (%)")
		.setDesc("0 = white box, 100 = full accent tint.")
		.addSlider((slider) =>
			slider
				.setLimits(0, 40, 1)
				.setValue(Math.round(t.calloutSurfaceOpacity * 100))
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutSurfaceOpacity: v / 100 })),
		);
	new Setting(panelCallouts)
		.setName("Outer border mix (%)")
		.setDesc("How strong the outer border color is toward the accent.")
		.addSlider((slider) =>
			slider
				.setLimits(5, 80, 1)
				.setValue(Math.round(t.calloutFrameBorderOpacity * 100))
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutFrameBorderOpacity: v / 100 })),
		);
	new Setting(panelCallouts)
		.setName("Title bar tint (%)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 40, 1)
				.setValue(Math.round(t.calloutTitleBarOpacity * 100))
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutTitleBarOpacity: v / 100 })),
		);
	new Setting(panelCallouts)
		.setName("Title separator strength (%)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 60, 1)
				.setValue(Math.round(t.calloutTitleSeparatorOpacity * 100))
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutTitleSeparatorOpacity: v / 100 })),
		);
	new Setting(panelCallouts)
		.setName("Vertical margin (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 48, 1)
				.setValue(t.calloutVerticalMarginPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutVerticalMarginPx: v })),
		);
	new Setting(panelCallouts)
		.setName("Title padding (CSS)")
		.setDesc("For example 8px 14px.")
		.addText((text) =>
			text.setValue(t.calloutTitlePaddingCss).onChange((v) => patchTokens({ calloutTitlePaddingCss: v })),
		);
	new Setting(panelCallouts)
		.setName("Content padding (CSS)")
		.setDesc("For example 10px 14px 12px.")
		.addText((text) =>
			text.setValue(t.calloutContentPaddingCss).onChange((v) => patchTokens({ calloutContentPaddingCss: v })),
		);
	new Setting(panelCallouts)
		.setName("Title size (× body)")
		.addSlider((slider) =>
			slider
				.setLimits(0.65, 1.1, 0.01)
				.setValue(t.calloutTitleFontScale)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutTitleFontScale: v })),
		);
	new Setting(panelCallouts)
		.setName("Title letter-spacing (em)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 0.15, 0.005)
				.setValue(t.calloutTitleLetterSpacingEm)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutTitleLetterSpacingEm: v })),
		);
	new Setting(panelCallouts)
		.setName("Title and icon gap (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 20, 1)
				.setValue(t.calloutTitleGapPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutTitleGapPx: v })),
		);
	new Setting(panelCallouts)
		.setName("Icon opacity")
		.addSlider((slider) =>
			slider
				.setLimits(0.3, 1, 0.05)
				.setValue(t.calloutIconOpacity)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutIconOpacity: v })),
		);
	new Setting(panelCallouts)
		.setName("Icon size (em)")
		.setDesc("Width and height of the callout title icon.")
		.addSlider((slider) =>
			slider
				.setLimits(0.8, 1.6, 0.05)
				.setValue(t.calloutIconSizeEm)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutIconSizeEm: v })),
		);
	new Setting(panelCallouts)
		.setName("Callout inner padding — DOCX (pt)")
		.setDesc("Approximates padding inside the Word callout box.")
		.addSlider((slider) =>
			slider
				.setLimits(4, 18, 1)
				.setValue(t.calloutCellPaddingPt)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutCellPaddingPt: v })),
		);
	new Setting(panelCallouts)
		.setName("DOCX frame border mix (%)")
		.setDesc("Tint of non-accent borders in Word export.")
		.addSlider((slider) =>
			slider
				.setLimits(5, 80, 1)
				.setValue(Math.round(t.calloutDocxFrameBorderMix * 100))
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ calloutDocxFrameBorderMix: v / 100 })),
		);

	sectionHeading(panelMathFigures, "Math");
	new Setting(panelMathFigures)
		.setName("Inline math scale (%)")
		.setDesc(
			"Relative to body text size. 100% = same as body; used for PDF, HTML export, and Word.",
		)
		.addSlider((slider) =>
			slider
				.setLimits(50, 130, 5)
				.setValue(t.mathInlineScalePercent)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ mathInlineScalePercent: v, mathScalePercent: v })),
		);
	new Setting(panelMathFigures)
		.setName("Display math scale (%)")
		.setDesc(
			"Relative to body text size. Default 120% = 20% larger than body; same formula in PDF and Word.",
		)
		.addSlider((slider) =>
			slider
				.setLimits(50, 150, 5)
				.setValue(t.mathDisplayScalePercent)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ mathDisplayScalePercent: v, mathScalePercent: v })),
		);
	new Setting(panelMathFigures)
		.setName("Math export color")
		.setDesc("Ink color when formulas are rasterized for Word, PDF, and export HTML.")
		.addColorPicker((picker) =>
			picker.setValue(t.mathExportColor).onChange((v) => patchTokens({ mathExportColor: v })),
		);

	sectionHeading(panelMathFigures, "Figures and images");
	new Setting(panelMathFigures)
		.setName("Image margin top (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.imageMarginTop)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ imageMarginTop: v })),
		);
	new Setting(panelMathFigures)
		.setName("Image margin bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.imageMarginBottom)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ imageMarginBottom: v })),
		);
	new Setting(panelMathFigures)
		.setName("Image horizontal margin")
		.setDesc("Horizontal margin for images; use auto to center.")
		.addText((text) =>
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- css keyword
			text.setPlaceholder("auto").setValue(t.imageMarginHorizontal).onChange((v) => patchTokens({ imageMarginHorizontal: v })),
		);
	new Setting(panelMathFigures)
		.setName("Raster math inline margin (CSS)")
		.setDesc("Margins for inline formula images, for example 0 0.1em.")
		.addText((text) =>
			text
				.setPlaceholder("0 0.1em")
				.setValue(t.imageMathInlineMarginCss)
				.onChange((v) => patchTokens({ imageMathInlineMarginCss: v })),
		);
	new Setting(panelMathFigures)
		.setName("Raster math display margin (CSS)")
		.setDesc("Margins for block/display formula images, for example 0.75em auto.")
		.addText((text) =>
			text
				.setPlaceholder("0.75em auto")
				.setValue(t.imageMathDisplayMarginCss)
				.onChange((v) => patchTokens({ imageMathDisplayMarginCss: v })),
		);
	new Setting(panelMathFigures)
		.setName("Caption font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(6, 12, 1)
				.setValue(t.captionFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ captionFontSize: v })),
		);
	new Setting(panelMathFigures)
		.setName("Caption margin bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.captionMarginBottom)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ captionMarginBottom: v })),
		);

	sectionHeading(panelBlocks, "Tables");
	new Setting(panelBlocks)
		.setName("Table font family")
		.addText((text) =>
			text.setValue(t.tableFontFamily).onChange((v) => patchTokens({ tableFontFamily: v })),
		);
	new Setting(panelBlocks)
		.setName("Table font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.tableFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ tableFontSize: v })),
		);
	new Setting(panelBlocks)
		.setName("Table text alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.tableTextAlign).onChange((v) => patchTokens({ tableTextAlign: v as TextAlignOption }));
		});
	new Setting(panelBlocks)
		.setName("Table cell padding")
		.setDesc("Padding for table cells, for example 2px 5px.")
		.addText((text) =>
			text.setValue(t.tableCellPadding).onChange((v) => patchTokens({ tableCellPadding: v })),
		);
	new Setting(panelBlocks)
		.setName("Table header font weight")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("normal", "Normal")
				.addOption("bold", "Bold")
				.setValue(t.thFontWeight)
				.onChange((v) => patchTokens({ thFontWeight: v as "normal" | "bold" })),
		);

	sectionHeading(panelBlocks, "Lists");
	new Setting(panelBlocks)
		.setName("List font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 16, 1)
				.setValue(t.listFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ listFontSize: v })),
		);
	new Setting(panelBlocks)
		.setName("List line-height")
		.addSlider((slider) =>
			slider
				.setLimits(1, 2, 0.05)
				.setValue(t.listLineHeight)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ listLineHeight: v })),
		);
	new Setting(panelBlocks)
		.setName("Custom bullet style")
		.addToggle((toggle) =>
			toggle.setValue(t.listCustomBullet).onChange((v) => patchTokens({ listCustomBullet: v })),
		);
	new Setting(panelBlocks)
		.setName("Bullet horizontal offset")
		.setDesc("Left position for custom bullet, e.g. -1.15em.")
		.addText((text) =>
			text.setValue(t.listBulletOffset).onChange((v) => patchTokens({ listBulletOffset: v })),
		);
	new Setting(panelBlocks)
		.setName("Bullet character")
		.setDesc("Single character used for custom bullets.")
		.addText((text) =>
			text
				.setValue(t.listBulletChar)
				.onChange((v) => patchTokens({ listBulletChar: v.trim() || "\u2022" })),
		);
	new Setting(panelBlocks)
		.setName("Bullet vertical offset")
		.setDesc("Top position for custom bullet, e.g. -0.05em.")
		.addText((text) =>
			text
				.setValue(t.listBulletTopOffset)
				.onChange((v) => patchTokens({ listBulletTopOffset: v.trim() || "-0.05em" })),
		);
	new Setting(panelBlocks)
		.setName("List indent per level (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(6, 36, 1)
				.setValue(t.listIndentPerLevel)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ listIndentPerLevel: v })),
		);
	new Setting(panelBlocks)
		.setName("Custom bullet size (× list text)")
		.setDesc("Font size of the ::before bullet when custom bullets are on.")
		.addSlider((slider) =>
			slider
				.setLimits(0.9, 1.4, 0.05)
				.setValue(t.listBulletRelativeFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ listBulletRelativeFontSize: v })),
		);

	sectionHeading(panelBlocks, "Blockquotes");
	new Setting(panelBlocks)
		.setName("Blockquote alignment")
		.addDropdown((dropdown) => {
			for (const [val, lab] of Object.entries(textAlignOptions)) {
				dropdown.addOption(val, lab);
			}
			dropdown.setValue(t.blockquoteTextAlign).onChange((v) => patchTokens({ blockquoteTextAlign: v as TextAlignOption }));
		});
	new Setting(panelBlocks)
		.setName("Blockquote font size (pt)")
		.addSlider((slider) =>
			slider
				.setLimits(8, 14, 1)
				.setValue(t.blockquoteFontSize)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteFontSize: v })),
		);
	new Setting(panelBlocks)
		.setName("Blockquote vertical margin (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 24, 1)
				.setValue(t.blockquoteMarginY)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteMarginY: v })),
		);
	new Setting(panelBlocks)
		.setName("Blockquote italic body")
		.setDesc("Typical for quoted passages in print (HTML/PDF).")
		.addToggle((toggle) => toggle.setValue(t.blockquoteItalic).onChange((v) => patchTokens({ blockquoteItalic: v })));
	new Setting(panelBlocks)
		.setName("Show vertical side bar")
		.setDesc("Left rule in HTML/PDF; paragraph border in DOCX. When off, only indent and typography apply.")
		.addToggle((toggle) =>
			toggle.setValue(t.blockquoteShowVerticalBar).onChange((v) => patchTokens({ blockquoteShowVerticalBar: v })),
		);
	new Setting(panelBlocks)
		.setName("Side bar color")
		.setDesc("Ignored when the side bar is hidden.")
		.addColorPicker((picker) =>
			picker.setValue(t.blockquoteBarColor).onChange((v) => patchTokens({ blockquoteBarColor: v })),
		);
	new Setting(panelBlocks)
		.setName("Side bar width (px)")
		.setDesc("Ignored when the side bar is hidden.")
		.addSlider((slider) =>
			slider
				.setLimits(1, 8, 1)
				.setValue(t.blockquoteBarWidthPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteBarWidthPx: v })),
		);
	new Setting(panelBlocks)
		.setName("Inner padding (CSS)")
		.setDesc("Padding inside blockquotes (not callouts), for example 0.35em 0.65em 0.35em 0.95em.")
		.addText((text) =>
			text.setValue(t.blockquoteInnerPaddingCss).onChange((v) => patchTokens({ blockquoteInnerPaddingCss: v })),
		);
	new Setting(panelBlocks)
		.setName("Nested blockquote margin top")
		.addText((text) =>
			text.setPlaceholder("0.45em").setValue(t.blockquoteNestedMarginTop).onChange((v) => patchTokens({ blockquoteNestedMarginTop: v })),
		);
	new Setting(panelBlocks)
		.setName("Nested blockquote margin bottom")
		.addText((text) =>
			text
				.setPlaceholder("0.3em")
				.setValue(t.blockquoteNestedMarginBottom)
				.onChange((v) => patchTokens({ blockquoteNestedMarginBottom: v })),
		);
	new Setting(panelBlocks)
		.setName("Nested blockquote padding left")
		.addText((text) =>
			text.setPlaceholder("0.85em").setValue(t.blockquoteNestedPaddingLeft).onChange((v) => patchTokens({ blockquoteNestedPaddingLeft: v })),
		);
	new Setting(panelBlocks)
		.setName("Nested side bar tint (%)")
		.setDesc("Mix blockquote bar color toward white for nested quotes.")
		.addSlider((slider) =>
			slider
				.setLimits(0, 100, 1)
				.setValue(t.blockquoteNestedBarMixPercent)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteNestedBarMixPercent: v })),
		);
	new Setting(panelBlocks)
		.setName("Paragraph gap in blockquote (em)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 0.6, 0.02)
				.setValue(t.blockquoteParagraphGapEm)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteParagraphGapEm: v })),
		);
	new Setting(panelBlocks)
		.setName("Nested quote indent (pt)")
		.setDesc("Extra left indent per `>` level in Word export.")
		.addSlider((slider) =>
			slider
				.setLimits(6, 28, 1)
				.setValue(t.blockquoteNestedIndentPt)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ blockquoteNestedIndentPt: v })),
		);
	new Setting(panelBlocks)
		.setName("Blockquote CSS (:root)")
		.setDesc(
			"Alignment, size, margin, italic, and bar settings map to exported HTML/PDF CSS. Variables: " +
				"--ra-blockquote-text-align, --ra-blockquote-font-size, --ra-blockquote-margin-y, " +
				"--ra-blockquote-italic, --ra-blockquote-font-style, --ra-blockquote-bar-visible, " +
				"--ra-blockquote-bar, --ra-blockquote-bar-width, --ra-blockquote-nested-bar-width. " +
				"Rules use .ra-render-frame blockquote:not(.callout). Inspect preview or exported HTML :root for values.",
		);

	sectionHeading(panelBlocks, "Expanded details (export HTML/PDF)");
	new Setting(panelBlocks)
		.setName("Details block margin (CSS)")
		.setDesc("Margin around expanded <details> blocks, for example 0.65em 0.")
		.addText((text) =>
			text.setValue(t.exportDetailsMarginCss).onChange((v) => patchTokens({ exportDetailsMarginCss: v })),
		);
	new Setting(panelBlocks)
		.setName("Summary line bottom margin")
		.setDesc("Bottom margin for the summary line, for example 0.35em.")
		.addText((text) =>
			text
				.setPlaceholder("0.35em")
				.setValue(t.exportDetailsSummaryMarginBottom)
				.onChange((v) => patchTokens({ exportDetailsSummaryMarginBottom: v })),
		);

	sectionHeading(panelMathFigures, "Diagrams");
	new Setting(panelMathFigures)
		.setName("Mermaid diagram color")
		.addColorPicker((picker) =>
			picker.setValue(t.mermaidColor).onChange((v) => patchTokens({ mermaidColor: v })),
		);

	sectionHeading(panelPagePrint, "Print rules");
	new Setting(panelPagePrint)
		.setName("Heading numbering")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("none", "None")
				.addOption("h2-h4", "Levels 2 to 4")
				.addOption("h1-h6", "Levels 1 to 6")
				.setValue(pr.headingNumbering)
				.onChange((v) => patchPrint({ headingNumbering: v as PrintRules["headingNumbering"] })),
		);
	new Setting(panelPagePrint)
		.setName("Horizontal rule as page break")
		.setDesc("When on, a horizontal rule starts a new page in print/PDF.")
		.addToggle((toggle) =>
			toggle.setValue(pr.hrAsPageBreak).onChange((v) => patchPrint({ hrAsPageBreak: v })),
		);
	new Setting(panelPagePrint)
		.setName("Horizontal rule border color")
		.setDesc("Visible top border color for hr on screen (print may still use page breaks).")
		.addColorPicker((picker) => picker.setValue(t.hrBorderColor).onChange((v) => patchTokens({ hrBorderColor: v })));
	new Setting(panelPagePrint)
		.setName("Table page-break inside")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("avoid", "Avoid")
				.addOption("auto", "Auto")
				.setValue(pr.tableBreakBehavior)
				.onChange((v) => patchPrint({ tableBreakBehavior: v as "avoid" | "auto" })),
		);
	new Setting(panelPagePrint)
		.setName("Pre page-break inside")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("avoid", "Avoid")
				.addOption("auto", "Auto")
				.setValue(pr.prePageBreakInside)
				.onChange((v) => patchPrint({ prePageBreakInside: v as "avoid" | "auto" })),
		);
	new Setting(panelPagePrint)
		.setName("Image caption style")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("centered-small", "Centered small")
				.addOption("plain", "Plain")
				.setValue(pr.imageCaptionStyle)
				.onChange((v) => patchPrint({ imageCaptionStyle: v as PrintRules["imageCaptionStyle"] })),
		);

	// Background image (report / template)
	new Setting(panelPagePrint)
		.setName("Cover background opacity")
		.addSlider((slider) =>
			slider
				.setLimits(0, 1, 0.05)
				.setValue(t.coverBackgroundOpacity)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ coverBackgroundOpacity: v })),
		);
	new Setting(panelPagePrint)
		.setName("Cover title margin bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.coverTitleMarginBottomPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ coverTitleMarginBottomPx: v })),
		);
	new Setting(panelPagePrint)
		.setName("Cover subtitle margin bottom (px)")
		.addSlider((slider) =>
			slider
				.setLimits(0, 32, 1)
				.setValue(t.coverSubtitleMarginBottomPx)
				.setDynamicTooltip()
				.onChange((v) => patchTokens({ coverSubtitleMarginBottomPx: v })),
		);
	renderReportBackgroundPicker(panelPagePrint, state.backgroundImage, (next) => {
		state.backgroundImage = next;
		options?.onPrintBackgroundChange?.(Boolean(next?.assetPath));
		onChange(state);
	});
}
