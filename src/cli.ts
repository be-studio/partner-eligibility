import { dataFilePath } from "./config.js";
import { importCsv } from "./import.js";
import { formatReport } from "./report.js";
import { JsonFileMemberStore } from "./store.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run import -- <path-to-csv>");
    process.exitCode = 1;
    return;
  }

  const store = new JsonFileMemberStore(dataFilePath(process.env.DATA_FILE));
  const report = await importCsv(filePath, store);
  console.log(formatReport(report));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
