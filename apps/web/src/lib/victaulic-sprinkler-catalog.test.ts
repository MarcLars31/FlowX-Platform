import assert from "node:assert/strict";
import test from "node:test";
import {
  findVictaulicSprinklerCandidates,
  VICTAULIC_SPRINKLER_CATALOG_COUNT,
  VICTAULIC_SPRINKLER_CATALOG_VERSION,
  VICTAULIC_SPRINKLER_EXACT_SIN_COUNT,
  VICTAULIC_SPRINKLER_CATALOG_SOURCE_SHA256,
  type VictaulicSprinklerCatalogQuery
} from "./victaulic-sprinkler-catalog";
import baseline from "./__fixtures__/sprinkler-matching-baseline.v1.json";

type BaselineRequirement = {
  system: string;
  coverage: string;
  orientation: string;
  mount: string | null;
  response: string;
  temperatureC: number | null;
  kFactor: number;
  dn: number;
  finish: string | null;
  construction?: string;
  accessory?: string;
  coverplateSpecified?: boolean;
  protectionSpecified?: boolean;
};

test("loads the reviewed Victaulic/Ahlsell sprinkler database", () => {
  assert.equal(VICTAULIC_SPRINKLER_CATALOG_VERSION, "2026-09-04");
  assert.equal(VICTAULIC_SPRINKLER_CATALOG_COUNT, 83);
  assert.equal(VICTAULIC_SPRINKLER_EXACT_SIN_COUNT, 82);
  assert.equal(VICTAULIC_SPRINKLER_CATALOG_SOURCE_SHA256, baseline.inputs.catalog.sha256);
});

test("finds the exact Norwegian Ahlsell article when the variant is fully specified", () => {
  const candidates = findVictaulicSprinklerCandidates(query({
    model: "V2762",
    kFactor: 80,
    dn: 15,
    temperatureC: 68,
    response: "quick",
    orientation: "pendent",
    sprinklerSystem: "wet",
    sprinklerHeadType: "standard",
    coverage: "standard",
    finish: "white"
  }));

  assert.equal(candidates[0].articleNumber, "9257423");
  assert.equal(candidates[0].source, "verified_database");
  assert.equal(candidates[0].exactMatch, true);
  assert.equal(candidates[0].matchWarnings?.length, 0);
});

test("normalizes K115.5 to the verified K115 product family", () => {
  const candidates = findVictaulicSprinklerCandidates(query({
    model: "V3702",
    kFactor: 115.5,
    dn: 20,
    temperatureC: 68,
    response: "quick",
    orientation: "pendent",
    sprinklerSystem: "wet",
    sprinklerHeadType: "standard",
    coverage: "standard",
    finish: "white"
  }));

  assert.equal(candidates[0].articleNumber, "1364601");
  assert.equal(candidates[0].exactMatch, true);
});

test("does not auto-select when several articles satisfy an incomplete variant", () => {
  const candidates = findVictaulicSprinklerCandidates(query({
    kFactor: 80,
    dn: 15,
    temperatureC: 68,
    response: "quick",
    orientation: "pendent",
    sprinklerSystem: "wet",
    sprinklerHeadType: "standard",
    coverage: "standard"
  }));

  assert.ok(candidates.length > 1);
  assert.ok(candidates.every((candidate) => candidate.exactMatch === false));
  assert.ok(candidates.some((candidate) => candidate.matchWarnings?.some((warning) => warning.includes("Flera verifierade artiklar"))));
});

test("returns no database candidate for the invalid conventional K80 DN20 combination", () => {
  const candidates = findVictaulicSprinklerCandidates(query({
    kFactor: 80,
    dn: 20,
    temperatureC: 68,
    response: "standard",
    orientation: "sidewall",
    sprinklerHeadType: "standard",
    coverage: "standard"
  }));

  assert.deepEqual(candidates, []);
});

test("keeps a catalog review flag from becoming an exact match", () => {
  const candidates = findVictaulicSprinklerCandidates(query({
    model: "V3801",
    kFactor: 80,
    dn: 15,
    temperatureC: 68,
    response: "standard",
    orientation: "pendent",
    mount: "concealed",
    sprinklerHeadType: "standard",
    coverage: "standard",
    finish: "brass"
  }));

  assert.equal(candidates[0].articleNumber, "9254073");
  assert.equal(candidates[0].exactMatch, false);
  assert.ok(candidates[0].matchWarnings?.some((warning) => warning.includes("Databasraden kräver kontroll")));
});

