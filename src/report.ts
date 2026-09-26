import type { ImportReport } from "./types.js";

export function formatReport(report: ImportReport): string {
  const lines = [
    `Total rows read: ${report.totalRows}`,
    `Created:         ${report.created}`,
    `Updated:         ${report.updated}`,
    `Unchanged:       ${report.unchanged}`,
    `Rejected:        ${report.rejected.length}`
  ];

  if (report.rejected.length > 0) {
    lines.push("", "Rejected rows:");
    for (const r of report.rejected) {
      const id = r.partnerMemberId ?? "<missing>";
      lines.push(
        `  Line ${r.line} (partner_member_id=${id}): ${r.reasons.join("; ")}`
      );
    }
  }

  return lines.join("\n");
}
