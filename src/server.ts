import "dotenv/config";

import { createApp } from "./app.js";

const app = createApp();

app.listen(3000, () => console.log("http://localhost:3000"));
