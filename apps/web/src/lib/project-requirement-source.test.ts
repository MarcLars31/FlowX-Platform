import { ProjectPostSpecification } from "../components/ProjectPostSpecification";
import { projectRequirementDetails } from "./project-requirement-details";
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PdfInheritedRequirements, PdfSourceDocument } from "../components/PdfRequirementSource";
import { projectRequirementSourceSections } from "./project-requirement-source";

const valve = "03.30.314. UC1.3121191A\n2 INNENDØRS STENGEVENTIL\nVentiltype: Kuleventil\nTrykk: PN10\nAndre krav:\nx) Mengderegler\nMengder avregnes";
const parentSpecification = "03.30 VVS-installasjoner\n\nUNDERPOST\n03.30.314 Armaturer for sanitærinstallasjoner\n\nUNDERPOST\n" + valve;

test("identifies the Rørhall main post but only displays inherited text below its summary", () => {
  const sections = projectRequirementSourceSections(parentSpecification, "03.30.314.2");
  assert.deepEqual(sections.map(section => [section.postNumber, section.relation]), [
    ["03.30", "inherited"], ["03.30.314", "inherited"], ["03.30.314.2", "current"]
  ]);
  assert.equal(sections[2].text, "UC1.3121191A\nINNENDØRS STENGEVENTIL\nVentiltype: Kuleventil\nTrykk: PN10\nAndre krav:\nx) Mengderegler\nMengder avregnes");
  assert.match(parentSpecification, /03\.30\.314\. UC1\.3121191A\n2 INNENDØRS/);
  const html = renderToStaticMarkup(createElement(PdfInheritedRequirements, { specification: parentSpecification, postNumber: "03.30.314.2" }));
  assert.match(html, /Felles krav/);
  assert.match(html, /Armaturer for sanitærinstallasjoner/);
  assert.doesNotMatch(html, /Denne posten|UNDERPOST|UC1\.3121191A|Mengder avregnes/);
});

test("a child keeps its quantity while the valve clauses remain inherited", () => {
  const specification = parentSpecification + "\n\nUNDERPOST\n03.30.314. DN15\n2.1\nAntall stk 10 0,00 0,00";
  const sections = projectRequirementSourceSections(specification, "03.30.314.2.1");
  assert.equal(sections[2].relation, "inherited");
  assert.match(sections[2].text, /Mengder avregnes$/);
  assert.deepEqual(sections[3], { postNumber: "03.30.314.2.1", relation: "current", text: "DN15\n\nAntall stk 10 0,00 0,00" });
  const html = renderToStaticMarkup(createElement(PdfInheritedRequirements, { specification, postNumber: "03.30.314.2.1" }));
  assert.doesNotMatch(html, /UNDERPOST|Denne posten|DN15|Antall stk 10 0,00 0,00/);
  assert.match(html, /Felles krav/);
  assert.match(html, /Fra post 03\.30\.314\.2/);
  assert.match(html, /UC1\.3121191A/);
  assert.match(html, /Mengder avregnes/);
});

test("preserves quantity columns and unrecognized or unrelated source text", () => {
  assert.equal(projectRequirementSourceSections("33.1 Ventil stk 4 0,00 0,00", "33.1")[0].text, "Ventil stk 4 0,00 0,00");
  const leadingQuantity = "stk 4 0,00 0,00 33.1 Ventil";
  assert.equal(projectRequirementSourceSections(leadingQuantity, "33.1")[0].text, leadingQuantity);
  assert.deepEqual(projectRequirementSourceSections("Materiale: Messing\nKomplett levering.", null), [
    { postNumber: null, relation: "context", text: "Materiale: Messing\nKomplett levering." }
  ]);
  assert.equal(projectRequirementSourceSections("03.30.314.20 Annen ventil", "03.30.314.2")[0].relation, "context");
  assert.deepEqual(projectRequirementSourceSections("", "33.1"), []);
  assert.equal(renderToStaticMarkup(createElement(PdfInheritedRequirements, { specification: "33.1 Ventil", postNumber: "33.1" })), "");
});

test("shows source filename and page with and without a downloadable original", () => {
  const props = { fileName: "03 Bygg 10 Rørhall.pdf", page: 29, href: "/source#page=29" };
  const linked = renderToStaticMarkup(createElement(PdfSourceDocument, props));
  assert.match(linked, /href="\/source#page=29"/);
  assert.match(linked, /03 Bygg 10 Rørhall.pdf/);
  assert.match(linked, /Side 29/);
  const unavailable = renderToStaticMarkup(createElement(PdfSourceDocument, { ...props, href: null }));
  assert.doesNotMatch(unavailable, /<a /);
  assert.match(unavailable, /03 Bygg 10 Rørhall.pdf/);
});

test("the production card separates the selected post from collapsed common requirements", () => {
  for (const child of [false, true]) {
    const postNumber = child ? "03.30.314.2.1" : "03.30.314.2";
    const specification = parentSpecification + (child ? "\n\nUNDERPOST\n03.30.314. DN15\n2.1\nAntall stk 10 0,00 0,00" : "");
    const row = { value_text: child ? "DN15" : "INNENDØRS STENGEVENTIL", source_page: 29, value_json: {
      postNumber, nsCode: "UC1.3121191A", technicalSpecification: specification, attributes: { trykk: "PN10", ...(child ? { dimensjon: "DN15" } : {}) }
    } };
    const before = JSON.stringify(row);
    const details = projectRequirementDetails(row);
    assert.ok(details.sourceExcerpt);
    if (child) assert.match(details.inheritedSpecification!, /Mengder avregnes/);
    else assert.doesNotMatch(details.inheritedSpecification!, /Mengder avregnes/);
    {
      const html = renderToStaticMarkup(createElement(ProjectPostSpecification, {
        id: postNumber, details, description: row.value_text, quantity: { quantity: child ? 10 : null, unit: child ? "st" : "?" },
        sourcePdfFileName: "03 Bygg 10 Rørhall.pdf"
      }));
      assert.doesNotMatch(html, /UNDERPOST|Denne posten|03\.30\.314\. UC|2 INNENDØRS/);
      assert.equal(html.match(/Mengder avregnes/g)?.length ?? 0, 1);
      assert.equal(html.match(/UC1\.3121191A/g)?.length ?? 0, 1);
      assert.match(html, /03 Bygg 10 Rørhall.pdf/);
      assert.ok(html.includes(row.value_text));
      const body = html.match(/aria-label="Produktpost"[^>]*>([\s\S]*?)<\/div>/)![1];
      assert.doesNotMatch(body, /Fra post|VVS-installasjoner|Armaturer for sanitærinstallasjoner/);
      assert.match(html, /<details aria-label="Felles krav"/);
      assert.doesNotMatch(html, /<details[^>]*open/);
      assert.match(html, /Armaturer for sanitærinstallasjoner/);
    }
    assert.equal(JSON.stringify(row), before);
  }
});
