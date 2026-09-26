import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { MemberStore, UpsertResult } from "./store.js";
import { validateRow, type RawRow } from "./validate.js";
import type { ImportReport, Member, RejectedRow } from "./types.js";

export async function importCsv(
  filePath: string,
  store: MemberStore
): Promise<ImportReport> {
  const content = await readFile(filePath, "utf-8");

  // Rows are matched to the header by hand, not with csv-parse's `columns`
  // option, because `columns` silently drops values beyond the header. We
  // need them to reject rows with too many values (usually a stray comma,
  // which shifts every later value into the wrong column).
  //
  // - relax_column_count: otherwise one row with the wrong number of values
  //   stops the whole file from parsing. A short row's missing values are
  //   reported by validateRow as "... is required".
  // - on_record: collects each row with its line number in the file (blank
  //   lines included), so rejections match what the partner sees in their
  //   editor. Used instead of the `info` option, which csv-parse's types
  //   don't cover without `columns`, so it would need a cast.
  const parsedRows: { values: string[]; line: number }[] = [];
  parse(content, {
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    on_record: (values, { lines }) => {
      parsedRows.push({ values, line: lines });
      return values;
    }
  });
  const [headerRow, ...rows] = parsedRows;
  const header = headerRow?.values ?? [];

  const rejected: RejectedRow[] = [];
  const validMembers: Member[] = [];

  for (const { values, line } of rows) {
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
        line,
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
