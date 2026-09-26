import path from "node:path";
import { describe, expect, it } from "vitest";
import { dataFilePath, port } from "../src/config.js";

describe("dataFilePath", () => {
  it("uses DATA_FILE when it's set", () => {
    expect(dataFilePath("/tmp/members.json")).toBe("/tmp/members.json");
  });

  it("defaults to data/members.json in the working directory", () => {
    const expected = path.join(process.cwd(), "data", "members.json");
    expect(dataFilePath(undefined)).toBe(expected);
    expect(dataFilePath("")).toBe(expected);
  });
});

describe("port", () => {
  it("defaults to 3000 when PORT isn't set", () => {
    expect(port(undefined)).toBe(3000);
    expect(port("")).toBe(3000);
  });

  it("accepts a valid port", () => {
    expect(port("8080")).toBe(8080);
  });

  it.each(["abc", "80.5", "0", "65536", "-1"])(
    "rejects %s with a clear message",
    (value) => {
      expect(() => port(value)).toThrow(
        `PORT must be a whole number from 1 to 65535, but was "${value}"`
      );
    }
  );
});
