import { buildServer } from "./server.js";
import { config } from "./config.js";
const { app, processQueuedJobs, queue } = buildServer();
setInterval(() => {
    void processQueuedJobs();
}, 2000);
app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Relayroom API listening on http://localhost:${config.port}`);
});
process.on("SIGTERM", async () => {
    await queue.close();
    process.exit(0);
});
