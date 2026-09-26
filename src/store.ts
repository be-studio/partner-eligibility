import { promises as fs } from "node:fs";
import path from "node:path";
import type { Member } from "./types.js";

export type UpsertResult = "created" | "updated" | "unchanged";

export interface MemberStore {
  upsert(member: Member): Promise<UpsertResult>;
  // Applies every member in order and saves once, all-or-nothing. Returns one
  // result per member, in the same order.
  upsertMany(members: Member[]): Promise<UpsertResult[]>;
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

// Persists to a JSON file so imports survive across process runs. Rewrites
// the whole file on each save (once per import); fine at this scale, and
// swapping in a different backing store only means writing a new class
// against the MemberStore interface above.
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

  // Writes to a temp file then renames it over the real one: a rename is
  // all-or-nothing, so a crash mid-write can't leave a truncated members.json.
  private async persist(members: Map<string, Member>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const records = [...members.values()];
    try {
      await fs.writeFile(tempPath, JSON.stringify(records, null, 2));
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
    // Record our own write so the next load() doesn't needlessly re-read it.
    this.loadedMtimeMs = await this.fileMtimeMs();
  }

  async upsert(member: Member): Promise<UpsertResult> {
    const [result] = await this.upsertMany([member]);
    return result;
  }

  async upsertMany(members: Member[]): Promise<UpsertResult[]> {
    await this.load();
    const next = new Map(this.members);
    // Compared against `next`, not the saved state, so a repeated id later in
    // the same batch is judged against the earlier occurrence.
    const results = members.map((member): UpsertResult => {
      const existing = next.get(member.partnerMemberId);
      next.set(member.partnerMemberId, member);
      if (!existing) return "created";
      return isSameMember(existing, member) ? "unchanged" : "updated";
    });

    if (results.some((result) => result !== "unchanged")) {
      // Only adopt the new state once it's safely on disk, so a failed save
      // can't leave memory and the file disagreeing.
      await this.persist(next);
      this.members = next;
    }
    return results;
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
