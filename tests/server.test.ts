import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";
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

describe("GET /members/:partnerMemberId", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "peu-server-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 200 and the member for a known id", async () => {
    const store = new JsonFileMemberStore(path.join(dir, "members.json"));
    await store.upsert(member);
    const app = createApp(store);

    const response = await request(app).get("/members/PM-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(member);
  });

  it("returns 404 for an unknown id", async () => {
    const store = new JsonFileMemberStore(path.join(dir, "members.json"));
    const app = createApp(store);

    const response = await request(app).get("/members/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "member not found" });
  });
});
