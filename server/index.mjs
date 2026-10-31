import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';
import { appsScriptStore, memoryStore } from './store.mjs';
import { promptWriter } from './prompt-writer.mjs';

const config = loadConfig();

let store;
if (config.appsScriptUrl && config.appsScriptSecret) {
  store = appsScriptStore({ url: config.appsScriptUrl, secret: config.appsScriptSecret });
  try {
    await store.ping();
    console.log('[store] Google Sheet reachable through Apps Script');
  } catch (e) {
    console.error(`[store] Apps Script check failed: ${e.message}`); // keep serving; saves will report the error
  }
} else {
  store = memoryStore();
  console.warn('[store] APPS_SCRIPT_URL / APPS_SCRIPT_SECRET not set: data is kept in memory and lost on restart');
}

const writer = promptWriter({ apiKey: config.anthropicKey, model: config.model });
console.log(writer.enabled ? `[ai] prompts written by ${config.model}` : '[ai] ANTHROPIC_API_KEY not set: using the fixed template prompt');

const app = createApp({ store, writer, aiLimitPerIpHour: config.aiLimitPerIpHour });
const server = app.listen(config.port, () => console.log(`LIVE LARIS on http://localhost:${config.port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
