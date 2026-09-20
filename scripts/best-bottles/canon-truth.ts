/**
 * Front-view width and assembled height from the canonical truth sheet.
 *
 * CLAUDE.md: consume only the `canon_*` columns, never raw `diameter` for flat
 * families. A flat flask's catalog "diameter" is not its pictured width —
 * Elegant 60 ml reports 42.6 and 39 mm for glass that is 54 mm across — so any
 * proportion expectation built on `heightWithCap / diameter` is wrong for it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type CanonTruth = { widthAxisMm: number | null; heightWithCapMm: number | null };

const CSV_PATH = resolve("docs/best-bottles-canonical-truth/best-bottles-master-truth.csv");

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

let cache: Map<string, CanonTruth> | null = null;

export function lookupCanonTruth(graceSku: string | null | undefined): CanonTruth | null {
  if (!graceSku) return null;
  if (!cache) {
    cache = new Map();
    if (existsSync(CSV_PATH)) {
      const [header, ...rows] = parseCsv(readFileSync(CSV_PATH, "utf8"));
      const at = (name: string) => header!.findIndex((column) => column.trim().toLowerCase() === name.toLowerCase());
      const sku = Math.max(at("graceSku"), at("grace_sku"));
      const width = at("canon_widthAxisMm"), tall = at("canon_heightWithCapMm");
      const positive = (value: string | undefined) => {
        const parsed = Number.parseFloat(value ?? "");
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };
      if (sku >= 0) for (const row of rows) {
        const key = row[sku]?.trim();
        if (key) cache.set(key, { widthAxisMm: positive(row[width]), heightWithCapMm: positive(row[tall]) });
      }
    }
  }
  return cache.get(graceSku.trim()) ?? null;
}
