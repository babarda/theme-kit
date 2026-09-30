/*
 * themekit.js: one brand in, every theme file out, plus the colour checks.
 * Author: Badr Abardazzou, https://babarda.com/tools/theme-builder. MIT licence.
 * Browser ES module, no dependency. Port of report-themes/generate.py, driven by a
 * "brand" object instead of the OVP tokens:
 *
 *   brand = {
 *     name: "Acme",
 *     colors: ["#1F4E79", ...],        // data colours in series order, 2 to 10
 *     background: "#FFFFFF", panel: "#F4F6F8", ink: "#101820", body: "#3A4450",
 *     hairline: "#D5DAE0", gridline: "#ECEFF2",
 *     good: "#2E8B57", bad: "#C0392B", neutral: "#D4A017",
 *     fontHeading: "Segoe UI Semibold", fontBody: "Segoe UI",
 *   }
 */

// ------------------------------------------------------------ colour math

export function normHex(h) {
  if (typeof h !== "string") return null;
  let s = h.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toUpperCase() : null;
}

export function hexToRgb(h) {
  const s = normHex(h).slice(1);
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return ("#" + c(r) + c(g) + c(b)).toUpperCase();
}

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const unlin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function luminance(h) {
  const [r, g, b] = hexToRgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function wcagGrade(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "Fail";
}

function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(lin);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIEDE2000 colour difference. Below about 10 two series start to look alike on a chart. */
export function deltaE(h1, h2) {
  const [L1, a1, b1] = rgbToLab(hexToRgb(h1));
  const [L2, a2, b2] = rgbToLab(hexToRgb(h2));
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360, h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = C1p * C2p === 0 ? 0 : h2p - h1p;
  if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) hbp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T, Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB.
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export const CVD_LABEL = { protan: "Protanopia (red-blind)", deutan: "Deuteranopia (green-blind)", tritan: "Tritanopia (blue-blind)", achroma: "Greyscale print" };

/** Simulate how a colour looks to someone with a colour-vision deficiency. */
export function simulate(h, kind) {
  const l = hexToRgb(h).map(lin);
  if (kind === "achroma") { const y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; return rgbToHex([y, y, y].map(unlin)); }
  const m = CVD[kind];
  return rgbToHex(m.map((row) => unlin(Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))));
}

/** Closest pair of data colours, normal vision and each deficiency. */
export function closestPairs(colors) {
  const out = {};
  for (const kind of ["normal", "protan", "deutan", "tritan", "achroma"]) {
    const cs = colors.map((c) => (kind === "normal" ? c : simulate(c, kind)));
    let best = { d: Infinity, i: -1, j: -1 };
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const d = deltaE(cs[i], cs[j]);
      if (d < best.d) best = { d, i, j };
    }
    out[kind] = best;
  }
  return out;
}

/** Tint (t > 0, towards white) or shade (t < 0, towards black), t in -1..1. */
export function mix(h, t) {
  const c = hexToRgb(h), target = t >= 0 ? 255 : 0, k = Math.abs(t);
  return rgbToHex(c.map((v) => v + (target - v) * k));
}

// ------------------------------------------------------------ brand model

export const DEFAULT_BRAND = {
  name: "My Brand",
  colors: ["#1F4E79", "#2E86C1", "#F39C12", "#27AE60", "#8E44AD", "#C0392B"],
  background: "#FFFFFF", panel: "#F4F6F8", ink: "#101820", body: "#3A4450",
  hairline: "#D5DAE0", gridline: "#ECEFF2",
  good: "#2E8B57", bad: "#C0392B", neutral: "#D4A017",
  fontHeading: "Segoe UI Semibold", fontBody: "Segoe UI",
};

