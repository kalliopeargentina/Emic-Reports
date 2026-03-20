/* global process */
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

const packageJsonPath = path.join(rootDir, "package.json");
const manifestPath = path.join(rootDir, "manifest.json");
const mainJsPath = path.join(rootDir, "main.js");
const stylesPath = path.join(rootDir, "styles.css");

if (!fs.existsSync(packageJsonPath)) {
	throw new Error("package.json not found in workspace root.");
}

if (!fs.existsSync(manifestPath)) {
	throw new Error("manifest.json not found in workspace root.");
}

if (!fs.existsSync(mainJsPath)) {
	throw new Error("main.js not found. Run npm run build first.");
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = packageJson.version ?? "0.0.0";
const pluginId = manifest.id ?? "obsidian-plugin";
const zipName = `${pluginId}-${version}.zip`;
const zipPath = path.join(distDir, zipName);
const packageRootFolder = "Emic-Reports";

if (!fs.existsSync(distDir)) {
	fs.mkdirSync(distDir, { recursive: true });
}

const zip = new AdmZip();
zip.addLocalFile(mainJsPath, packageRootFolder);
zip.addLocalFile(manifestPath, packageRootFolder);

if (fs.existsSync(stylesPath)) {
	zip.addLocalFile(stylesPath, packageRootFolder);
}

zip.writeZip(zipPath);
console.log(`Plugin package created: ${zipPath}`);
