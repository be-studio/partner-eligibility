import {
  mkdtempSync,
  promises as fsPromises,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFileMemberStore } from "../src/store.js";
import type { Member } from "../src/types.js";

const member: Member = {
  partnerMemberId: "PM-1",
  firstName: "Alice",
  lastName: "Nguyen",
  dateOfBirth: "1990-04-12",
  email: "alice@example.com",
  policyStart: "2024-01-01",
  policyEnd: "2024-12-31"
};

describe("JsonFileMemberStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "peu-store-"));
    filePath = path.join(dir, "members.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists across separate store instances, simulating separate process runs", async () => {
    const storeA = new JsonFileMemberStore(filePath);
    await expect(storeA.upsertMany([member])).resolves.toEqual(["created"]);

    const storeB = new JsonFileMemberStore(filePath);
    await expect(storeB.findById("PM-1")).resolves.toEqual(member);

    // Re-importing the same record through the new instance must not duplicate it.
    await expect(storeB.upsertMany([member])).resolves.toEqual(["unchanged"]);
    await expect(storeB.all()).resolves.toHaveLength(1);
  });

  it("persists an update made by one instance so a later instance sees it", async () => {
    const storeA = new JsonFileMemberStore(filePath);
    await storeA.upsertMany([member]);

    const changed = { ...member, policyEnd: "2025-06-30" };
    const storeB = new JsonFileMemberStore(filePath);
    await expect(storeB.upsertMany([changed])).resolves.toEqual(["updated"]);

    const storeC = new JsonFileMemberStore(filePath);
    await expect(storeC.findById("PM-1")).resolves.toEqual(changed);
    await expect(storeC.all()).resolves.toHaveLength(1);
  });

  it("sees writes from another instance after it has already loaded, as a running server must", async () => {
    const server = new JsonFileMemberStore(filePath);
    await expect(server.findById("PM-1")).resolves.toBeUndefined();

    const cli = new JsonFileMemberStore(filePath);
    await cli.upsertMany([member]);
    await expect(server.findById("PM-1")).resolves.toEqual(member);

    const changed = { ...member, email: "alice.new@example.com" };
    await new JsonFileMemberStore(filePath).upsertMany([changed]);
    await expect(server.findById("PM-1")).resolves.toEqual(changed);
  });

  it("keeps the previous data, on disk and in memory, when a save fails", async () => {
    const store = new JsonFileMemberStore(filePath);
    await store.upsertMany([member]);

    vi.spyOn(fsPromises, "rename").mockRejectedValueOnce(
      new Error("disk full")
    );
    const changed = { ...member, email: "alice.new@example.com" };
    await expect(store.upsertMany([changed])).rejects.toThrow("disk full");

    await expect(store.findById("PM-1")).resolves.toEqual(member);
    await expect(
      new JsonFileMemberStore(filePath).findById("PM-1")
    ).resolves.toEqual(member);
    expect(readdirSync(dir)).toEqual(["members.json"]);
  });

  it.each([
    ["isn't valid JSON", "[{", "is not valid JSON"],
    ["isn't a list", '{"PM-1": {}}', "should contain a list of members"],
    [
      "has a record missing a field",
      JSON.stringify([member, { ...member, email: undefined }]),
      "entry 2 is not a valid member"
    ]
  ])(
    "fails with a clear message when the data file %s",
    async (_, contents, message) => {
      writeFileSync(filePath, contents);
      const store = new JsonFileMemberStore(filePath);
      await expect(store.findById("PM-1")).rejects.toThrow(message);
      await expect(store.findById("PM-1")).rejects.toThrow(filePath);
    }
  );

  it("starts empty when the backing file doesn't exist yet", async () => {
    const store = new JsonFileMemberStore(
      path.join(dir, "does-not-exist.json")
    );
    await expect(store.findById("PM-1")).resolves.toBeUndefined();
    await expect(store.all()).resolves.toEqual([]);
  });
});
