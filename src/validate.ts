import type { Member } from "./types.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Round-trips the value through Date and compares the ISO output back to the
// input, so calendar rollovers (2024-02-30, 2024-13-01, 2023-02-29) are
// rejected rather than silently normalised.
function isValidCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

export interface RawRow {
  partner_member_id?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  email?: string;
  policy_start?: string;
  policy_end?: string;
}

export type ValidationResult =
  { valid: true; member: Member } | { valid: false; reasons: string[] };

export function validateRow(row: RawRow): ValidationResult {
  const reasons: string[] = [];

  const partnerMemberId = row.partner_member_id?.trim();
  if (!partnerMemberId) reasons.push("partner_member_id is required");

  const firstName = row.first_name?.trim();
  if (!firstName) reasons.push("first_name is required");

  const lastName = row.last_name?.trim();
  if (!lastName) reasons.push("last_name is required");

  const dateOfBirth = row.date_of_birth?.trim();
  if (!dateOfBirth) reasons.push("date_of_birth is required");
  else if (!isValidCalendarDate(dateOfBirth)) {
    reasons.push("date_of_birth must be a valid YYYY-MM-DD date");
  }

  const email = row.email?.trim();
  if (!email) reasons.push("email is required");
  else if (!EMAIL_RE.test(email))
    reasons.push("email is not a valid email address");

  const policyStart = row.policy_start?.trim();
  if (!policyStart) reasons.push("policy_start is required");
  else if (!isValidCalendarDate(policyStart)) {
    reasons.push("policy_start must be a valid YYYY-MM-DD date");
  }

  const policyEnd = row.policy_end?.trim();
  if (!policyEnd) reasons.push("policy_end is required");
  else if (!isValidCalendarDate(policyEnd)) {
    reasons.push("policy_end must be a valid YYYY-MM-DD date");
  }

  if (
    policyStart &&
    policyEnd &&
    isValidCalendarDate(policyStart) &&
    isValidCalendarDate(policyEnd) &&
    policyEnd < policyStart
  ) {
    reasons.push("policy_end must not be before policy_start");
  }

  if (reasons.length > 0) {
    return { valid: false, reasons };
  }

  return {
    valid: true,
    member: {
      partnerMemberId: partnerMemberId!,
      firstName: firstName!,
      lastName: lastName!,
      dateOfBirth: dateOfBirth!,
      email: email!,
      policyStart: policyStart!,
      policyEnd: policyEnd!
    }
  };
}
