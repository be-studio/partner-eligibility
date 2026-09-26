import path from "node:path";

// Settings shared by both entry points, so the import and the server can't
// drift apart. They take the raw environment value as an argument, which keeps
// reading `process.env` in the entry points and makes these easy to test.

export function dataFilePath(value: string | undefined): string {
  return value || path.resolve("data", "members.json");
}

export function port(value: string | undefined): number {
  if (!value) return 3000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `PORT must be a whole number from 1 to 65535, but was "${value}"`
    );
  }
  return parsed;
}
