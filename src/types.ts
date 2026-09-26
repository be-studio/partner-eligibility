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
  row: number; // 1-indexed data row, excluding the header
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
