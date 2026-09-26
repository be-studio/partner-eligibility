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

// Persists to a JSON file so imports survive across process runs. Re-persists
// the whole file on every write; fine at this scale, and swapping in a
// different backing store only means writing a new class against the
// MemberStore interface above.
//
// The file is re-read whenever its modified time changes, so a long-running
// process (the lookup server) sees imports made by a separate CLI run without
// needing a restart.
export class JsonFileMemberStore implements MemberStore {
  private members = new Map<string, Member>();
  private loaded = false;
  // undefined means the file didn't exist when last read.
  private loadedMtimeMs: number | undefined;

  constructor(private readonly filePath: string) {}

  private async fileMtimeMs(): Promise<number | undefined> {
    try {
      return (await fs.stat(this.filePath)).mtimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async load(): Promise<void> {
    const mtimeMs = await this.fileMtimeMs();
    if (this.loaded && mtimeMs === this.loadedMtimeMs) return;

    const members = new Map<string, Member>();
    if (mtimeMs !== undefined) {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const records: Member[] = JSON.parse(raw);
      for (const record of records) members.set(record.partnerMemberId, record);
    }
    this.members = members;
    this.loadedMtimeMs = mtimeMs;
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const records = [...this.members.values()];
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2));
    // Record our own write so the next load() doesn't needlessly re-read it.
    this.loadedMtimeMs = await this.fileMtimeMs();
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
