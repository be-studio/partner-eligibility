import path from "node:path";
import { createApp } from "./server.js";
import { JsonFileMemberStore } from "./store.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DATA_FILE =
  process.env.DATA_FILE ?? path.join(process.cwd(), "data", "members.json");

const store = new JsonFileMemberStore(DATA_FILE);
const app = createApp(store);

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
