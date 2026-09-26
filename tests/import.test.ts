import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importCsv } from "../src/import.js";
import { InMemoryMemberStore } from "../src/store.js";

const HEADER =
  "partner_member_id,first_name,last_name,date_of_birth,email,policy_start,policy_end";

function writeCsv(dir: string, contents: string): string {
  const filePath = path.join(dir, "members.csv");
  writeFileSync(filePath, contents);
  return filePath;
}

describe("importCsv", () => {
  let dir: string;
  let store: InMemoryMemberStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "peu-import-"));
    store = new InMemoryMemberStore();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports valid rows and rejects invalid ones with reasons", async () => {
    const csv = [
      HEADER,
      "PM-1,Alice,Nguyen,1990-04-12,alice@example.com,2024-01-01,2024-12-31",
      "PM-2,Ben,Ochieng,1985-11-02,not-an-email,2024-01-01,2024-12-31",
      ",Carla,Smith,1978-07-19,carla@example.com,2024-01-01,2024-12-31"
    ].join("\n");

    const report = await importCsv(writeCsv(dir, csv), store);

    expect(report.totalRows).toBe(3);
    expect(report.created).toBe(1);
    expect(report.updated).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.rejected).toHaveLength(2);
    expect(report.rejected[0]).toMatchObject({
      row: 2,
      partnerMemberId: "PM-2",
      reasons: ["email is not a valid email address"]
    });
    expect(report.rejected[1]).toMatchObject({
      row: 3,
      partnerMemberId: "",
      reasons: ["partner_member_id is required"]
    });

    await expect(store.findById("PM-1")).resolves.toBeDefined();
    await expect(store.findById("PM-2")).resolves.toBeUndefined();
  });

  it("does not create duplicates when the same file is imported twice", async () => {
    const csv = [
      HEADER,
      "PM-1,Alice,Nguyen,1990-04-12,alice@example.com,2024-01-01,2024-12-31"
    ].join("\n");
    const filePath = writeCsv(dir, csv);

    const first = await importCsv(filePath, store);
    expect(first.created).toBe(1);

    const second = await importCsv(filePath, store);
    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(1);
    await expect(store.all()).resolves.toHaveLength(1);
  });

  it("updates the stored record when a re-imported row has changed", async () => {
    const original = [
      HEADER,
      "PM-1,Alice,Nguyen,1990-04-12,alice@example.com,2024-01-01,2024-12-31"
    ].join("\n");
    await importCsv(writeCsv(dir, original), store);

    const changed = [
      HEADER,
      "PM-1,Alice,Nguyen,1990-04-12,alice.new@example.com,2024-01-01,2024-12-31"
    ].join("\n");
    const report = await importCsv(writeCsv(dir, changed), store);

    expect(report.updated).toBe(1);
    expect(report.created).toBe(0);
    const stored = await store.findById("PM-1");
    expect(stored?.email).toBe("alice.new@example.com");
  });

  it("rejects a ragged row (wrong column count) instead of crashing the whole import", async () => {
    const csv = [
      HEADER,
      "PM-1,Alice,Nguyen,1990-04-12,alice@example.com,2024-01-01,2024-12-31",
      "PM-2,Ben,Ochieng,1985-11-02,ben@example.com,2024-01-01" // missing policy_end
    ].join("\n");

    const report = await importCsv(writeCsv(dir, csv), store);

    expect(report.created).toBe(1);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].reasons).toContain("policy_end is required");
  });

  it("lets a later duplicate partner_member_id in the same file win", async () => {
    const csv = [
      HEADER,
      "PM-1,Alice,Nguyen,1990-04-12,alice@example.com,2024-01-01,2024-12-31",
      "PM-1,Alice,Nguyen,1990-04-12,alice.updated@example.com,2024-01-01,2024-12-31"
    ].join("\n");

    await importCsv(writeCsv(dir, csv), store);

    await expect(store.all()).resolves.toHaveLength(1);
    const stored = await store.findById("PM-1");
    expect(stored?.email).toBe("alice.updated@example.com");
  });
});
