import { createStoryStore } from "../src/lib/discovery/store.ts";

const store = createStoryStore();
try { await store.migrate(); console.log("Story index migration complete."); }
finally { await store.close(); }
