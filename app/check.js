/*
 * check.js: the audit behind https://babarda.com/tools/theme-check
 * Author: Badr Abardazzou. MIT licence. Browser ES module, no dependency beyond themekit.js.
 *
 *   inspect(result)      what the file ACTUALLY holds (roles, slots, fonts), before any default fills a gap
 *   audit(brand, facts)  every check, a score out of 100, a grade and a one-line verdict
 *   fixBrand(brand, f)   a corrected brand plus the list of changes, ready for powerbiTheme() and thmx()
 */
import * as tk from "./themekit.js";

export const KINDS = ["normal", "protan", "deutan", "tritan", "achroma"];
export const KIND_LABEL = { normal: "Normal vision", protan: "Protanopia", deutan: "Deuteranopia", tritan: "Tritanopia", achroma: "Greyscale" };
export const KIND_NOTE = { normal: "", protan: "red-blind, about 1% of men", deutan: "green-blind, the most common, about 5% of men", tritan: "blue-blind, rare", achroma: "black and white print, e-ink, photocopies" };

/* Fonts a viewer can count on: shipped with Windows and Office, or built into the Power BI service. */
const SAFE_FONTS = [
  "Aptos", "Aptos Display", "Aptos Narrow", "Aptos Light", "Aptos SemiBold", "Arial", "Arial Black", "Arial Narrow", "Arial Nova", "Arial Unicode MS",
  "Bahnschrift", "Book Antiqua", "Bookman Old Style", "Calibri", "Calibri Light", "Cambria", "Cambria Math", "Candara", "Century Gothic", "Comic Sans MS",
  "Consolas", "Constantia", "Corbel", "Courier New", "DIN", "Franklin Gothic Book", "Franklin Gothic Medium", "Garamond", "Georgia", "Gill Sans MT",
  "Grandview", "Impact", "Lucida Console", "Lucida Sans Unicode", "Palatino Linotype", "Rockwell", "Segoe", "Segoe (Bold)", "Segoe UI", "Segoe UI Light",
  "Segoe UI Semilight", "Segoe UI Semibold", "Segoe UI Bold", "Segoe UI Black", "Seaford", "Symbol", "Tahoma", "Times New Roman", "Trebuchet MS",
  "Tw Cen MT", "Verdana", "Wingdings", "wf_standard-font", "wf_standard-font_light", "wf_segoe-ui_normal", "wf_segoe-ui_semibold", "wf_segoe-ui_light", "wf_segoe-ui_bold",
].map((f) => f.toLowerCase());
/* Web fonts people often put in themes; named so the finding can say where they come from. */
const GOOGLE_FONTS = ["roboto", "open sans", "montserrat", "lato", "poppins", "inter", "source sans pro", "source sans 3", "raleway", "nunito", "playfair display", "merriweather", "eb garamond", "oswald", "work sans", "ibm plex sans", "dm sans", "figtree", "manrope", "noto sans", "pt sans", "rubik", "barlow", "mulish", "source serif 4", "space grotesk"];

export const isSafeFont = (f) => !f || /^\+m[nj]-/.test(f) || SAFE_FONTS.includes(String(f).trim().toLowerCase());
const isGoogleFont = (f) => GOOGLE_FONTS.includes(String(f).trim().toLowerCase());

const r1 = (x) => (Math.floor(x * 10) / 10).toFixed(1);   // floor, so 4.46 never shows as a passing 4.5
const d0 = (x) => (isFinite(x) ? x.toFixed(0) : "n/a");
const lum = (h) => tk.luminance(h);
export const isDark = (bg) => lum(bg) < 0.18;

// ------------------------------------------------------------ what the file holds

