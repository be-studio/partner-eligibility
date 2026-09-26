import { describe, expect, it } from "vitest";
import { formatReport } from "../src/report.js";

describe("formatReport", () => {
  it("prints just the totals when nothing was rejected", () => {
    const text = formatReport({
      totalRows: 3,
      created: 1,
      updated: 1,
      unchanged: 1,
      rejected: []
    });

    expect(text).toBe(
      [
        "Total rows read: 3",
        "Created:         1",
        "Updated:         1",
        "Unchanged:       1",
        "Rejected:        0"
      ].join("\n")
    );
  });

  it("lists each rejected row, showing <missing> when it has no id", () => {
    const text = formatReport({
      totalRows: 2,
      created: 0,
      updated: 0,
      unchanged: 0,
      rejected: [
        {
          line: 2,
          partnerMemberId: "PM-2",
          reasons: ["email is required", "policy_end is required"]
        },
        {
          line: 3,
          partnerMemberId: undefined,
          reasons: ["partner_member_id is required"]
        }
      ]
    });

    expect(text.split("\n").slice(4)).toEqual([
      "Rejected:        2",
      "",
      "Rejected rows:",
      "  Line 2 (partner_member_id=PM-2): email is required; policy_end is required",
      "  Line 3 (partner_member_id=<missing>): partner_member_id is required"
    ]);
  });
});
