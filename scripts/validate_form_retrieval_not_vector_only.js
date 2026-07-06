#!/usr/bin/env node
const { assert, loadSyntheticStore, searchForms } = require("./forms_cli_common");

const result = searchForms({ store: loadSyntheticStore(), query: "draft letter of claim", filters: { practiceArea: "personal_injury", matterType: "road_traffic_pi", documentIntent: "LETTER_OF_CLAIM", workflowStage: "PRE_ACTION_CORRESPONDENCE" } });
assert(result.retrievalPolicy.structuredFiltersFirst, "Retrieval must use structured filters first");
assert(result.retrievalPolicy.vectorOnlyAllowed === false, "Vector-only retrieval must be disabled");
assert(result.results.every(t => t.documentIntent === "LETTER_OF_CLAIM"), "Structured documentIntent filter failed");
console.log("form retrieval not vector-only ok");
