import { describe, expect, it } from "vitest";
import { validateRow, type RawRow } from "../src/validate.js";

const validRow: RawRow = {
  partner_member_id: "PM-1",
  first_name: "Alice",
  last_name: "Nguyen",
  date_of_birth: "1990-04-12",
  email: "alice@example.com",
  policy_start: "2024-01-01",
  policy_end: "2024-12-31"
};

describe("validateRow", () => {
  it("accepts a fully valid row", () => {
    const result = validateRow(validRow);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.member).toEqual({
        partnerMemberId: "PM-1",
        firstName: "Alice",
        lastName: "Nguyen",
        dateOfBirth: "1990-04-12",
        email: "alice@example.com",
        policyStart: "2024-01-01",
        policyEnd: "2024-12-31"
      });
    }
  });

  it("rejects a missing partner_member_id", () => {
    const result = validateRow({ ...validRow, partner_member_id: "" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toContain("partner_member_id is required");
    }
  });

  it("rejects a malformed email", () => {
    const result = validateRow({ ...validRow, email: "not-an-email" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toContain("email is not a valid email address");
    }
  });

  it("rejects a date_of_birth that isn't a real calendar date", () => {
    const result = validateRow({ ...validRow, date_of_birth: "2024-02-30" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toContain(
        "date_of_birth must be a valid YYYY-MM-DD date"
      );
    }
  });

  it("rejects a date_of_birth in the wrong format", () => {
    const result = validateRow({ ...validRow, date_of_birth: "12/04/1990" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toContain(
        "date_of_birth must be a valid YYYY-MM-DD date"
      );
    }
  });

  it("rejects policy_end before policy_start", () => {
    const result = validateRow({
      ...validRow,
      policy_start: "2024-06-01",
      policy_end: "2024-01-01"
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toContain(
        "policy_end must not be before policy_start"
      );
    }
  });

  it("accepts policy_end equal to policy_start", () => {
    const result = validateRow({
      ...validRow,
      policy_start: "2024-06-01",
      policy_end: "2024-06-01"
    });
    expect(result.valid).toBe(true);
  });

  it("collects every failing reason at once, not just the first", () => {
    const result = validateRow({
      partner_member_id: "",
      first_name: "",
      last_name: "Kim",
      date_of_birth: "not-a-date",
      email: "bad-email",
      policy_start: "2024-01-01",
      policy_end: "2024-12-31"
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toEqual([
        "partner_member_id is required",
        "first_name is required",
        "date_of_birth must be a valid YYYY-MM-DD date",
        "email is not a valid email address"
      ]);
    }
  });

  it("treats missing keys (e.g. from a ragged CSV row) the same as empty fields", () => {
    const result = validateRow({
      partner_member_id: "PM-2",
      first_name: "Ivy"
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasons).toContain("last_name is required");
      expect(result.reasons).toContain("email is required");
    }
  });
});
