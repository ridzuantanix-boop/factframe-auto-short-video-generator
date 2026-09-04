import { getEntities } from "../src/lib/data/wikidata.ts";
import { claimEntityIds, classifyEntityEvidence } from "../src/lib/discovery/classification.ts";
import { writeAudit } from "./audit-lib.mjs";

const controls = [{ id: "Q19837", name: "Steve Jobs" }, { id: "Q243", name: "Eiffel Tower" }, { id: "Q4349969", name: "Dyatlov Pass" }, { id: "Q3355", name: "Amelia Earhart" }];
const roots = await getEntities(controls.map(({ id }) => id));
const referenceIds = [...new Set(Object.values(roots).flatMap((entity) => claimEntityIds(entity)))];
const references = {};
for (let index = 0; index < referenceIds.length; index += 50) Object.assign(references, await getEntities(referenceIds.slice(index, index + 50)));
const graph = new Map(Object.entries({ ...roots, ...references }));
const results = controls.map(({ id, name }) => ({ id, name, provenanceQuery: "Malaysia history", ...classifyEntityEvidence({ label: name, description: roots[id]?.descriptions?.en?.value ?? "" }, roots[id], graph) }));
const output = { generatedAt: new Date().toISOString(), assertion: "A Malaysia discovery query is provenance only and cannot change entity geography.", passed: results.every((result) => result.country !== "Malaysia"), results };
console.log(JSON.stringify(output, null, 2));
console.log(`Wrote ${await writeAudit("classification-control-sample.json", output)}.`);
