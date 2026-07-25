import { ConfigError } from "./cli/config.js";
import { runIndexerCli } from "./cli/run.js";

runIndexerCli({
  onListening(address) {
    console.log(`Tonalli Memo indexer API listening at ${address}`);
  }
}).catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  console.error("Tonalli Memo indexer API failed to start.");
  process.exitCode = 1;
});
