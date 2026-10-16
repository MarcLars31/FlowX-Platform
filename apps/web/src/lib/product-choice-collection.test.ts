import test from "node:test";
import assert from "node:assert/strict";
import { productChoiceSnapshots } from "./product-choice-collection";
import { validateDistributorProductChoices } from "./distributor-product-mapping";
import { buildProjectMaterialRows, createProjectMaterialListWorkbook } from "./project-material-list-export";
import ExcelJS from "exceljs";
const requirementId="10000000-0000-4000-8000-000000000001";
const input=(number:string)=>({entryMethod:"catalog",productName:"Produkt "+number,productNumber:number,
  orderQuantity:{quantity:5,unit:"st"},accessories:[{name:"Kupling",productNumber:"2222222",quantity:3,unit:"st",quantityBasis:"total"}]});
test("validates multiple products independently and rejects duplicate main articles and invalid accessories",()=>{
  const body={requirementId,userApproved:true,products:[input("1118751"),input("1118646")]};
  const result=validateDistributorProductChoices(body);
  assert.ok("data" in result); assert.equal(result.data.products.length,2);
  assert.equal(result.data.products[1].accessories[0].quantity,3);
  for(const products of [[],[input("1118751"),input("NRF 1118751")],[input("1118751"),{...input("1118646"),orderQuantity:{quantity:-1,unit:"st"}}],
    [input("1118751"),{...input("1118646"),accessories:[{name:"Fel",quantity:-1}]}],Array.from({length:21},(_,i)=>input(String(i)))]) {
    assert.ok("error" in validateDistributorProductChoices({...body,products}));
  }
  assert.ok("error" in validateDistributorProductChoices({...body,userApproved:false}));
});
test("reads old single choices and uses the collection without counting the compatibility copy",()=>{
  const first={name:"Rør",productNumber:"1118751"};const second={name:"Ventil",productNumber:"3333333"};
  assert.deepEqual(productChoiceSnapshots(first),[first]);
  assert.deepEqual(productChoiceSnapshots({...first,products:[first,second]}),[first,second]);
  assert.deepEqual(productChoiceSnapshots({...first,products:[]}),[]);
});
test("exports every product with its own quantity and accessories, and drops only the removed bundle",async()=>{
  const a={name:"Rør",productNumber:"1118751",orderQuantity:{quantity:10,unit:"m"},accessories:[{name:"Kupling A",productNumber:"2222222",quantity:3,unit:"st",quantityBasis:"total"}]};
  const b={name:"Ventil",productNumber:"3333333",orderQuantity:{quantity:2,unit:"st"},accessories:[{name:"Kupling B",productNumber:"2222222",quantity:7,unit:"st",quantityBasis:"total"}]};
  const requirements=[{id:requirementId,category:"pipe",requirement_key:"post",value_text:"Komplett",value_json:{postNumber:"33.332.2.1",quantity:45,unit:"m"}}];
  const assignment={id:"selection",requirement_id:requirementId,status:"selected",selected_at:null,
    product_snapshot:{...a,source:"distributor_manual",approvedByUser:true,approvalStatus:"user_approved",products:[a,b]}};
  const rows=buildProjectMaterialRows({requirements,assignments:[assignment]});
  assert.deepEqual(rows.map(r=>[r.type,r.productNumber,r.quantity,r.unit]),[
    ["Huvudprodukt","1118751",10,"m"],["Tillbehör","2222222",3,"st"],["Huvudprodukt","3333333",2,"st"],["Tillbehör","2222222",7,"st"]]);
  const remaining=buildProjectMaterialRows({requirements,assignments:[{...assignment,product_snapshot:{...assignment.product_snapshot,...b,products:[b]}}]});
  assert.deepEqual(remaining.map(r=>r.quantity),[2,7]);
  const bytes=await createProjectMaterialListWorkbook({organizationName:"Test",project:{id:"p",name:"Test",project_number:null,customer_name:null,end_customer:null,standard:null,system_type:null,supplier:null,status:"analysis"},rows});
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as never);
  const sheet=workbook.getWorksheet("Materiallista")!;
  assert.equal(sheet.getCell("I6").value,"1118751"); assert.equal(sheet.getCell("I8").value,"3333333");
  assert.equal(sheet.getCell("K9").value,7);
});

test("product comments stay on their own product when multiple choices share a post",async()=>{
  const products=[{productNumber:"1118751",name:"Rør"},{productNumber:"7654321",name:"Ventil"}];
  const rows=buildProjectMaterialRows({requirements:[{id:requirementId,category:"pipe",requirement_key:"post",value_text:"Komplett",value_json:{postNumber:"33.332.2.1",quantity:2,unit:"st"}}],
    assignments:[{id:"choice",requirement_id:requirementId,status:"selected",selected_at:null,product_snapshot:{...products[0],products,source:"distributor_manual",approvedByUser:true,approvalStatus:"user_approved"}}]});
  const comments=products.map((product,index)=>({id:String(index),requirement_id:requirementId,product_number:product.productNumber,product_name:product.name,body:"Kommentar till "+product.name,author_name:"Test",created_at:"2026-10-11T10:00:00Z"}));
  const bytes=await createProjectMaterialListWorkbook({organizationName:"Test",project:{id:"p",name:"Test",project_number:null,customer_name:null,end_customer:null,standard:null,system_type:null,supplier:null,status:"analysis"},rows,comments});
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as never);
  const sheet=workbook.getWorksheet("Materiallista")!;
  assert.match(String(sheet.getCell("O6").value),/Kommentar till Rør/);assert.doesNotMatch(String(sheet.getCell("O6").value),/Ventil/);
  assert.match(String(sheet.getCell("O7").value),/Kommentar till Ventil/);assert.doesNotMatch(String(sheet.getCell("O7").value),/Rør/);
  assert.equal(workbook.getWorksheet("Kommentarer")!.rowCount,5);
});
