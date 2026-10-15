import assert from "node:assert/strict";
import test from "node:test";
import { currentPostRequirement } from "./current-post-requirement";
import { productRequirementContext, productRequirementAttributes } from "./ahlsell-requirement-context";
import { withEffectiveRequirements, requirementForSearch } from "./effective-requirements";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { classifyProductRequirement } from "./product-classification";
import { genericProductIdentity } from "./ahlsell-generic-product-relevance";

type Fields = Record<string, string | number | boolean>;
function row(title: string, parentTitle: string, parentFields: Fields, ownFields: Fields = {}, ownText = "") {
  return { id: "subpost", source_page: 55, category: "pipe", value_text: title, value_json: {
    postNumber: "03.30.324.1.1", parentPostNumber: "03.30.324.1", parentDescription: parentTitle, quantity: 2, unit: "st",
    attributes: { ...parentFields, ...ownFields },
    attributeSources: Object.fromEntries([...Object.keys(parentFields).map(key => [key, {postNumber:"03.30.324.1",sourcePage:54}]), ...Object.keys(ownFields).map(key => [key, {postNumber:"03.30.324.1.1",sourcePage:55}])]),
    sourceText: `03.30.324.1.1 ${title}\n${ownText}`,
    technicalSpecification: `03.30.324.1 ${parentTitle}\n${Object.entries(parentFields).map(([key,value])=>`${key}: ${value}`).join("\n")}\n\nUNDERPOST\n03.30.324.1.1 ${title}\n${ownText}`
  } };
}

const aliasCases: Array<[string,string,string,string,string]> = [
  ["trykk","PN10","PN","16","pn"], ["PN","10","Tryck","PN16","pn"],
  ["trykk","minimum PN10","trykklasse","16","pn"], ["arbeidstrykk","10 bar","working pressure","16 bar","workingPressureBar"],
  ["dimensjon","DN80","DN","25","dn"], ["DN","80","dimensjon, tilkoblinger","DN25","dn"],
  ["materiale rør","Stål","Material","Messing","material"],
  ["skjøt","Gjenget","anslutningstyp","Flens","connection"],
  ["k-faktor","115","K-värde","80","kFactor"],
  ["utløsningstemperatur","93 °C","temperature rating","68 °C","temperatureC"],
  ["følsomhetsgrad","Standard","response","Quick","response"],
  ["overflatebehandling","Hvit","finish","Messing","finish"],
  ["materialkvalitet","Bluepipe","grade","Eget system","materialGrade"]
];
for (const [parentKey,parentValue,ownKey,ownValue,property] of aliasCases) {
  test(`own ${ownKey} overrides inherited ${parentKey} in retrieval and evaluation`, () => {
    const input = row("DN25", "INNENDØRS STENGEVENTIL", {[parentKey]:parentValue}, {[ownKey]:ownValue});
    const resolved=withEffectiveRequirements(input), context=productRequirementContext(resolved);
    assert.equal(context.attributes[ownKey],ownValue);
    assert.ok(!Object.entries(context.attributeSources).some(([key,origin]) => (origin as {postNumber:string}).postNumber === "03.30.324.1" && key===parentKey));
    assert.ok(!resolved.effectiveRequirements.requirements.some(item=>item.property===property && item.source.kind==="parent"));
    assert.deepEqual(productRequirementAttributes(requirementForSearch(resolved)),productRequirementAttributes(resolved));
    assert.deepEqual(currentPostRequirement(resolved),resolved);
  });
}

test("own labelled source fields override inherited values before search, without extracted attributes",()=>{
  const input=row("Tilkobling til kjøleutstyr", "INNENDØRS ENERGIBÆRERLEDNING – RØRDEL", {"rørdel":"Tilkobl. av tekn. utstyr",trykk:"PN10",materiale:"Stål",materialkvalitet:"Bluepipe",dimensjon:"DN80"}, {}, "Materiale: Messing\nPN: 16\nDN: 25");
  const resolved=withEffectiveRequirements(input), attrs=productRequirementAttributes(resolved);
  assert.equal(attrs.Materiale,"Messing");
  assert.doesNotMatch(JSON.stringify(attrs),/Bluepipe|PN10|DN80|Stål/);
  assert.match(buildAhlsellRequirementGuide(resolved).searchQuery,/Messing DN25/);
  assert.ok(resolved.effectiveRequirements.requirements.some(item=>item.property==="pn"&&item.value===16&&item.source.kind==="post"));
});

test("saved corrections and free choice beat source text and parent aliases",()=>{
  const input=row("DN25", "INNENDØRS STENGEVENTIL", {trykk:"PN10",materiale:"Stål",skjøt:"Gjenget"}, {PN:16,material:"Valgfritt",connection:"Valfri"}, "Trykk: PN25\nMateriale: Messing\nSkjøt: Flens");
  const resolved=withEffectiveRequirements(input);
  assert.deepEqual(resolved.effectiveRequirements.requirements.filter(item=>item.property==="pn").map(item=>item.value),[16]);
  assert.ok(!resolved.effectiveRequirements.requirements.some(item=>["material","connection"].includes(item.property)));
});