test("requires manual accessory compatibility review before an exact match", () => {
  const candidates = findVictaulicSprinklerCandidates(query({
    model: "V2762",
    kFactor: 80,
    dn: 15,
    temperatureC: 68,
    response: "quick",
    orientation: "pendent",
    sprinklerSystem: "wet",
    sprinklerHeadType: "standard",
    coverage: "standard",
    finish: "white",
    requiresAccessoryReview: true
  }));

  assert.equal(candidates[0].articleNumber, "9257423");
  assert.equal(candidates[0].exactMatch, false);
  assert.ok(candidates[0].matchWarnings?.some((warning) => warning.includes("tillbehör eller skydd")));
});

test("separates a dry-pipe installation from the sprinkler head construction", () => {
  const conventional = findVictaulicSprinklerCandidates(query({
    model: "V2704",
    kFactor: 80,
    dn: 15,
    temperatureC: 68,
    response: "quick",
    orientation: "upright",
    sprinklerSystem: "dry",
    sprinklerHeadType: "standard",
    coverage: "standard",
    finish: "brass"
  }));
  const dryHead = findVictaulicSprinklerCandidates(query({
    model: "V3613",
    kFactor: 80,
    dn: 25,
    temperatureC: 68,
    response: "standard",
    orientation: "pendent",
    sprinklerSystem: "wet",
    sprinklerHeadType: "dry",
    finish: "white"
  }));

  assert.equal(conventional[0].articleNumber, "9254043");
  assert.ok(dryHead.length > 0);
  assert.ok(dryHead.every((candidate) => candidate.specifications.some((value) => /dry sprinkler/i.test(value))));
});

test("the verified database reproduces the saved baseline candidate coverage", () => {
  for (const item of baseline.cases) {
    if (!item.requirement) continue;
    const requirement = item.requirement as BaselineRequirement;
    const candidates = findVictaulicSprinklerCandidates(queryFromBaseline(requirement));
    if (item.baseline.state === "candidate") {
      assert.ok(
        candidates.some((candidate) => candidate.articleNumber === item.baseline.articleNumber),
        `${item.id} should include baseline article ${item.baseline.articleNumber}`
      );
    } else if (item.baseline.state === "no_exact_match") {
      assert.ok(
        candidates.every((candidate) => candidate.exactMatch !== true),
        `${item.id} must not become an automatic exact match`
      );
    }
  }
});

function query(overrides: Partial<VictaulicSprinklerCatalogQuery>): VictaulicSprinklerCatalogQuery {
  return {
    market: "no",
    model: null,
    kFactor: null,
    dn: null,
    temperatureC: null,
    response: null,
    orientation: null,
    mount: null,
    sprinklerSystem: null,
    sprinklerHeadType: null,
    coverage: null,
    finish: null,
    requiresAccessoryReview: false,
    ...overrides
  };
}

function queryFromBaseline(requirement: BaselineRequirement): VictaulicSprinklerCatalogQuery {
  const coverage = ({
    standard: "standard",
    conventional: "standard",
    extended_light_hazard: "extended_light_hazard",
    extended_ordinary_hazard: "extended_ordinary_hazard",
    residential: "residential",
    storage: "storage",
    specific_application_window: "window"
  } as const)[requirement.coverage as "standard"] ?? null;
  const headType = requirement.construction === "dry_type"
    ? "dry" as const
    : requirement.response === "open" ? "open" as const : "standard" as const;

  return query({
    kFactor: requirement.kFactor,
    dn: requirement.dn,
    temperatureC: requirement.temperatureC,
    response: requirement.response === "quick" || requirement.response === "standard"
      ? requirement.response
      : null,
    orientation: requirement.orientation === "pendent"
      || requirement.orientation === "upright"
      || requirement.orientation === "sidewall"
        ? requirement.orientation
        : null,
    mount: requirement.mount === "recessed" || requirement.mount === "concealed"
      ? requirement.mount
      : null,
    sprinklerSystem: requirement.system.includes("dry") ? "dry" : "wet",
    sprinklerHeadType: headType,
    coverage,
    finish: requirement.finish === "brass"
      || requirement.finish === "white"
      || requirement.finish === "black"
      || requirement.finish === "chrome"
        ? requirement.finish
        : null,
    requiresAccessoryReview: Boolean(
      requirement.accessory
      || requirement.coverplateSpecified
      || requirement.protectionSpecified
    )
  });
}
