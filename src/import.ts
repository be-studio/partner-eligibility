import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import type { MemberStore } from "./store.js";
import { validateRow, type RawRow } from "./validate.js";
import type { ImportReport, RejectedRow } from "./types.js";

export async function importCsv(
  filePath: string,
  store: MemberStore
): Promise<ImportReport> {
  const content = readFileSync(filePath, "utf-8");

  // relax_column_count: without it, a single ragged row (wrong column count -
  // a realistic partner-file error) throws and aborts parsing the entire
  // file. With it, a short row just comes through with missing keys, which
  // validateRow already reports as "field is required".
  const rows: RawRow[] = parse(content, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true
  });

  const rejected: RejectedRow[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [index, row] of rows.entries()) {
    const result = validateRow(row);
    if (!result.valid) {
      rejected.push({
        row: index + 1,
        partnerMemberId: row.partner_member_id,
        reasons: result.reasons
      });
      continue;
    }

    const outcome = await store.upsert(result.member);
    if (outcome === "created") created++;
    else if (outcome === "updated") updated++;
    else unchanged++;
  }

  return {
    totalRows: rows.length,
    created,
    updated,
    unchanged,
    rejected
  };
}