/** Fill any missing role from the data colours and the background, so partial input still builds. */
export function completeBrand(input) {
  const b = { ...DEFAULT_BRAND, ...input };
  b.colors = (input.colors || DEFAULT_BRAND.colors).map(normHex).filter(Boolean);
  if (!b.colors.length) b.colors = DEFAULT_BRAND.colors.slice();
  for (const k of ["background", "panel", "ink", "body", "hairline", "gridline", "good", "bad", "neutral"]) b[k] = normHex(b[k]) || DEFAULT_BRAND[k];
  b.name = String(b.name || "My Brand").trim() || "My Brand";
  return b;
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";

/** Build a full brand from 1 to 3 picked colours (used by "Build a theme from this slide"). */
export function brandFromColors(hexes, name = "Slide palette") {
  const cs = hexes.map(normHex).filter(Boolean);
  const base = cs.length ? cs : DEFAULT_BRAND.colors.slice(0, 3);
  const extra = [];
  for (const c of base) { extra.push(mix(c, -0.35)); extra.push(mix(c, 0.35)); }
  const colors = [...base, ...extra].filter((c, i, a) => a.indexOf(c) === i).slice(0, 8);
  const ink = mix(base[0], -0.8);
  return completeBrand({ name, colors, ink, body: mix(base[0], -0.6), panel: mix(base[0], 0.94), hairline: mix(base[0], 0.8), gridline: mix(base[0], 0.9) });
}

// ------------------------------------------------------------ formats

const noHash = (c) => c.replace("#", "");

export function powerbiTheme(brand) {
  const b = completeBrand(brand);
  const solid = (color) => ({ solid: { color } });
  return {
    name: b.name,
    dataColors: b.colors,
    foreground: b.ink, foregroundNeutralSecondary: b.body, foregroundNeutralTertiary: b.hairline,
    background: b.background, backgroundLight: b.panel, backgroundNeutral: b.hairline,
    tableAccent: b.colors[0],
    good: b.good, bad: b.bad, neutral: b.neutral,
    maximum: b.colors[0], center: b.panel, minimum: b.background,
    textClasses: {
      callout: { fontFace: b.fontHeading, color: b.ink, fontSize: 28 },
      title: { fontFace: b.fontHeading, color: b.ink, fontSize: 14 },
      header: { fontFace: b.fontBody, color: b.ink, fontSize: 12 },
      label: { fontFace: b.fontBody, color: b.body, fontSize: 10 },
    },
    visualStyles: {
      "*": {
        "*": {
          background: [{ color: solid(b.background), transparency: 0 }],
          border: [{ show: false, color: solid(b.hairline) }],
          title: [{ fontColor: solid(b.ink), fontFamily: b.fontHeading, alignment: "left" }],
          labels: [{ color: solid(b.body) }],
          categoryAxis: [{ labelColor: solid(b.body), titleColor: solid(b.body), gridlineColor: solid(b.gridline) }],
          valueAxis: [{ labelColor: solid(b.body), titleColor: solid(b.body), gridlineColor: solid(b.gridline) }],
          legend: [{ labelColor: solid(b.body) }],
        },
      },
      page: { "*": { background: [{ color: solid(b.background), transparency: 0 }] } },
    },
  };
}

/** Six Office accents: the data colours, padded without repeats. */
export function officeAccents(brand) {
  const b = completeBrand(brand);
  const acc = [];
  for (const c of [...b.colors, b.good, b.bad, b.neutral, b.body, b.hairline, b.ink]) if (!acc.includes(c)) acc.push(c);
  // Office refuses a theme with fewer than six accents, so a short palette is padded with tints and shades.
  for (let k = 0; acc.length < 6 && k < 24; k++) { const c = mix(b.colors[k % b.colors.length], [0.45, -0.45, 0.7, -0.7][Math.floor(k / b.colors.length) % 4]); if (!acc.includes(c)) acc.push(c); }
  return acc.slice(0, 6);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const FMT_SCHEME = `  <a:fmtScheme name="Office">
   <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill></a:fillStyleLst>
   <a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst>
   <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
   <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst>
  </a:fmtScheme>`;

export function officeThemeXml(brand) {
  const b = completeBrand(brand), n = esc(b.name);
  const acc = officeAccents(b).map((c, i) => `\n    <a:accent${i + 1}><a:srgbClr val="${noHash(c)}"/></a:accent${i + 1}>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${n}">
 <a:themeElements>
  <a:clrScheme name="${n}">
    <a:dk1><a:srgbClr val="${noHash(b.ink)}"/></a:dk1>
    <a:lt1><a:srgbClr val="${noHash(b.background)}"/></a:lt1>
    <a:dk2><a:srgbClr val="${noHash(b.body)}"/></a:dk2>
    <a:lt2><a:srgbClr val="${noHash(b.panel)}"/></a:lt2>${acc}
    <a:hlink><a:srgbClr val="${noHash(b.colors[0])}"/></a:hlink>
    <a:folHlink><a:srgbClr val="${noHash(b.body)}"/></a:folHlink>
  </a:clrScheme>
  <a:fontScheme name="${n}">
   <a:majorFont><a:latin typeface="${esc(b.fontHeading)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
   <a:minorFont><a:latin typeface="${esc(b.fontBody)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
  </a:fontScheme>
${FMT_SCHEME}
 </a:themeElements>
 <a:objectDefaults/>
 <a:extraClrLst/>
</a:theme>
`;
}

const THMX_PARTS = {
  "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/theme/theme/themeManager.xml" ContentType="application/vnd.openxmlformats-officedocument.themeManager+xml"/><Override PartName="/theme/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
  "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="theme/theme/themeManager.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
  "theme/theme/themeManager.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:themeManager xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>',
  "theme/theme/_rels/themeManager.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme1.xml"/></Relationships>',
};

// PowerPoint needs a slide master inside the .thmx, or it falls back to a grey background style.
// These parts are the default Office 16:9 master and its 11 layouts (saved by PowerPoint as .thmx, extLst removed).
const THMX_MASTER_PARTS = {
  "theme/presentation.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:presentation xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" saveSubsetFonts=\"1\"><p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst><p:sldSz cx=\"12192000\" cy=\"6858000\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/><p:defaultTextStyle><a:defPPr><a:defRPr lang=\"en-US\"/></a:defPPr><a:lvl1pPr marL=\"0\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl9pPr></p:defaultTextStyle></p:presentation>",
  "theme/_rels/presentation.xml.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"slideMasters/slideMaster1.xml\"/></Relationships>",
  "theme/slideMasters/slideMaster1.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldMaster xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:cSld><p:bg><p:bgRef idx=\"1001\"><a:schemeClr val=\"bg1\"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title Placeholder 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"838200\" y=\"365125\"/><a:ext cx=\"10515600\" cy=\"1325563\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert=\"horz\" lIns=\"91440\" tIns=\"45720\" rIns=\"91440\" bIns=\"45720\" rtlCol=\"0\" anchor=\"ctr\"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Text Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"838200\" y=\"1825625\"/><a:ext cx=\"10515600\" cy=\"4351338\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert=\"horz\" lIns=\"91440\" tIns=\"45720\" rIns=\"91440\" bIns=\"45720\" rtlCol=\"0\"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Date Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"2\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"838200\" y=\"6356350\"/><a:ext cx=\"2743200\" cy=\"365125\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert=\"horz\" lIns=\"91440\" tIns=\"45720\" rIns=\"91440\" bIns=\"45720\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:lvl1pPr algn=\"l\"><a:defRPr sz=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Footer Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"3\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"4038600\" y=\"6356350\"/><a:ext cx=\"4114800\" cy=\"365125\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert=\"horz\" lIns=\"91440\" tIns=\"45720\" rIns=\"91440\" bIns=\"45720\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:lvl1pPr algn=\"ctr\"><a:defRPr sz=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Slide Number Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"4\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"8610600\" y=\"6356350\"/><a:ext cx=\"2743200\" cy=\"365125\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert=\"horz\" lIns=\"91440\" tIns=\"45720\" rIns=\"91440\" bIns=\"45720\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:lvl1pPr algn=\"r\"><a:defRPr sz=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/><p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rId1\"/><p:sldLayoutId id=\"2147483650\" r:id=\"rId2\"/><p:sldLayoutId id=\"2147483651\" r:id=\"rId3\"/><p:sldLayoutId id=\"2147483652\" r:id=\"rId4\"/><p:sldLayoutId id=\"2147483653\" r:id=\"rId5\"/><p:sldLayoutId id=\"2147483654\" r:id=\"rId6\"/><p:sldLayoutId id=\"2147483655\" r:id=\"rId7\"/><p:sldLayoutId id=\"2147483656\" r:id=\"rId8\"/><p:sldLayoutId id=\"2147483657\" r:id=\"rId9\"/><p:sldLayoutId id=\"2147483658\" r:id=\"rId10\"/><p:sldLayoutId id=\"2147483659\" r:id=\"rId11\"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:buNone/><a:defRPr sz=\"4400\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mj-lt\"/><a:ea typeface=\"+mj-ea\"/><a:cs typeface=\"+mj-cs\"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL=\"228600\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"1000\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"2800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"685800\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"2400\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"1143000\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"2000\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1600200\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"2057400\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2514600\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2971800\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3429000\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3886200\" indent=\"-228600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:lnSpc><a:spcPct val=\"90000\"/></a:lnSpc><a:spcBef><a:spcPts val=\"500\"/></a:spcBef><a:buFont typeface=\"Arial\" panose=\"020B0604020202020204\" pitchFamily=\"34\" charset=\"0\"/><a:buChar char=\"\u2022\"/><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl9pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang=\"en-US\"/></a:defPPr><a:lvl1pPr marL=\"0\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr sz=\"1800\" kern=\"1200\"><a:solidFill><a:schemeClr val=\"tx1\"/></a:solidFill><a:latin typeface=\"+mn-lt\"/><a:ea typeface=\"+mn-ea\"/><a:cs typeface=\"+mn-cs\"/></a:defRPr></a:lvl9pPr></p:otherStyle></p:txStyles></p:sldMaster>",
  "theme/slideMasters/_rels/slideMaster1.xml.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId8\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout8.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout3.xml\"/><Relationship Id=\"rId7\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout7.xml\"/><Relationship Id=\"rId12\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"../theme/theme1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout2.xml\"/><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/><Relationship Id=\"rId6\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout6.xml\"/><Relationship Id=\"rId11\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout11.xml\"/><Relationship Id=\"rId5\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout5.xml\"/><Relationship Id=\"rId10\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout10.xml\"/><Relationship Id=\"rId4\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout4.xml\"/><Relationship Id=\"rId9\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout9.xml\"/></Relationships>",
  "theme/slideLayouts/slideLayout1.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"title\" preserve=\"1\"><p:cSld name=\"Title Slide\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ctrTitle\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"1524000\" y=\"1122363\"/><a:ext cx=\"9144000\" cy=\"2387600\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor=\"b\"/><a:lstStyle><a:lvl1pPr algn=\"ctr\"><a:defRPr sz=\"6000\"/></a:lvl1pPr></a:lstStyle><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Subtitle 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"subTitle\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"1524000\" y=\"3602038\"/><a:ext cx=\"9144000\" cy=\"1655762\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr marL=\"0\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"2400\"/></a:lvl1pPr><a:lvl2pPr marL=\"457200\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"2000\"/></a:lvl2pPr><a:lvl3pPr marL=\"914400\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"1800\"/></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" indent=\"0\" algn=\"ctr\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl9pPr></a:lstStyle><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master subtitle style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Date Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Footer Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Slide Number Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout2.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"obj\" preserve=\"1\"><p:cSld name=\"Title and Content\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Content Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Date Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Footer Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Slide Number Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout3.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"secHead\" preserve=\"1\"><p:cSld name=\"Section Header\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"831850\" y=\"1709738\"/><a:ext cx=\"10515600\" cy=\"2852737\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor=\"b\"/><a:lstStyle><a:lvl1pPr><a:defRPr sz=\"6000\"/></a:lvl1pPr></a:lstStyle><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Text Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"831850\" y=\"4589463\"/><a:ext cx=\"10515600\" cy=\"1500187\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr marL=\"0\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2400\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1800\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"><a:solidFill><a:schemeClr val=\"tx1\"><a:tint val=\"82000\"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Date Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Footer Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Slide Number Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout4.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"twoObj\" preserve=\"1\"><p:cSld name=\"Two Content\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Content Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph sz=\"half\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"838200\" y=\"1825625\"/><a:ext cx=\"5181600\" cy=\"4351338\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Content Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph sz=\"half\" idx=\"2\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"6172200\" y=\"1825625\"/><a:ext cx=\"5181600\" cy=\"4351338\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Date Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Footer Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"7\" name=\"Slide Number Placeholder 6\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout5.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"twoTxTwoObj\" preserve=\"1\"><p:cSld name=\"Comparison\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"839788\" y=\"365125\"/><a:ext cx=\"10515600\" cy=\"1325563\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Text Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"839788\" y=\"1681163\"/><a:ext cx=\"5157787\" cy=\"823912\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor=\"b\"/><a:lstStyle><a:lvl1pPr marL=\"0\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2400\" b=\"1\"/></a:lvl1pPr><a:lvl2pPr marL=\"457200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\" b=\"1\"/></a:lvl2pPr><a:lvl3pPr marL=\"914400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1800\" b=\"1\"/></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl9pPr></a:lstStyle><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Content Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph sz=\"half\" idx=\"2\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"839788\" y=\"2505075\"/><a:ext cx=\"5157787\" cy=\"3684588\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Text Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" sz=\"quarter\" idx=\"3\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"6172200\" y=\"1681163\"/><a:ext cx=\"5183188\" cy=\"823912\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor=\"b\"/><a:lstStyle><a:lvl1pPr marL=\"0\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2400\" b=\"1\"/></a:lvl1pPr><a:lvl2pPr marL=\"457200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\" b=\"1\"/></a:lvl2pPr><a:lvl3pPr marL=\"914400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1800\" b=\"1\"/></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\" b=\"1\"/></a:lvl9pPr></a:lstStyle><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Content Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph sz=\"quarter\" idx=\"4\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"6172200\" y=\"2505075\"/><a:ext cx=\"5183188\" cy=\"3684588\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"7\" name=\"Date Placeholder 6\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"8\" name=\"Footer Placeholder 7\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"9\" name=\"Slide Number Placeholder 8\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout6.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"titleOnly\" preserve=\"1\"><p:cSld name=\"Title Only\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Date Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Footer Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Slide Number Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout7.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"blank\" preserve=\"1\"><p:cSld name=\"Blank\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Date Placeholder 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Footer Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Slide Number Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout8.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"objTx\" preserve=\"1\"><p:cSld name=\"Content with Caption\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"839788\" y=\"457200\"/><a:ext cx=\"3932237\" cy=\"1600200\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor=\"b\"/><a:lstStyle><a:lvl1pPr><a:defRPr sz=\"3200\"/></a:lvl1pPr></a:lstStyle><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Content Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"5183188\" y=\"987425\"/><a:ext cx=\"6172200\" cy=\"4873625\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz=\"3200\"/></a:lvl1pPr><a:lvl2pPr><a:defRPr sz=\"2800\"/></a:lvl2pPr><a:lvl3pPr><a:defRPr sz=\"2400\"/></a:lvl3pPr><a:lvl4pPr><a:defRPr sz=\"2000\"/></a:lvl4pPr><a:lvl5pPr><a:defRPr sz=\"2000\"/></a:lvl5pPr><a:lvl6pPr><a:defRPr sz=\"2000\"/></a:lvl6pPr><a:lvl7pPr><a:defRPr sz=\"2000\"/></a:lvl7pPr><a:lvl8pPr><a:defRPr sz=\"2000\"/></a:lvl8pPr><a:lvl9pPr><a:defRPr sz=\"2000\"/></a:lvl9pPr></a:lstStyle><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Text Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" sz=\"half\" idx=\"2\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"839788\" y=\"2057400\"/><a:ext cx=\"3932237\" cy=\"3811588\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr marL=\"0\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl1pPr><a:lvl2pPr marL=\"457200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1400\"/></a:lvl2pPr><a:lvl3pPr marL=\"914400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1200\"/></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl9pPr></a:lstStyle><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Date Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Footer Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"7\" name=\"Slide Number Placeholder 6\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout9.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"picTx\" preserve=\"1\"><p:cSld name=\"Picture with Caption\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"839788\" y=\"457200\"/><a:ext cx=\"3932237\" cy=\"1600200\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor=\"b\"/><a:lstStyle><a:lvl1pPr><a:defRPr sz=\"3200\"/></a:lvl1pPr></a:lstStyle><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Picture Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"pic\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"5183188\" y=\"987425\"/><a:ext cx=\"6172200\" cy=\"4873625\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr marL=\"0\" indent=\"0\"><a:buNone/><a:defRPr sz=\"3200\"/></a:lvl1pPr><a:lvl2pPr marL=\"457200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2800\"/></a:lvl2pPr><a:lvl3pPr marL=\"914400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2400\"/></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\"/></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\"/></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\"/></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\"/></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\"/></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"2000\"/></a:lvl9pPr></a:lstStyle><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Text Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" sz=\"half\" idx=\"2\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"839788\" y=\"2057400\"/><a:ext cx=\"3932237\" cy=\"3811588\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr marL=\"0\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1600\"/></a:lvl1pPr><a:lvl2pPr marL=\"457200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1400\"/></a:lvl2pPr><a:lvl3pPr marL=\"914400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1200\"/></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" indent=\"0\"><a:buNone/><a:defRPr sz=\"1000\"/></a:lvl9pPr></a:lstStyle><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Date Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Footer Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"7\" name=\"Slide Number Placeholder 6\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout10.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"vertTx\" preserve=\"1\"><p:cSld name=\"Title and Vertical Text\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Vertical Text Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" orient=\"vert\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr vert=\"eaVert\"/><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Date Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Footer Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Slide Number Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
  "theme/slideLayouts/slideLayout11.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"vertTitleAndTx\" preserve=\"1\"><p:cSld name=\"Vertical Title and Text\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id=\"2\" name=\"Vertical Title 1\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"title\" orient=\"vert\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"8724900\" y=\"365125\"/><a:ext cx=\"2628900\" cy=\"5811838\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr vert=\"eaVert\"/><a:lstStyle/><a:p><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"3\" name=\"Vertical Text Placeholder 2\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"body\" orient=\"vert\" idx=\"1\"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"838200\" y=\"365125\"/><a:ext cx=\"7734300\" cy=\"5811838\"/></a:xfrm></p:spPr><p:txBody><a:bodyPr vert=\"eaVert\"/><a:lstStyle/><a:p><a:pPr lvl=\"0\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl=\"1\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl=\"2\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl=\"3\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl=\"4\"/><a:r><a:rPr lang=\"en-GB\"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"4\" name=\"Date Placeholder 3\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"dt\" sz=\"half\" idx=\"10\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{571265C7-4CB1-4196-9034-8CAD34961E77}\" type=\"datetimeFigureOut\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>29/09/2026</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"5\" name=\"Footer Placeholder 4\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"ftr\" sz=\"quarter\" idx=\"11\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id=\"6\" name=\"Slide Number Placeholder 5\"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp=\"1\"/></p:cNvSpPr><p:nvPr><p:ph type=\"sldNum\" sz=\"quarter\" idx=\"12\"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=\"{3D3CC850-4CDF-49D7-B499-6BFB00081669}\" type=\"slidenum\"><a:rPr lang=\"en-GB\" smtClean=\"0\"/><a:t>\u2039#\u203a</a:t></a:fld><a:endParaRPr lang=\"en-GB\"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>",
};
const THMX_LAYOUT_RELS = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"../slideMasters/slideMaster1.xml\"/></Relationships>";

const coreXml = (title) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Badr Abardazzou</dc:creator><cp:lastModifiedBy>Badr Abardazzou</cp:lastModifiedBy><dc:description>Made with https://babarda.com/tools/theme-builder</dc:description></cp:coreProperties>`;

/** Office theme package (.thmx): PowerPoint, Excel, Word, Outlook "Browse for Themes". */
export function thmx(brand) {
  const b = completeBrand(brand);
  const PML = "application/vnd.openxmlformats-officedocument.presentationml.";
  const layouts = Object.keys(THMX_MASTER_PARTS).filter((k) => k.includes("/slideLayouts/"));
  const overrides = [["/theme/presentation.xml", PML + "presentation.main+xml"], ["/theme/slideMasters/slideMaster1.xml", PML + "slideMaster+xml"], ...layouts.map((k) => ["/" + k, PML + "slideLayout+xml"])]
    .map(([n, t]) => `<Override PartName="${n}" ContentType="${t}"/>`).join("");
  const parts = { ...THMX_PARTS };
  parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace("</Types>", overrides + "</Types>");
  parts["theme/theme/_rels/themeManager.xml.rels"] = parts["theme/theme/_rels/themeManager.xml.rels"].replace("</Relationships>", '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="../presentation.xml"/></Relationships>');
  return zip([
    ...Object.entries(parts).map(([name, text]) => ({ name, data: text })),
    { name: "docProps/core.xml", data: coreXml(b.name + " theme") },
    { name: "theme/theme/theme1.xml", data: officeThemeXml(b) },
    ...Object.entries(THMX_MASTER_PARTS).map(([name, text]) => ({ name, data: text })),
    ...layouts.map((k) => ({ name: k.replace("slideLayouts/", "slideLayouts/_rels/") + ".rels", data: THMX_LAYOUT_RELS })),
  ]);
}

export function mplstyle(brand) {
  const b = completeBrand(brand), h = noHash;
  return [
    `# ${b.name} matplotlib style. Made with https://babarda.com/tools/theme-builder`,
    `figure.facecolor: ${h(b.background)}`, `savefig.facecolor: ${h(b.background)}`, `axes.facecolor: ${h(b.background)}`,
    `text.color: ${h(b.ink)}`, `axes.titlecolor: ${h(b.ink)}`, `axes.labelcolor: ${h(b.body)}`, `axes.edgecolor: ${h(b.hairline)}`,
    `xtick.color: ${h(b.body)}`, `ytick.color: ${h(b.body)}`, "axes.grid: True", "axes.axisbelow: True",
    `grid.color: ${h(b.gridline)}`, "axes.spines.top: False", "axes.spines.right: False",
    `axes.prop_cycle: cycler('color', [${b.colors.map((c) => `'${h(c)}'`).join(", ")}])`,
    `font.family: sans-serif`, `font.sans-serif: ${b.fontBody}, DejaVu Sans`, "legend.frameon: False", "",
  ].join("\n");
}

export function plotlyTemplate(brand) {
  const b = completeBrand(brand);
  const axis = { gridcolor: b.gridline, linecolor: b.hairline, zerolinecolor: b.hairline, tickfont: { color: b.body }, title: { font: { color: b.body } } };
  return { layout: { colorway: b.colors, paper_bgcolor: b.background, plot_bgcolor: b.background,
    font: { family: b.fontBody, color: b.body }, title: { font: { family: b.fontHeading, color: b.ink } },
    xaxis: axis, yaxis: axis, legend: { font: { color: b.body } },
    colorscale: { sequential: [[0, b.background], [1, b.colors[0]]], diverging: [[0, b.bad], [0.5, b.background], [1, b.good]] } } };
}

export function vegaLiteConfig(brand) {
  const b = completeBrand(brand);
  const axis = { gridColor: b.gridline, domainColor: b.hairline, tickColor: b.hairline, labelColor: b.body, titleColor: b.body, labelFont: b.fontBody, titleFont: b.fontBody };
  return { background: b.background, view: { stroke: "transparent" },
    range: { category: b.colors, ramp: [b.background, b.colors[0]], heatmap: [b.background, b.colors[0]], diverging: [b.bad, b.background, b.good] },
    axis, legend: { labelColor: b.body, titleColor: b.body, labelFont: b.fontBody, titleFont: b.fontBody },
    title: { font: b.fontHeading, color: b.ink, fontSize: 16, anchor: "start" } };
}

export function cssVars(brand) {
  const b = completeBrand(brand);
  const lines = [`/* ${b.name} theme. Made with https://babarda.com/tools/theme-builder */`, ":root {"];
  for (const k of ["background", "panel", "ink", "body", "hairline", "gridline", "good", "bad", "neutral"]) lines.push(`  --theme-${k}: ${b[k]};`);
  b.colors.forEach((c, i) => lines.push(`  --theme-series-${i + 1}: ${c};`));
  lines.push(`  --theme-font-heading: "${b.fontHeading}", system-ui, sans-serif;`, `  --theme-font-body: "${b.fontBody}", system-ui, sans-serif;`, "}", "");
  return lines.join("\n");
}

/** Tokens file: the brand itself, reloadable into the builder and the checker. */
export function tokensJson(brand) {
  const b = completeBrand(brand);
  return { $schema: "https://babarda.com/tools/themekit/brand.schema.json", generator: "https://babarda.com/tools/theme-builder", author: "Badr Abardazzou", ...b };
}

const README = (b) => `${b.name} theme pack
Made with https://babarda.com/tools/theme-builder (free, by Badr Abardazzou)

powerbi/${slug(b.name)}.json      Power BI Desktop: View > Themes > Browse for themes
office/${slug(b.name)}.thmx       PowerPoint and Word: Design > Themes > Browse for Themes
                                  Excel: Page Layout > Themes > Browse for Themes
office/theme1.xml                 raw Office theme part (advanced: swap inside a .pptx/.xlsx zip)
python/${slug(b.name)}.mplstyle   matplotlib: plt.style.use("${slug(b.name)}.mplstyle")
python/plotly-${slug(b.name)}.json plotly: pio.templates["brand"] = go.layout.Template(json.load(f))
web/vega-lite-${slug(b.name)}.json Vega-Lite config object
web/${slug(b.name)}.css           CSS custom properties (--theme-*)
brand.json                        your inputs; drop it back on the builder to edit later
`;

/** Every file for one brand, as [{name, data}] ready for zip(). */
export function allFiles(brand) {
  const b = completeBrand(brand), s = slug(b.name), j = (o) => JSON.stringify(o, null, 2) + "\n";
  return [
    { name: `powerbi/${s}.json`, data: j(powerbiTheme(b)) },
    { name: `office/${s}.thmx`, data: thmx(b) },
    { name: `office/theme1.xml`, data: officeThemeXml(b) },
    { name: `python/${s}.mplstyle`, data: mplstyle(b) },
    { name: `python/plotly-${s}.json`, data: j(plotlyTemplate(b)) },
    { name: `web/vega-lite-${s}.json`, data: j(vegaLiteConfig(b)) },
    { name: `web/${s}.css`, data: cssVars(b) },
    { name: "brand.json", data: j(tokensJson(b)) },
    { name: "README.txt", data: README(b) },
  ];
}

// ------------------------------------------------------------ zip (store, no compression)

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** Minimal deterministic zip writer. entries: [{name, data: string | Uint8Array}]. Returns Uint8Array. */
export function zip(entries) {
  const enc = new TextEncoder(), chunks = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), data = typeof e.data === "string" ? enc.encode(e.data) : e.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    chunks.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cSize = central.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let p = 0; for (const a of parts) { out.set(a, p); p += a.length; }
  return out;
}

/** Read a zip (stored or deflated) into {name: Uint8Array}. Uses DecompressionStream for deflate. */
export async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {};
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Not a zip file (no end record).");
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = u8.subarray(start, start + size);
    if (method === 0) out[name] = raw.slice();
    else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    p += 46 + nl + xl + cl;
  }
  return out;
}

