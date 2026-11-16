// Source inventory for the matching-rule workbook; does not execute application code.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("../apps/web/node_modules/typescript");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "outputs/01a07d20-01ce-7742-b176-494f0ecfb631");
const lib = "apps/web/src/lib/";
const entries = [
  ["PDF/OCR", "Aktiv", "apps/web/src/app/api/technical-descriptions/route.ts"],
  ["PDF/OCR", "Aktiv", lib+"technical-description-upload.ts"],
  ["PDF/OCR", "Aktiv", lib+"browser-pdf-ocr.ts"],
  ["PDF/OCR", "Aktiv", lib+"technical-description-ocr-payload.ts"],
  ["PDF/OCR", "Aktiv", lib+"pdf-runtime.ts"],
  ["PDF/OCR", "Aktiv", lib+"pdf-security.ts"],
  ["PDF/OCR", "Aktiv", "apps/web/src/modules/technical-description-extractor/pdf.ts"],
  ["PDF/OCR", "Aktiv", "apps/web/src/modules/technical-description-extractor/pdf-layout.ts"],
  ["PDF/OCR", "Aktiv", "apps/web/src/modules/technical-description-extractor/extractor.ts"],
  ["Äldre extraktion", "Separat äldre API", "apps/web/src/modules/pdf-extractor/extractor.ts"],
  ["Äldre extraktion", "Separat äldre API", "apps/web/src/modules/pdf-extractor/pdf-text.ts"],
  ["Kravdata", "Aktiv", lib+"project-requirement-enrichment.ts"],
  ["Kravdata", "Aktiv", lib+"project-requirement-data-warnings.ts"],
  ["Kravdata", "Aktiv", lib+"project-requirement-details.ts"],
  ["Kravdata", "Aktiv", lib+"project-requirement-quantity.ts"],
  ["Kravdata", "Aktiv", lib+"project-requirement-order.ts"],
  ["Kravdata", "Aktiv", lib+"product-requirement-category.ts"],
  ["Kravdata", "Aktiv", lib+"ns3420-product-classification.ts"],
  ["Sökning", "Aktiv", lib+"ahlsell-public-match.ts"],
  ["Sökning", "Aktiv", lib+"ahlsell-public-catalog.ts"],
  ["Poäng och beslut", "Aktiv", lib+"ahlsell-candidate-ranking.ts"],
  ["Teknisk kontroll", "Aktiv", lib+"ahlsell-engineering-checks.ts"],
  ["Sprinkler", "Aktiv", lib+"sprinkler-technical-rules.ts"],
  ["Sprinkler", "Aktiv", lib+"sprinkler-orientation-lexicon.ts"],
  ["Katalog", "Aktiv", lib+"victaulic-sprinkler-catalog.ts"],
  ["Katalog", "Aktiv", lib+"ahlsell-mldl-catalog.ts"],
  ["Katalogdata", "Aktivt katalogunderlag", "apps/web/src/data/ahlsell-mldl-catalog.json"],
  ["Katalogdata", "Aktivt katalogunderlag", "apps/web/src/data/victaulic-sprinkler-catalog.json"],
  ["Katalogimport", "Importverktyg", lib+"ahlsell-mldl-normalizer.ts"],
  ["Sammanvägning", "Aktiv", lib+"ahlsell-candidate-merge.ts"],
  ["Tillbehör", "Aktiv", lib+"ahlsell-accessory-suggestions.ts"],
  ["Historik", "Aktiv", lib+"distributor-product-memory.ts"],
  ["Historik", "Aktiv", lib+"distributor-product-memory-match.ts"],
  ["Godkännande", "Aktiv", lib+"ahlsell-match-groups.ts"],
  ["Godkännande", "Aktiv", lib+"bulk-product-approval.ts"],
  ["Godkännande", "Aktiv", lib+"approved-product-assignment.ts"],
  ["Godkännande", "Aktiv", lib+"distributor-product-mapping.ts"],
  ["Godkännande", "Aktiv", lib+"product-requirement-resolution.ts"],
  ["Historik", "Aktiv", lib+"product-learning-feedback.ts"],
  ["Kandidat-API", "Aktiv", "apps/web/src/app/api/projects/[id]/requirements/[requirementId]/ahlsell-candidates/route.ts"],
  ["Godkännande", "Aktiv", "apps/web/src/app/api/projects/[id]/product-mappings/route.ts"],
  ["Databas", "Aktiv historik", "supabase/migrations/20260818100000_create_distributor_product_memory.sql"],
  ["Databas", "Separat teknisk datamodell", "supabase/migrations/20260806120000_enforce_flowx_security_and_technical_gate.sql"],
];
const sources = [], conditions = [], patterns = [], functions = [];
for (const [area, status, file] of entries) {
  if (!fs.existsSync(path.join(root,file))) throw new Error("Missing source: "+file);
  const source = fs.readFileSync(path.join(root,file),"utf8");
  const sourceId = "SRC-"+String(sources.length+1).padStart(3,"0");
  sources.push({sourceId,area,status,file,lines:source.split("\n").length,sha256:crypto.createHash("sha256").update(source).digest("hex")});
  if (file.endsWith(".sql")) {
    for(const match of source.matchAll(/create or replace function\s+(?:public\.)?(\w+)\s*\(/gi)) {
      functions.push({sourceId,name:match[1],line:source.slice(0,match.index).split("\n").length});
    }
  }
  if (!file.endsWith(".ts")) continue;
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function owner(node) {
    let parent=node.parent;
    while (parent) {
      if ((ts.isFunctionDeclaration(parent)||ts.isMethodDeclaration(parent)) && parent.name) return parent.name.getText(sf);
      parent=parent.parent;
    }
    return "(modul)";
  }
  function visit(node) {
    const line=sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;
    const fn=owner(node);
    const add=(kind,expression,effect="")=>conditions.push({id:"CODE-"+String(conditions.length+1).padStart(4,"0"),area,status,kind,fn,expression,effect,sourceId,line});
    if (ts.isIfStatement(node)) {
      // Do not repeat nested bodies: the full boolean condition is authoritative.
      const messages=[];
      function collect(n) {
        if (n!==node.thenStatement && ts.isIfStatement(n)) return;
        if (ts.isCallExpression(n) && /\.push$/.test(n.expression.getText(sf))) {
          messages.push(n.getText(sf));
        }
        ts.forEachChild(n,collect);
      }
      collect(node.thenStatement);
      add("if",node.expression.getText(sf),messages.join("\n") || (ts.isReturnStatement(node.thenStatement) ? node.thenStatement.getText(sf) : "Villkoret styr följande kodblock; se källraden."));
    } else if (ts.isConditionalExpression(node)) add("villkorsuttryck",node.condition.getText(sf),"Sant: "+node.whenTrue.getText(sf)+"\nFalskt: "+node.whenFalse.getText(sf));
    else if (ts.isReturnStatement(node) && node.expression && !ts.isObjectLiteralExpression(node.expression)) add("retur",node.expression.getText(sf));
    else if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) add("filter/beräkning",node.body.getText(sf));
    else if (ts.isCaseClause(node)) add("switch",node.expression.getText(sf));
    else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusEqualsToken,ts.SyntaxKind.MinusEqualsToken].includes(node.operatorToken.kind)) add("poäng/uppdatering",node.getText(sf));
    if (node.kind===ts.SyntaxKind.RegularExpressionLiteral) patterns.push({id:"PAT-"+String(patterns.length+1).padStart(4,"0"),area,status,name:fn+" / regex",value:node.getText(sf),sourceId,line});
    if (ts.isVariableDeclaration(node) && node.initializer && (/^[A-Z][A-Z0-9_]+$/.test(node.name.getText(sf))
      || (node.parent.parent.parent===sf && (ts.isArrayLiteralExpression(node.initializer) || ts.isObjectLiteralExpression(node.initializer))))) {
      patterns.push({id:"PAT-"+String(patterns.length+1).padStart(4,"0"),area,status,name:node.name.getText(sf),value:node.initializer.getText(sf),sourceId,line});
    }
    if (ts.isFunctionDeclaration(node) && node.name) functions.push({sourceId,name:node.name.getText(sf),line});
    ts.forEachChild(node,visit);
  }
  visit(sf);
}
fs.mkdirSync(out,{recursive:true});
const json={generated:"2026-09-13",engineVersion:"technical-rules-2026-09-13.1",sources,functions,conditions,patterns};
fs.writeFileSync(path.join(out,"inventory.json"),JSON.stringify(json,null,2));
console.log(JSON.stringify({files:sources.length,functions:functions.length,conditions:conditions.length,patterns:patterns.length}));
