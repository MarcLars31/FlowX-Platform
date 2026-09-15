import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticProjectDetails,
  hasTechnicalDescriptionConflict,
  nextAvailableProjectNumber
} from "./technical-description-project";

test("uses the project metadata extracted from the technical description", () => {
  const details = automaticProjectDetails({
    extractedName: "Kv. Eken – sprinklerentreprenad",
    extractedProjectNumber: "P-1042",
    extractedStandards: ["SS-EN 12845"],
    fileName: "underlag.pdf"
  });

  assert.equal(details.name, "Kv. Eken – sprinklerentreprenad");
  assert.equal(details.projectNumber, "P-1042");
  assert.equal(details.standard, "SS-EN 12845");
});

test("creates a readable project name from the PDF file name", () => {
  const details = automaticProjectDetails({
    fileName: "C:\\uploads\\Teknisk_beskrivning-Kvarteret_Almen.pdf"
  });

  assert.equal(details.name, "Teknisk beskrivning Kvarteret Almen");
  assert.equal(details.projectNumber, null);
  assert.equal(details.standard, "Fastställs från det tekniska underlaget");
});

test("uses a stable dated fallback for an empty file name", () => {
  const details = automaticProjectDetails({
    fileName: "  ",
    now: new Date("2026-08-19T10:00:00.000Z")
  });

  assert.equal(details.name, "Teknisk analys 2026-08-19");
});

test("adds a stable suffix when an extracted project number already exists", () => {
  assert.equal(
    nextAvailableProjectNumber("C.2.3", ["C.2.3", "C.2.3-2"]),
    "C.2.3-3"
  );
  assert.equal(nextAvailableProjectNumber("P-1042", ["P-999"]), "P-1042");
  assert.equal(nextAvailableProjectNumber(null, ["P-999"]), null);
});

test("allows one technical PDF per project while permitting an exact retry", () => {
  assert.equal(hasTechnicalDescriptionConflict([], "new-hash"), false);
  assert.equal(hasTechnicalDescriptionConflict(["same-hash"], "same-hash"), false);
  assert.equal(hasTechnicalDescriptionConflict(["other-hash"], "new-hash"), true);
  assert.equal(
    hasTechnicalDescriptionConflict(["same-hash", "other-hash"], "same-hash"),
    true
  );
  assert.equal(hasTechnicalDescriptionConflict([null], "new-hash"), true);
});