/** Read the colour and font scheme out of an Office theme XML string. */
export function parseOfficeTheme(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const scheme = doc.getElementsByTagNameNS(A, "clrScheme")[0];
  if (!scheme) throw new Error("No colour scheme found in the theme.");
  const slot = (tag) => {
    const el = scheme.getElementsByTagNameNS(A, tag)[0];
    if (!el) return null;
    const s = el.getElementsByTagNameNS(A, "srgbClr")[0], sys = el.getElementsByTagNameNS(A, "sysClr")[0];
    return normHex(s ? s.getAttribute("val") : sys ? sys.getAttribute("lastClr") : null);
  };
  const font = (tag) => { const el = doc.getElementsByTagNameNS(A, tag)[0]; const l = el && el.getElementsByTagNameNS(A, "latin")[0]; return l ? l.getAttribute("typeface") : ""; };
  const accents = [1, 2, 3, 4, 5, 6].map((i) => slot("accent" + i)).filter(Boolean);
  return completeBrand({ name: scheme.getAttribute("name") || "Office theme", colors: accents, ink: slot("dk1"), background: slot("lt1"), body: slot("dk2"), panel: slot("lt2"), fontHeading: font("majorFont"), fontBody: font("minorFont") });
}

/** Read a Power BI theme JSON into a brand. */
export function parsePowerBiTheme(obj) {
  const tc = obj.textClasses || {};
  return completeBrand({ name: obj.name, colors: obj.dataColors || [], ink: obj.foreground, background: obj.background, body: obj.foregroundNeutralSecondary || (tc.label && tc.label.color), panel: obj.backgroundLight, hairline: obj.backgroundNeutral || obj.foregroundNeutralTertiary, good: obj.good, bad: obj.bad, neutral: obj.neutral, fontHeading: (tc.title && tc.title.fontFace) || undefined, fontBody: (tc.label && tc.label.fontFace) || undefined });
}

/** Load any supported file into a brand: brand.json, Power BI JSON, .thmx, .pptx, .xlsx, .docx, .potx. */
export async function brandFromFile(file) {
  const buf = await file.arrayBuffer(), name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    const o = JSON.parse(new TextDecoder().decode(buf));
    if (Array.isArray(o.colors) && !o.dataColors) return { brand: completeBrand(o), source: "brand.json" };
    return { brand: parsePowerBiTheme(o), source: "Power BI theme", raw: o };
  }
  const files = await unzip(buf);
  const key = Object.keys(files).filter((k) => /theme\/theme\d*\.xml$/i.test(k)).sort()[0];
  if (!key) throw new Error("No Office theme found inside this file.");
  return { brand: parseOfficeTheme(new TextDecoder().decode(files[key])), source: "Office theme (" + key + ")", files };
}

export function download(name, data, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
