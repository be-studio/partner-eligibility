import path from "node:path";
import { importCsv } from "./import.js";
import { JsonFileMemberStore } from "./store.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run import -- <path-to-csv>");
    process.exitCode = 1;
    return;
  }

  const DATA_FILE =
    process.env.DATA_FILE ?? path.join(process.cwd(), "data", "members.json");
  const store = new JsonFileMemberStore(DATA_FILE);

  const report = await importCsv(filePath, store);

  console.log(`Total rows read: ${report.totalRows}`);
  console.log(`Created:         ${report.created}`);
  console.log(`Updated:         ${report.updated}`);
  console.log(`Unchanged:       ${report.unchanged}`);
  console.log(`Rejected:        ${report.rejected.length}`);

  if (report.rejected.length > 0) {
    console.log("\nRejected rows:");
    for (const r of report.rejected) {
      const id = r.partnerMemberId ?? "<missing>";
      console.log(
        `  Line ${r.line} (partner_member_id=${id}): ${r.reasons.join("; ")}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
