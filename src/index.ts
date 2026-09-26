import { dataFilePath, port } from "./config.js";
import { createApp } from "./server.js";
import { JsonFileMemberStore } from "./store.js";

const PORT = port(process.env.PORT);
const store = new JsonFileMemberStore(dataFilePath(process.env.DATA_FILE));
const app = createApp(store);

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
