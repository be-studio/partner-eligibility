import { readFileSync } from "node:fs";
import { parse, type Info } from "csv-parse/sync";
import type { MemberStore, UpsertResult } from "./store.js";
import { validateRow, type RawRow } from "./validate.js";
import type { ImportReport, Member, RejectedRow } from "./types.js";

export async function importCsv(
  filePath: string,
  store: MemberStore
): Promise<ImportReport> {
  const content = readFileSync(filePath, "utf-8");

  // relax_column_count: without it, a single ragged row (wrong column count -
  // a realistic partner-file error) throws and aborts parsing the entire
  // file. With it, a short row just comes through with missing keys, which
  // validateRow already reports as "field is required".
  //
  // info: attaches each row's line number in the file, so rejections point at
  // the line the partner sees in their editor (blank lines included).
  const rows = parse<{ record: RawRow; info: Info }>(content, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    info: true
  });

  const rejected: RejectedRow[] = [];
  const validMembers: Member[] = [];

  for (const { record: row, info } of rows) {
    const result = validateRow(row);
    if (!result.valid) {
      rejected.push({
        line: info.lines,
        partnerMemberId: row.partner_member_id || undefined,
        reasons: result.reasons
      });
      continue;
    }
    validMembers.push(result.member);
  }

  const outcomes = await store.upsertMany(validMembers);
  const count = (outcome: UpsertResult) =>
    outcomes.filter((o) => o === outcome).length;

  return {
    totalRows: rows.length,
    created: count("created"),
    updated: count("updated"),
    unchanged: count("unchanged"),
    rejected
  };
}
