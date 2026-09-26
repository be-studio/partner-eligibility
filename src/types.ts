export interface Member {
  partnerMemberId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  email: string;
  policyStart: string; // YYYY-MM-DD
  policyEnd: string; // YYYY-MM-DD
}

export interface RejectedRow {
  line: number; // line in the CSV file; the header is line 1
  partnerMemberId: string | undefined;
  reasons: string[];
}

export interface ImportReport {
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  rejected: RejectedRow[];
}
