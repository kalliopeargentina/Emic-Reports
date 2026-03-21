/**
 * Calls Emic-Charts-View's documented plugin API (same PNG as in-note "Export to PNG").
 * No compile-time dependency on that plugin — optional at runtime.
 */

import type { App } from "obsidian";
import { contiguousUint8Array, isValidPng } from "./binary-image";

/** Must match Emic-Charts-View `manifest.json` id. */
export const EMIC_CHARTS_VIEW_PLUGIN_ID = "emic-charts-view";

/** Must match Emic-Charts-View `export-api` / Chart host class. */
export const EMIC_CHARTS_PLOT_HOST_CLASS = "emic-charts-view-plot-host";

/** In-note "Export to PNG" control — sibling of the plot host; must not appear in export HTML/PDF. */
export const EMIC_CHARTS_EXPORT_BUTTON_CLASS = "emic-charts-view-export-button";

/**
 * Replace everything Emic-Charts-View rendered for this block (plot host + export button, etc.)
 * with a single chart image. Falls back to replacing only the plot host if the parent has extra nodes.
 */
export function replaceEmicBlockDomWithChartImage(plotHost: HTMLElement, img: HTMLImageElement): void {
	const parent = plotHost.parentElement;
	const blockWidth = Math.max(
		plotHost.getBoundingClientRect().width,
		parent?.getBoundingClientRect().width ?? 0,
	);

	const elementChildren = parent ? Array.from(parent.children) : [];
	const allowedSibling = (el: Element) =>
		el === plotHost ||
		(el instanceof HTMLElement && el.classList.contains(EMIC_CHARTS_EXPORT_BUTTON_CLASS));
	const onlyEmicChrome =
		parent !== null &&
		elementChildren.length > 0 &&
		elementChildren.every(allowedSibling) &&
		elementChildren.includes(plotHost);

	img.style.display = "block";
	img.style.maxWidth = "100%";
	img.style.height = "auto";
	if (blockWidth > 0) {
		img.style.width = `${Math.round(blockWidth)}px`;
	}

	if (onlyEmicChrome) {
		parent.replaceChildren(img);
	} else {
		plotHost.replaceChildren(img);
	}
}

/** Facade from Emic-Charts-View README. */
export type EmicChartsViewPluginLike = {
	api?: { exportPngFromElement(root: HTMLElement): Promise<Blob> };
};

export type TryEmicChartsViewExportOptions = {
	/** Console prefix on API failure, e.g. `[DOCX-export]` or `[HTML-preview]`. */
	logPrefix?: string;
};

/**
 * Same raster as Emic-Charts-View "Export to PNG" (`toDataURL` / canvas under plot host).
 * `root` must be an element that contains exactly one `.emic-charts-view-plot-host`, or be that host.
 */
export async function tryEmicChartsViewExportPng(
	app: App,
	root: HTMLElement,
	options?: TryEmicChartsViewExportOptions,
): Promise<Uint8Array | null> {
	const logPrefix = options?.logPrefix ?? "[emic-charts-view]";
	const registry = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins
		?.plugins;
	const plug = registry?.[EMIC_CHARTS_VIEW_PLUGIN_ID] as EmicChartsViewPluginLike | undefined;
	const api = plug?.api;
	if (!api || typeof api.exportPngFromElement !== "function") return null;
	try {
		const blob = await api.exportPngFromElement(root);
		if (!blob || blob.size < 200) return null;
		const bytes = new Uint8Array(await blob.arrayBuffer());
		if (!isValidPng(bytes)) return null;
		return contiguousUint8Array(bytes);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.info(
			"%s emic-charts-view api.exportPngFromElement failed: %s",
			logPrefix,
			e instanceof Error ? e.message : String(e),
		);
		return null;
	}
}

/** Embed PNG bytes as a data URL for serialized HTML / PDF. */
export function pngUint8ArrayToDataUrl(bytes: Uint8Array): string {
	const chunk = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode.apply(
			null,
			bytes.subarray(i, i + chunk) as unknown as number[],
		);
	}
	return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * For each Emic plot host under `root`, replace the whole block output (plot + export UI) with one
 * `<img>` from the plugin API. Hosts where the API fails are left unchanged.
 */
export async function replaceEmicPlotHostsWithApiImages(
	app: App,
	root: HTMLElement,
	options?: TryEmicChartsViewExportOptions,
): Promise<{ replaced: number; total: number }> {
	const hosts = Array.from(root.querySelectorAll<HTMLElement>(`.${EMIC_CHARTS_PLOT_HOST_CLASS}`));
	let replaced = 0;
	for (const plotHost of hosts) {
		const bytes = await tryEmicChartsViewExportPng(app, plotHost, options);
		if (!bytes) continue;
		const dataUrl = pngUint8ArrayToDataUrl(contiguousUint8Array(bytes));
		const img = document.createElement("img");
		img.src = dataUrl;
		img.alt = "chart";
		img.className = "emic-charts-view-export-img";
		replaceEmicBlockDomWithChartImage(plotHost, img);
		replaced += 1;
	}
	return { replaced, total: hosts.length };
}
