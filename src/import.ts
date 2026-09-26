import { readFile } from "node:fs/promises";
import { parse, type Info } from "csv-parse/sync";
import type { MemberStore, UpsertResult } from "./store.js";
import { validateRow, type RawRow } from "./validate.js";
import type { ImportReport, Member, RejectedRow } from "./types.js";

export async function importCsv(
  filePath: string,
  store: MemberStore
): Promise<ImportReport> {
  const content = await readFile(filePath, "utf-8");

  // Rows are parsed as plain lists of values and matched to the header here,
  // rather than with csv-parse's `columns` option, because that option quietly
  // drops any values beyond the header. Keeping them lets a row with too many
  // values be rejected (usually a stray comma, which shifts every value after
  // it into the wrong column).
  //
  // relax_column_count: without it, a single ragged row (wrong column count -
  // a realistic partner-file error) throws and aborts parsing the entire
  // file. With it, a short row just comes through with missing keys, which
  // validateRow already reports as "field is required".
  //
  // info: attaches each row's line number in the file, so rejections point at
  // the line the partner sees in their editor (blank lines included).
  // csv-parse's types only describe `info` alongside `columns`, hence the cast.
  const [headerRow, ...rows] = parse(content, {
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    info: true
  }) as unknown as { record: string[]; info: Info }[];
  const header = headerRow?.record ?? [];

  const rejected: RejectedRow[] = [];
  const validMembers: Member[] = [];

  for (const { record: values, info } of rows) {
    const row: RawRow = Object.fromEntries(
      header.map((name, i) => [name, values[i]])
    );
    const result = validateRow(row);
    const reasons = result.valid ? [] : [...result.reasons];
    if (values.length > header.length) {
      reasons.push(
        `row has ${values.length} values but the header has ${header.length}`
      );
    }
    if (!result.valid || reasons.length > 0) {
      rejected.push({
        line: info.lines,
        partnerMemberId: row.partner_member_id || undefined,
        reasons
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
