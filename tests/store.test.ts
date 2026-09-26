import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryMemberStore, JsonFileMemberStore } from "../src/store.js";
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

describe("InMemoryMemberStore", () => {
  let store: InMemoryMemberStore;

  beforeEach(() => {
    store = new InMemoryMemberStore();
  });

  it("reports 'created' the first time a member is upserted", async () => {
    await expect(store.upsert(member)).resolves.toBe("created");
    await expect(store.findById("PM-1")).resolves.toEqual(member);
  });

  it("reports 'unchanged' when upserting an identical record again", async () => {
    await store.upsert(member);
    await expect(store.upsert(member)).resolves.toBe("unchanged");
  });

  it("reports 'updated' when a field differs, and stores the new value", async () => {
    await store.upsert(member);
    const changed = { ...member, email: "alice.new@example.com" };
    await expect(store.upsert(changed)).resolves.toBe("updated");
    await expect(store.findById("PM-1")).resolves.toEqual(changed);
  });

  it("returns undefined for an unknown id", async () => {
    await expect(store.findById("does-not-exist")).resolves.toBeUndefined();
  });
});

describe("JsonFileMemberStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "peu-store-"));
    filePath = path.join(dir, "members.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists across separate store instances, simulating separate process runs", async () => {
    const storeA = new JsonFileMemberStore(filePath);
    await expect(storeA.upsert(member)).resolves.toBe("created");

    // A fresh instance on the same file stands in for a second CLI invocation.
    const storeB = new JsonFileMemberStore(filePath);
    await expect(storeB.findById("PM-1")).resolves.toEqual(member);

    // Re-importing the same record through the new instance must not duplicate it.
    await expect(storeB.upsert(member)).resolves.toBe("unchanged");
    await expect(storeB.all()).resolves.toHaveLength(1);
  });

  it("persists an update made by one instance so a later instance sees it", async () => {
    const storeA = new JsonFileMemberStore(filePath);
    await storeA.upsert(member);

    const changed = { ...member, policyEnd: "2025-06-30" };
    const storeB = new JsonFileMemberStore(filePath);
    await expect(storeB.upsert(changed)).resolves.toBe("updated");

    const storeC = new JsonFileMemberStore(filePath);
    await expect(storeC.findById("PM-1")).resolves.toEqual(changed);
    await expect(storeC.all()).resolves.toHaveLength(1);
  });

  it("starts empty when the backing file doesn't exist yet", async () => {
    const store = new JsonFileMemberStore(
      path.join(dir, "does-not-exist.json")
    );
    await expect(store.findById("PM-1")).resolves.toBeUndefined();
    await expect(store.all()).resolves.toEqual([]);
  });
});
