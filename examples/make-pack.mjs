// Build a full theme pack from Node, no browser needed.
// Usage: node examples/make-pack.mjs            -> out/acme-theme-pack.zip
//        node examples/make-pack.mjs kata       -> out/kata-theme-pack.zip (one of the 16 presets)
// Author: Badr Abardazzou. MIT.
import fs from "node:fs";
import { completeBrand, allFiles, zip, slug, contrast, wcagGrade, closestPairs } from "../src/themekit.js";

const presets = JSON.parse(fs.readFileSync(new URL("../presets/presets.json", import.meta.url)));
const list = Array.isArray(presets) ? presets : presets.presets || Object.values(presets);
const pick = process.argv[2];
const found = pick && list.find((p) => slug(p.name || p.brand?.name || "") === pick.toLowerCase());
const brand = completeBrand(found ? found.brand || found : {
  name: "Acme",
  colors: ["#1F4E79", "#F39C12", "#27AE60", "#8E44AD", "#2E86C1", "#C0392B"],
  fontHeading: "Segoe UI Semibold", fontBody: "Segoe UI",
});

const ratio = contrast(brand.ink, brand.background);
console.log(`${brand.name}: text on background ${ratio.toFixed(1)}:1 (${wcagGrade(ratio)})`);
const worst = closestPairs(brand.colors).deutan;
console.log(`closest pair for deuteranopia: colours ${worst.i + 1} and ${worst.j + 1}, deltaE ${worst.d.toFixed(1)}`);

fs.mkdirSync("out", { recursive: true });
const file = `out/${slug(brand.name)}-theme-pack.zip`;
fs.writeFileSync(file, zip(allFiles(brand)));
console.log("wrote", file);
