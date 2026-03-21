import { existsSync } from "fs";

/**
 * Locate Chrome or Edge for headless `--print-to-pdf` (Windows / macOS / Linux).
 */
export function resolveChromiumBinary(): string | null {
	const win = [
		"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
		"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
		"C:/Program Files/Google/Chrome/Application/chrome.exe",
		"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
	];
	const darwin = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	];
	const linux = [
		"/usr/bin/google-chrome-stable",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
	];
	let list: string[];
	if (process.platform === "win32") {
		list = win;
	} else if (process.platform === "darwin") {
		list = darwin;
	} else {
		list = linux;
	}
	for (const c of list) {
		if (existsSync(c)) return c;
	}
	return null;
}