test("title K and temperature replace parent values; included accessory DN does not",()=>{
  const input=row("SPRINKLER K80 68°C med adapter DN25", "SPRINKLER", {"k-faktor":"115","utløsningstemperatur":"93 °C",DN:"15"});
  const resolved=withEffectiveRequirements(input);
  for(const [property,value] of [["kFactor",80],["temperatureC",68],["dn",15]] as const)
    assert.deepEqual(resolved.effectiveRequirements.requirements.filter(item=>item.property===property).map(item=>item.value),[value]);
});

test("ambiguous own dimensions suppress parent dimension without becoming a verified scalar",()=>{
  for(const title of ["DN25–DN32","DN25/32"]){
    const resolved=withEffectiveRequirements(row(title,"INNENDØRS STENGEVENTIL",{dimensjon:"DN80"}));
    const dimensions=resolved.effectiveRequirements.requirements.filter(item=>item.property==="dn");
    assert.ok(dimensions.length>0);
    assert.ok(dimensions.every(item=>item.source.kind==="post"&&item.value===null&&item.issue));
  }
});

test("an own outside diameter replaces parent size without borrowing a steel DN conversion",()=>{
  const input=row("Kobberrør Ytre diameter=12", "INNENDØRS VANNLEDNING – KOMPLETT", {dimensjon:"DN80",materiale:"Stål",materialkvalitet:"AISI316"});
  const attrs=productRequirementAttributes(withEffectiveRequirements(input));
  assert.equal(attrs.materiale,"Kobber");
  assert.equal(attrs.materialkvalitet,undefined);
  assert.equal(attrs["ytre diameter"],"12 mm");
  assert.equal(attrs.dimensjon,undefined);
  assert.doesNotMatch(buildAhlsellRequirementGuide(input).searchQueries.join(" "),/DN80|88\.9/);
});

test("dimension and two-way variants keep the product parent after repeated projection",()=>{
  for(const [title,parentTitle,fields,query] of [
    ["Toveis - DN32","INNENDØRS REGULERINGSVENTIL",{trykk:"PN10",funksjon:"Innreguleringsventil"},/Reguleringsventil DN32/],
    ["DN20 Kaldtvann","SPYLEVENTIL",{materiale:"Messing"},/SPYLEVENTIL.*DN20.*Messing/],
    ["DN15 (30 mm)","ISOLERING AV RØRLEDNINGSDELER",{tykkelse:"40 mm","type produkt":"Rørskåler",isolasjonsmateriale:"Mineralull"},/Rørskåler.*DN15.*30 mm/],
    ["ø 15 /16 mm Med varerør","INNENDØRS VANNLEDNING I VARERØR – RØR",{"materialkvalitet vannrør":"PEX"},/PEX|Rør/]
  ] as Array<[string,string,Fields,RegExp]>){
    const input=row(title,parentTitle,fields);
    input.value_json.unit=parentTitle.startsWith("ISOLERING") ? "m" : "st";
    input.category=parentTitle==="SPYLEVENTIL" ? "valve" : "pipe";
    const current=withEffectiveRequirements(input);
    assert.ok(productRequirementContext(current).parent);
    assert.match(buildAhlsellRequirementGuide(current).searchQueries.join(" "),query);
    assert.deepEqual(buildAhlsellRequirementGuide(requirementForSearch(current)),buildAhlsellRequirementGuide(current));
    if(parentTitle.startsWith("ISOLERING")){
      assert.equal(productRequirementAttributes(current).tykkelse,"30 mm");
      assert.equal(genericProductIdentity(current),"rorskaler");
      assert.notEqual(classifyProductRequirement(current).intent,"pipe");
      assert.equal(classifyProductRequirement(current).category,"plumbing_other");
    }
  }
});

test("DN-prefixed unrelated products and tap accessories do not inherit parent product fields",()=>{
  for(const [title,parentTitle] of [["DN25 SPRINKLER","INNENDØRS VANNLEDNING"],["Aktiv lekkasjestopper med motorventil","BLANDEBATTERI UTEN TERMOSTAT"]])
    assert.equal(productRequirementContext(row(title,parentTitle,{materiale:"Messing",trykk:"PN10"})).parent,undefined);
});

test("all four equipment-connection siblings use the same relevant Bluepipe parent",()=>{
  for(const title of ["Tilkobling til kompressoranlegg for kjøling, tur og retur.","Tilkobling til Lakkeringsboks aggregat","Tilkobling til varmebatteri i ventilasjonsaggregat, tur og retur.","Tilkobling til gulvvarme skap"]){
    const input=row(title,"INNENDØRS ENERGIBÆRERLEDNING FOR VÆSKE – RØRDEL",{"rørdel":"Tilkobl. av tekn. utstyr",trykk:"PN10",materialkvalitet:"Bluepipe"});
    assert.deepEqual(buildAhlsellRequirementGuide(withEffectiveRequirements(input)).searchQueries,["Bluepipe overgang","Bluepipe union","Bluepipe kobling"]);
  }
});

test("inherited pipe stiffness SN8 is not rewritten as pressure class PN8",()=>{
  const input=row("75 mm","INNENDØRS AVLØPSLEDNING – TRYKKLØS – KOMPLETT",{trykk:"SN 8",materiale:"PVC"},{dimensjon:"75 mm"});
  input.value_json.unit="m";
  assert.doesNotMatch(buildAhlsellRequirementGuide(input).searchQueries.join(" "),/PN8/);
});
