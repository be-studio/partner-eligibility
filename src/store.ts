import { promises as fs } from "node:fs";
import path from "node:path";
import type { Member } from "./types.js";

export type UpsertResult = "created" | "updated" | "unchanged";

export interface MemberStore {
  upsert(member: Member): Promise<UpsertResult>;
  findById(partnerMemberId: string): Promise<Member | undefined>;
  all(): Promise<Member[]>;
}

function isSameMember(a: Member, b: Member): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.dateOfBirth === b.dateOfBirth &&
    a.email === b.email &&
    a.policyStart === b.policyStart &&
    a.policyEnd === b.policyEnd
  );
}

export class InMemoryMemberStore implements MemberStore {
  private members = new Map<string, Member>();

  async upsert(member: Member): Promise<UpsertResult> {
    const existing = this.members.get(member.partnerMemberId);
    this.members.set(member.partnerMemberId, member);
    if (!existing) return "created";
    return isSameMember(existing, member) ? "unchanged" : "updated";
  }

  async findById(partnerMemberId: string): Promise<Member | undefined> {
    return this.members.get(partnerMemberId);
  }

  async all(): Promise<Member[]> {
    return [...this.members.values()];
  }
}

// Persists to a JSON file so imports survive across process runs. Loads
// lazily and re-persists the whole file on every write; fine at this scale,
// and swapping in a different backing store only means writing a new class
// against the MemberStore interface above.
export class JsonFileMemberStore implements MemberStore {
  private members = new Map<string, Member>();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const records: Member[] = JSON.parse(raw);
      for (const record of records)
        this.members.set(record.partnerMemberId, record);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const records = [...this.members.values()];
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2));
  }

  async upsert(member: Member): Promise<UpsertResult> {
    await this.load();
    const existing = this.members.get(member.partnerMemberId);
    this.members.set(member.partnerMemberId, member);
    await this.persist();
    if (!existing) return "created";
    return isSameMember(existing, member) ? "unchanged" : "updated";
  }

  async findById(partnerMemberId: string): Promise<Member | undefined> {
    await this.load();
    return this.members.get(partnerMemberId);
  }

  async all(): Promise<Member[]> {
    await this.load();
    return [...this.members.values()];
  }
}