function xmlSlot(xml, tag) {
  const m = xml.match(new RegExp("<(?:\\w+:)?" + tag + "\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">"));
  if (!m) return null;
  const s = m[1].match(/srgbClr\s+val="([0-9A-Fa-f]{6})"/), sys = m[1].match(/sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/);
  return tk.normHex(s ? s[1] : sys ? sys[1] : null) || "?";
}
function xmlFont(xml, tag) {
  const m = xml.match(new RegExp("<(?:\\w+:)?" + tag + "\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">"));
  if (!m) return null;
  const l = m[1].match(/<(?:\w+:)?latin\s+typeface="([^"]*)"/);
  return l ? l[1] : "";
}

/** Read the loaded result ({brand, source, raw?, files?}) and record what is really there. */
export function inspect(result) {
  const f = { kind: "brand", missing: [], present: [], fonts: [], textPairs: [], accents: null, source: result.source };
  if (result.raw) {
    const o = result.raw, tc = o.textClasses || {};
    f.kind = "powerbi";
    const need = [
      ["name", "name", typeof o.name === "string" && o.name.trim()],
      ["dataColors", "dataColors (the series colours)", Array.isArray(o.dataColors) && o.dataColors.some(tk.normHex)],
      ["background", "background", tk.normHex(o.background)],
      ["foreground", "foreground (main text)", tk.normHex(o.foreground)],
      ["tableAccent", "tableAccent", tk.normHex(o.tableAccent)],
      ["good", "good (positive KPI)", tk.normHex(o.good)],
      ["bad", "bad (negative KPI)", tk.normHex(o.bad)],
      ["neutral", "neutral (KPI in between)", tk.normHex(o.neutral)],
      ["textClasses.callout", "textClasses.callout (card numbers)", tc.callout],
      ["textClasses.title", "textClasses.title (visual titles)", tc.title],
      ["textClasses.header", "textClasses.header (table headers)", tc.header],
      ["textClasses.label", "textClasses.label (axis and data labels)", tc.label],
      ["visualStyles", "visualStyles (per-visual formatting)", o.visualStyles && typeof o.visualStyles === "object"],
    ];
    for (const [k, label, ok] of need) (ok ? f.present : f.missing).push({ key: k, label });
    f.has = Object.fromEntries(need.map(([k, , ok]) => [k, !!ok]));
    f.has.panel = !!tk.normHex(o.backgroundLight);
    f.has.hairline = !!tk.normHex(o.backgroundNeutral || o.foregroundNeutralTertiary);
    f.has.body = !!(tk.normHex(o.foregroundNeutralSecondary) || (tc.label && tk.normHex(tc.label.color)));
    for (const [cls, size] of [["callout", 28], ["title", 14], ["header", 12], ["label", 10]]) {
      const t = tc[cls];
      if (!t) continue;
      if (t.fontFace) f.fonts.push({ role: "textClasses." + cls, font: t.fontFace });
      const c = tk.normHex(t.color);
      const pt = Number(t.fontSize) || size;
      if (c) f.textPairs.push({ label: cls + " text (" + pt + " pt)", color: c, large: pt >= 18 || (pt >= 14 && /bold|semibold|black/i.test(t.fontFace || "")) });
    }
    f.dataCount = Array.isArray(o.dataColors) ? o.dataColors.filter(tk.normHex).length : 0;
  } else if (result.files) {
    const key = Object.keys(result.files).filter((k) => /theme\/theme\d*\.xml$/i.test(k)).sort()[0];
    const xml = new TextDecoder().decode(result.files[key]);
    f.kind = "office";
    f.themePart = key;
    const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
    f.slots = {};
    for (const s of slots) {
      const v = xmlSlot(xml, s);
      f.slots[s] = v;
      (v && v !== "?" ? f.present : f.missing).push({ key: s, label: "colour slot " + s });
    }
    const major = xmlFont(xml, "majorFont"), minor = xmlFont(xml, "minorFont");
    (major ? f.present : f.missing).push({ key: "majorFont", label: "heading font (majorFont)" });
    (minor ? f.present : f.missing).push({ key: "minorFont", label: "body font (minorFont)" });
    if (major) f.fonts.push({ role: "Headings", font: major });
    if (minor) f.fonts.push({ role: "Body", font: minor });
    f.accents = slots.slice(4, 10).map((s) => f.slots[s]).filter((v) => v && v !== "?");
    f.has = { panel: !!(f.slots.lt2 && f.slots.lt2 !== "?"), body: !!(f.slots.dk2 && f.slots.dk2 !== "?"), good: false, bad: false };
    f.dataCount = f.accents.length;
  } else {
    // brand.json from the Theme Builder: every role is explicit by construction
    const b = result.brand;
    f.has = { panel: true, body: true, good: true, bad: true, hairline: true };
    f.fonts = [{ role: "Headings", font: b.fontHeading }, { role: "Body", font: b.fontBody }];
    f.dataCount = b.colors.length;
  }
  return f;
}

/** Facts for a brand that has every role (used to re-score a fixed brand). */
export function fullFacts(brand, kind = "powerbi") {
  return { kind: "fixed", fixedFor: kind, missing: [], present: [], textPairs: [], has: { panel: true, body: true, good: true, bad: true }, fonts: [{ role: "Headings", font: brand.fontHeading }, { role: "Body", font: brand.fontBody }], dataCount: brand.colors.length };
}

// ------------------------------------------------------------ the checks

const WEIGHT = { text: 24, marks: 14, distinct: 14, cvd: 16, grey: 3, size: 5, complete: 10, fonts: 5, dupes: 5, sentiment: 4 };
const CVD_SCOPE = 8;   // most charts reach the first 8 series; judging 12 colours at once flags every palette

function minPair(colors, kind) {
  const cs = colors.map((c) => (kind === "normal" ? c : tk.simulate(c, kind)));
  let best = { d: Infinity, i: -1, j: -1 };
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    if (colors[i] === colors[j]) continue;   // exact duplicates have their own check
    const d = tk.deltaE(cs[i], cs[j]);
    if (d < best.d) best = { d, i, j };
  }
  return best;
}

/** Lighten or darken c until it reaches `target` contrast against every colour in `against`. */
export function pushContrast(c, against, target, dark) {
  const ok = (x) => against.every((a) => tk.contrast(x, a) >= target);
  if (ok(c)) return c;
  const dir = dark ? 1 : -1;
  for (let k = 0.04; k <= 1.0001; k += 0.04) { const x = tk.mix(c, dir * k); if (ok(x)) return x; }
  return dark ? "#FFFFFF" : "#000000";
}

export function audit(brand, facts) {
  const b = tk.completeBrand(brand);
  const dark = isDark(b.background);
  const checks = [];
  const add = (c) => checks.push(c);
  const colors = facts.kind === "office" && facts.accents ? facts.accents : b.colors;
  const scope = colors.slice(0, CVD_SCOPE);
  const scopeNote = colors.length > CVD_SCOPE ? " among the first " + CVD_SCOPE + " series" : "";
  const n = (i) => "colour " + (i + 1);

  // 1. text contrast
  {
    const pairs = [{ label: "Main text on background", fg: b.ink, bg: b.background, role: "ink", large: false }];
    if (facts.has.body) pairs.push({ label: "Secondary text on background", fg: b.body, bg: b.background, role: "body", large: false });
    if (facts.has.panel) {
      pairs.push({ label: "Main text on panel", fg: b.ink, bg: b.panel, role: "ink", large: false });
      if (facts.has.body) pairs.push({ label: "Secondary text on panel", fg: b.body, bg: b.panel, role: "body", large: false });
    }
    for (const t of facts.textPairs || []) pairs.push({ label: t.label + " on background", fg: t.color, bg: b.background, role: "text", large: t.large });
    for (const p of pairs) { p.ratio = tk.contrast(p.fg, p.bg); p.need = p.large ? 3 : 4.5; p.grade = tk.wcagGrade(p.ratio); }
    const bad = pairs.filter((p) => p.ratio < 3 || (p.large && p.ratio < 3));
    const weak = pairs.filter((p) => !p.large && p.ratio >= 3 && p.ratio < 4.5);
    const worst = pairs.reduce((a, p) => (p.ratio / p.need < a.ratio / a.need ? p : a), pairs[0]);
    const status = bad.length ? "fail" : weak.length ? "warn" : "pass";
    const fixes = [];
    for (const role of ["ink", "body"]) {
      const ps = pairs.filter((p) => p.role === role && p.ratio < 4.5);
      if (!ps.length) continue;
      const to = pushContrast(role === "ink" ? b.ink : b.body, [b.background, facts.has.panel ? b.panel : b.background], 4.6, dark);
      fixes.push((role === "ink" ? "main text " : "secondary text ") + (role === "ink" ? b.ink : b.body) + " to " + to + " (" + r1(tk.contrast(to, b.background)) + ":1)");
    }
    if (pairs.some((p) => p.role === "text" && p.ratio < p.need)) fixes.push("set every textClasses colour to the main or secondary text colour");
    add({
      id: "text", title: "Text contrast", status, weight: WEIGHT.text, pairs,
      finding: status === "pass" ? "All " + pairs.length + " text pairs reach WCAG AA; the weakest is " + worst.label.toLowerCase() + " at " + r1(worst.ratio) + ":1."
        : status === "warn" ? weak.map((p) => p.label + " (" + r1(p.ratio) + ":1)").join(", ") + ": readable only at large sizes; AA asks 4.5:1 for normal text."
        : bad.map((p) => p.label + " (" + r1(p.ratio) + ":1)").join(", ") + ": too faint for many readers, below even the 3:1 floor for large text." + (weak.length ? " Also short of 4.5:1: " + weak.map((p) => p.label.toLowerCase() + " (" + r1(p.ratio) + ":1)").join(", ") + "." : ""),
      fix: status === "pass" ? "Nothing to do." : "Change " + fixes.join("; ") + ".",
    });
  }

  // 2. data colours against the background
  {
    const rows = colors.map((c, i) => ({ i, c, ratio: tk.contrast(c, b.background) }));
    const low = rows.filter((r) => r.ratio < 3);
    const status = low.length === 0 ? "pass" : low.every((r) => r.ratio >= 2) && low.length === 1 ? "warn" : "fail";
    add({
      id: "marks", title: "Chart colours against the background", status, weight: WEIGHT.marks, rows,
      finding: !low.length ? "Every series reaches 3:1 against the background; the faintest is " + n(rows.reduce((a, r) => (r.ratio < a.ratio ? r : a)).i) + " at " + r1(Math.min(...rows.map((r) => r.ratio))) + ":1."
        : low.map((r) => n(r.i) + " (" + r.c + ", " + r1(r.ratio) + ":1)").join(", ") + (low.length === 1 ? " fades" : " fade") + " into the background: thin lines, small markers and legend keys drop out of sight.",
      fix: !low.length ? "Nothing to do." : "Use " + low.map((r) => n(r.i) + " " + pushContrast(r.c, [b.background], 3, dark)).join(", ") + " (" + (dark ? "lighter" : "darker") + " versions of the same hue, 3:1 or more).",
    });
  }

  // 3. series distinctness, normal vision
  const pairsBy = Object.fromEntries(KINDS.map((k) => [k, minPair(scope, k)]));
  {
    const p = pairsBy.normal;
    const status = !isFinite(p.d) ? "na" : p.d < 5 ? "fail" : p.d < 10 ? "warn" : "pass";
    add({
      id: "distinct", title: "Series look different from each other", status, weight: WEIGHT.distinct, pair: p,
      finding: status === "na" ? "Only one distinct colour, nothing to compare." : status === "pass" ? "The closest pair" + scopeNote + " is " + n(p.i) + " and " + n(p.j) + " at ΔE " + d0(p.d) + ": every series stands apart."
        : n(p.i) + " (" + scope[p.i] + ") and " + n(p.j) + " (" + scope[p.j] + ") differ by only ΔE " + d0(p.d) + (p.d < 5 ? ": readers see one colour." : ": close enough to confuse in a legend."),
      fix: status === "pass" || status === "na" ? "Nothing to do." : "Replace " + n(p.j) + " with a colour of another hue, or make it clearly lighter or darker than " + n(p.i) + " (aim for ΔE 10 or more).",
    });
  }

  // 4. colour-blind safety
  {
    const worstKind = ["protan", "deutan", "tritan"].reduce((a, k) => (pairsBy[k].d < pairsBy[a].d ? k : a), "deutan");
    const p = pairsBy[worstKind];
    const fails = ["protan", "deutan", "tritan"].filter((k) => pairsBy[k].d < 5), warns = ["protan", "deutan", "tritan"].filter((k) => pairsBy[k].d >= 5 && pairsBy[k].d < 10);
    const status = !isFinite(p.d) ? "na" : fails.length ? "fail" : warns.length ? "warn" : "pass";
    add({
      id: "cvd", title: "Colour-blind safety", status, weight: WEIGHT.cvd, pairsBy,
      finding: status === "na" ? "Only one distinct colour, nothing to compare." : status === "pass" ? "Under protanopia, deuteranopia and tritanopia the closest pair" + scopeNote + " stays at ΔE " + d0(p.d) + " or more."
        : KIND_LABEL[worstKind] + ": " + n(p.i) + " and " + n(p.j) + " fall to ΔE " + d0(p.d) + (p.d < 5 ? ", the same colour for that reader." : ", hard to tell apart.") + (fails.length + warns.length > 1 ? " Also weak under " + [...fails, ...warns].filter((k) => k !== worstKind).map((k) => KIND_LABEL[k].toLowerCase()).join(" and ") + "." : ""),
      fix: status === "pass" || status === "na" ? "Nothing to do." : "Separate " + n(p.i) + " and " + n(p.j) + " by lightness, not only by hue (one clearly darker), or swap one for a blue or orange, the two hues every deficiency keeps apart.",
    });
  }

  // 4b. greyscale print (advice, low weight, never a fail)
  {
    const p = pairsBy.achroma;
    const status = !isFinite(p.d) ? "na" : p.d < 5 ? "warn" : "pass";
    add({
      id: "grey", title: "Greyscale print", status, weight: WEIGHT.grey, pair: p,
      finding: status === "na" ? "Only one distinct colour." : status === "pass" ? "Printed in black and white, the closest pair" + scopeNote + " keeps ΔE " + d0(p.d) + "." : n(p.i) + " and " + n(p.j) + " print as the same grey (ΔE " + d0(p.d) + ").",
      fix: status === "pass" || status === "na" ? "Nothing to do." : "Only matters if the report is printed: give the two colours different lightness, or label the series directly on the chart.",
    });
  }

  // 5. palette size
  if (facts.kind === "office") {
    add({ id: "size", title: "Number of chart colours", status: colors.length === 6 ? "pass" : "fail", weight: WEIGHT.size,
      finding: colors.length === 6 ? "Six accents, the fixed number an Office theme holds; charts cycle through them, then tints of them." : "Only " + colors.length + " of the 6 accent slots hold a colour.",
      fix: colors.length === 6 ? "Nothing to do." : "Fill every accent slot; Fix it for me does it." });
  } else {
    const k = b.colors.length;
    const status = k < 6 || k > 12 ? "warn" : "pass";
    add({ id: "size", title: "Number of chart colours", status, weight: WEIGHT.size,
      finding: k < 6 ? "Only " + k + " data colours: the " + (k + 1) + "th series repeats colour 1, so two lines share a colour." : k > 12 ? k + " data colours: past 12 series nobody can match a legend to a line anyway." : k + " data colours, enough for the charts people actually read.",
      fix: k < 6 ? "Add colours up to 6 or 8. Fix it for me picks ones that stay distinct." : k > 12 ? "Keep the 8 to 10 most distinct colours and group small series into Other." : "Nothing to do." });
  }

  // 6. completeness
  if (facts.kind === "powerbi" || facts.kind === "office") {
    const miss = facts.missing;
    const critical = miss.filter((m) => ["dataColors", "background", "foreground", "dk1", "lt1", "accent1"].includes(m.key));
    const status = !miss.length ? "pass" : critical.length || miss.length > 5 ? "fail" : "warn";
    const total = miss.length + facts.present.length;
    add({ id: "complete", title: "Complete theme", status, weight: WEIGHT.complete, missing: miss,
      finding: !miss.length ? "All " + total + " expected " + (facts.kind === "office" ? "slots" : "keys") + " are set." : miss.length + " of " + total + " missing: " + miss.map((m) => m.label).join(", ") + ". " + (facts.kind === "powerbi" ? "Power BI falls back to its own defaults for these, so parts of the report ignore your brand." : "Office falls back to its own defaults for these."),
      fix: !miss.length ? "Nothing to do." : "Fix it for me fills each missing role from your own colours." });
  } else {
    add({ id: "complete", title: "Complete theme", status: "pass", weight: WEIGHT.complete, finding: facts.kind === "fixed" ? "Every role is set." : "A brand file lists every role explicitly.", fix: "Nothing to do." });
  }

  // 7. fonts
  {
    const fonts = (facts.fonts || []).filter((f) => f.font);
    const unsafe = fonts.filter((f) => !isSafeFont(f.font));
    const names = [...new Set(unsafe.map((f) => f.font))];
    const emptyOffice = facts.kind === "office" && facts.fonts.length < 2;
    const status = !fonts.length ? "na" : unsafe.length ? "warn" : "pass";
    add({ id: "fonts", title: "Fonts every viewer has", status, weight: WEIGHT.fonts, fonts,
      finding: !fonts.length ? (emptyOffice ? "The theme names no fonts." : "The theme names no fonts, so Power BI uses Segoe UI everywhere.") : !unsafe.length ? [...new Set(fonts.map((f) => f.font))].join(" and ") + ": installed with Windows and Office, so every viewer sees what you designed."
        : names.join(", ") + (names.some(isGoogleFont) ? " (a free web font)" : "") + " is not installed on a typical Windows PC: viewers without it see a substitute font, with different widths and wrapping.",
      fix: !unsafe.length ? "Nothing to do." : "Use a close system font, for example " + (names.some((x) => /garamond|serif|merriweather|playfair/i.test(x)) ? "Georgia or Cambria" : "Segoe UI or Aptos") + ", or install the font on every viewer's PC." });
  }

  // 8. duplicates
  {
    const seen = {}, dup = [];
    colors.forEach((c, i) => { if (c in seen) dup.push({ c, a: seen[c], i }); else seen[c] = i; });
    add({ id: "dupes", title: "No repeated colours", status: dup.length ? "fail" : "pass", weight: WEIGHT.dupes, dup,
      finding: dup.length ? dup.map((d) => n(d.a) + " and " + n(d.i) + " are both " + d.c).join("; ") + ": two series will look identical." : "Every " + (facts.kind === "office" ? "accent" : "data colour") + " is unique.",
      fix: dup.length ? "Replace " + dup.map((d) => n(d.i)).join(", ") + " with a new colour; Fix it for me picks one that stays distinct." : "Nothing to do." });
  }

  // 9. good and bad
  if (facts.has.good && facts.has.bad) {
    const dN = tk.deltaE(b.good, b.bad), dD = tk.deltaE(tk.simulate(b.good, "deutan"), tk.simulate(b.bad, "deutan")), dP = tk.deltaE(tk.simulate(b.good, "protan"), tk.simulate(b.bad, "protan"));
    const w = Math.min(dD, dP);
    const status = w < 10 ? "fail" : w < 20 ? "warn" : "pass";
    add({ id: "sentiment", title: "Good and bad stay apart", status, weight: WEIGHT.sentiment, dN, dD, dP,
      finding: status === "pass" ? "Good " + b.good + " and bad " + b.bad + " keep ΔE " + d0(w) + " under red-green colour blindness." : "Good " + b.good + " and bad " + b.bad + " drop to ΔE " + d0(w) + " for a red-green colour-blind reader (" + d0(dN) + " in normal vision): the classic red and green trap on KPI cards.",
      fix: status === "pass" ? "Nothing to do." : "Make one clearly darker than the other, or use blue for good and orange-red for bad; also add an arrow or a sign next to the number." });
  } else {
    add({ id: "sentiment", title: "Good and bad stay apart", status: "na", weight: WEIGHT.sentiment,
      finding: facts.kind === "office" ? "Office themes have no good and bad colours; nothing to check." : "The theme sets no good and bad colours, so KPI visuals use Power BI's own green and red.",
      fix: facts.kind === "office" ? "Nothing to do." : "Set good and bad; Fix it for me picks a pair that survives colour blindness." });
  }

  // 10. dark theme (information, not scored)
  {
    const L = lum(b.background);
    add({ id: "dark", title: dark ? "Dark theme" : "Light theme", status: "info", weight: 0,
      finding: dark ? "Background " + b.background + " is dark (luminance " + L.toFixed(2) + "): text must be light, and saturated colours need a lighter tint to reach 3:1." : "Background " + b.background + " is light (luminance " + L.toFixed(2) + "): dark text, and chart colours of medium to dark tone.",
      fix: dark ? "Test the report on a projector too: dark themes lose contrast in a lit room." : "Nothing to do." });
  }

  // score
  let got = 0, max = 0;
  for (const c of checks) {
    if (!c.weight || c.status === "na" || c.status === "info") continue;
    max += c.weight;
    got += c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0);
  }
  const score = max ? Math.round((100 * got) / max) : 0;
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F";
  const fails = checks.filter((c) => c.status === "fail"), warns = checks.filter((c) => c.status === "warn");
  const verdict = !fails.length && !warns.length ? "Ready to use: readable, accessible and colour-blind safe."
    : !fails.length ? "Good to use, with " + warns.length + " thing" + (warns.length > 1 ? "s" : "") + " worth tightening."
    : fails.length === 1 ? "One problem to fix before you ship it: " + fails[0].title.toLowerCase() + "."
    : fails.length + " problems to fix before you ship it, starting with " + fails[0].title.toLowerCase() + ".";
  return { checks, score, grade, verdict, dark, brand: b, colors, pairsBy };
}

// ------------------------------------------------------------ fix it for me

/* Colours that survive all three deficiencies well (Okabe and Ito 2008, Paul Tol), used when a series needs a new hue. */
const POOL = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#D55E00", "#56B4E9", "#882255", "#117733", "#332288", "#AA4499", "#44AA99", "#999933", "#DDCC77", "#6699CC", "#1F4E79", "#8C564B"];

function worstDelta(c, others) {
  let w = Infinity;
  for (const k of ["normal", "protan", "deutan", "tritan"]) {
    const sc = k === "normal" ? c : tk.simulate(c, k);
    for (const o of others) w = Math.min(w, tk.deltaE(sc, k === "normal" ? o : tk.simulate(o, k)));
  }
  return w;
}

export function fixBrand(brand, facts) {
  const b = tk.completeBrand(brand);
  const dark = isDark(b.background);
  const changes = [];
  const out = { ...b, colors: (facts.kind === "office" && facts.accents && facts.accents.length ? facts.accents : b.colors).slice() };
  const lbl = (role) => (role === "ink" ? "Main text " : "Secondary text ");

  // surfaces the file did not set: derive them from its own background, so a dark theme gets a dark panel
  if (!facts.has.panel) { out.panel = tk.mix(out.background, dark ? 0.08 : -0.035); changes.push("Panel colour set to " + out.panel + ", a step off the background"); }
  if (!facts.has.hairline) out.hairline = tk.mix(out.background, dark ? 0.25 : -0.16);
  out.gridline = tk.mix(out.background, dark ? 0.12 : -0.07);
  if (!facts.has.body) out.body = tk.mix(out.ink, dark ? -0.25 : 0.25);

  // text: main text aims for AAA (7:1), secondary for AA (4.5:1), on background and panel
  for (const role of ["ink", "body"]) {
    const worst = Math.min(tk.contrast(out[role], out.background), tk.contrast(out[role], out.panel));
    if (worst >= 4.5) continue;
    const to = pushContrast(out[role], [out.background, out.panel], role === "ink" ? 7 : 4.6, dark);
    changes.push(lbl(role) + out[role] + " → " + to + " (" + r1(worst) + ":1 → " + r1(Math.min(tk.contrast(to, out.background), tk.contrast(to, out.panel))) + ":1)");
    out[role] = to;
  }

  // duplicates out first
  const seen = new Set();
  out.colors = out.colors.filter((c) => { if (seen.has(c)) { changes.push("Removed the repeated " + c); return false; } seen.add(c); return true; });
  const orig = out.colors.slice(), why = orig.map(() => []);

  // marks to 3:1
  out.colors = out.colors.map((c, i) => {
    if (tk.contrast(c, out.background) >= 3) return c;
    why[i].push("3:1 on the background");
    return pushContrast(c, [out.background], 3.05, dark);
  });

  // pull colliding colours apart: keep the brand hue when a lighter or darker version is enough, else take a safe hue
  for (let guard = 0; guard < 12; guard++) {
    const cs = out.colors.slice(0, CVD_SCOPE);
    let worst = { d: Infinity, j: -1 };
    for (let j = 1; j < cs.length; j++) { const d = worstDelta(cs[j], cs.slice(0, j)); if (d < worst.d) worst = { d, j }; }
    if (worst.d >= 10 || worst.j < 0) break;
    const j = worst.j, old = cs[j], others = cs.filter((_, k) => k !== j);
    const ok = (c) => tk.contrast(c, out.background) >= 3;
    let pick = [-0.4, -0.25, -0.12, 0.12, 0.25, 0.4].map((t) => tk.mix(old, t)).filter(ok).map((c) => ({ c, d: worstDelta(c, others) })).sort((a, z) => z.d - a.d)[0];
    if (!pick || pick.d < 12) {
      const alt = POOL.map((c) => pushContrast(c, [out.background], 3.05, dark)).filter((c) => !out.colors.includes(c)).map((c) => ({ c, d: worstDelta(c, others) })).sort((a, z) => z.d - a.d)[0];
      if (alt && (!pick || alt.d > pick.d)) pick = alt;
    }
    if (!pick || pick.d <= worst.d) break;
    out.colors[j] = pick.c;
    why[j].push("colour-blind ΔE " + d0(worst.d) + " → " + d0(pick.d));
  }
  orig.forEach((c, i) => { if (out.colors[i] !== c) changes.push("Colour " + (i + 1) + " " + c + " → " + out.colors[i] + " (" + why[i].join("; ") + ")"); });

  // too few colours
  while (out.colors.length < 6) {
    const alt = POOL.map((c) => pushContrast(c, [out.background], 3.05, dark)).filter((c) => !out.colors.includes(c)).map((c) => ({ c, d: worstDelta(c, out.colors) })).sort((a, z) => z.d - a.d)[0];
    if (!alt) break;
    out.colors.push(alt.c);
    changes.push((facts.kind === "office" ? "Filled accent " : "Added colour ") + out.colors.length + " " + alt.c + (facts.kind === "office" ? "" : " so a 6-series chart never repeats"));
  }

  // good and bad
  if (facts.kind !== "office") {
    const sep = (g, r) => Math.min(tk.deltaE(tk.simulate(g, "deutan"), tk.simulate(r, "deutan")), tk.deltaE(tk.simulate(g, "protan"), tk.simulate(r, "protan")));
    if (!facts.has.good || !facts.has.bad || sep(out.good, out.bad) < 20) {
      const cands = [];
      for (const tg of [0, 0.25, -0.3, -0.5]) for (const tb of [0, -0.3, 0.25]) cands.push([tk.mix(out.good, tg), tk.mix(out.bad, tb)]);
      cands.push(["#0072B2", "#D55E00"], ["#1A7F5A", "#D55E00"], ["#2166AC", "#B2182B"]);
      const best = cands.map(([g, r]) => [pushContrast(g, [out.background], 3, dark), pushContrast(r, [out.background], 3, dark)]).map(([g, r]) => ({ g, r, d: sep(g, r) })).find((x) => x.d >= 20) || { g: "#0072B2", r: "#D55E00" };
      const parts = [];
      if (best.g !== out.good) parts.push("good " + out.good + " → " + best.g);
      if (best.r !== out.bad) parts.push("bad " + out.bad + " → " + best.r);
      if (parts.length) changes.push(parts.join(", ").replace(/^g/, "G").replace(/^b/, "B") + " (apart under red-green colour blindness)");
      out.good = best.g; out.bad = best.r;
    }
  }

  // fonts
  for (const [k, safe] of [["fontHeading", "Segoe UI Semibold"], ["fontBody", "Segoe UI"]]) {
    if (!out[k]) out[k] = safe;
    else if (!isSafeFont(out[k])) { changes.push((k === "fontHeading" ? "Heading font " : "Body font ") + out[k] + " → " + safe); out[k] = safe; }
  }

  // missing roles
  if (facts.missing && facts.missing.length) changes.push("Filled " + facts.missing.length + " missing role" + (facts.missing.length > 1 ? "s" : "") + ": " + facts.missing.map((m) => m.key).join(", "));
  if (!changes.length) changes.push("Nothing needed fixing; the files below are your theme, complete.");
  return { brand: tk.completeBrand(out), changes };
}
