import { promises as fs } from "node:fs";
import path from "node:path";
import type { Member } from "./types.js";

export type UpsertResult = "created" | "updated" | "unchanged";

export interface MemberStore {
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

// Written as an object so TypeScript fails to compile if Member gains a field
// that isn't listed here.
const MEMBER_FIELDS = Object.keys({
  partnerMemberId: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  email: true,
  policyStart: true,
  policyEnd: true
} satisfies Record<keyof Member, true>);

function isMember(value: unknown): value is Member {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return MEMBER_FIELDS.every((field) => typeof record[field] === "string");
}

// The data file can be edited by hand, so check its shape when loading it.
// A bad file then fails straight away with an error naming the file, instead
// of causing a confusing error somewhere else later.
function parseMembersFile(raw: string, filePath: string): Member[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON`, { cause: error });
  }
  if (!Array.isArray(data)) {
    throw new Error(`${filePath} should contain a list of members`);
  }
  const badIndex = data.findIndex((record) => !isMember(record));
  if (badIndex !== -1) {
    throw new Error(
      `${filePath}: entry ${badIndex + 1} is not a valid member (every field must be a string)`
    );
  }
  return data;
}

// Keeps members in a JSON file so imports survive between runs. Each save
// rewrites the whole file (once per import).
//
// The file is re-read whenever its modified time changes, so the running
// lookup server picks up imports made by the CLI without a restart.
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
      for (const record of parseMembersFile(raw, this.filePath)) {
        members.set(record.partnerMemberId, record);
      }
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

  async upsertMany(members: Member[]): Promise<UpsertResult[]> {
    await this.load();
    const next = new Map(this.members);
    // Compare against `next`, not the saved state, so if an id appears twice in
    // one batch, the second is compared with the first.
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
