import assert from "node:assert/strict";
import test from "node:test";
import { orderedSpecificationAttributes } from "./project-specification-layout";
import { projectRequirementDetails } from "./project-requirement-details";

test("specification fields follow PDF order even when stored JSON keys have been reordered", () => {
  const fields = orderedSpecificationAttributes(projectRequirementDetails({ value_json: {
    attributes: { trykk: "12 bar", type: "Sprinkler rillerør", "materiale avgreningsledning": "Stål", lokalisering: "I Gamlebygget", "materiale hovedledning": "Stål", "pdf-kommentar": "Kontroller plassering.", "andre krav": "Nei" },
    technicalSpecification: "30.332.5 UB3.8114343\nTILKOBLING AV VANNLEDNING\nRund sum RS\nMateriale hovedledning: Stål\nMateriale avgreningsledning: Stål\nLokalisering: I Gamlebygget\nType: Sprinkler rillerør\nTrykk: 12 bar\nAndre krav: Nei"
  } }));
  assert.deepEqual(fields.map(field => field.label), ["Materiale hovedledning", "Materiale avgreningsledning", "Lokalisering", "Type", "Trykk", "Pdf kommentar"]);
  assert.equal(fields.at(-1)?.value, "Kontroller plassering.");
});

test("only own fields retain the child's value and original source label", () => {
  const fields = orderedSpecificationAttributes(projectRequirementDetails({ value_json: {
    attributes: { "k-faktor": "80", dimensjon: "DN25", trykk: "12 bar" },
    technicalSpecification: "Trykk: 12 bar\nDimensjon: Se under\nK-faktor: 80\nUNDERPOST\nDimensjon: DN25"
  } }));
  assert.deepEqual(fields.map(({ label, value }) => [label, value]), [["Dimensjon", "DN25"]]);
});
