import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stabilizationDatabase, testOrganization } from "./stabilization-test-database";
import type { ChapterOrganization } from "../src/lib/chapter-organization";

test("chapter placement is atomic, persistent, revision checked and manager scoped without changing source posts", async()=>{
  const db=await stabilizationDatabase();
  try {
    const owner=await testOrganization(db), other=await testOrganization(db);
    const ids=[randomUUID(),randomUUID()], foreign=randomUUID();
    for(const [id,scope] of [...ids.map(id=>[id,owner] as const),[foreign,other] as const])
      await db.query("insert into project_requirements(id,project_id,organization_id,category,requirement_key,value_text,value_json,status) values($1,$2,$3,'general','chapter-source','Saved source',$4,'extracted_unreviewed')",[id,scope.project,scope.org,JSON.stringify({sourceText:'Keep all original text',reviewFlags:['unassigned-source-text']})]);
    const original=(await db.query('select id,value_json,value_text from project_requirements where id=any($1) order by id',[ids])).rows;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner.user]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.user,role:'authenticated'})]);
    await db.exec('set role authenticated');
    const save=async(revision:number,sourceIds=ids,target:string|null=null,title:string|null=null)=>(await db.query<{result:ChapterOrganization}>(
      'select save_project_chapter_organization($1,$2,$3,$4,$5) result',[owner.project,revision,sourceIds,target,title])).rows[0].result;
    const created=await save(0,ids,null,'Gemensamma krav');
    assert.equal(created.revision,1);assert.equal(created.customChapters.length,1);
    const target=created.customChapters[0].id;
    assert.ok(target.startsWith('custom:'));
    assert.deepEqual(created.placements,Object.fromEntries(ids.map(id=>[id,target])));
    await assert.rejects(save(0,ids,null,'Duplicate'),/changed; reload/);
    await assert.rejects(save(1,[ids[0],foreign],'pdf-chapter'),/not found in project/);
    await assert.rejects(save(1,ids,'custom:missing'),/Custom chapter not found/);
    await assert.rejects(db.query('update project_chapter_organization set placements=$1 where project_id=$2',['{}',owner.project]),/permission denied/);
    const moved=await save(1,[ids[0]],'pdf-chapter');
    assert.equal(moved.placements[ids[0]],'pdf-chapter');assert.equal(moved.placements[ids[1]],target);
    const undone=await save(2,[ids[1]]);
    assert.deepEqual(undone.placements,{[ids[0]]:'pdf-chapter'});
    assert.equal((await db.query<{revision:number}>('select revision from project_chapter_organization where project_id=$1',[owner.project])).rows[0].revision,3);
    assert.deepEqual((await db.query('select id,value_json,value_text from project_requirements where id=any($1) order by id',[ids])).rows,original);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other.user]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:other.user,role:'authenticated'})]);
    assert.equal((await db.query('select * from project_chapter_organization where project_id=$1',[owner.project])).rows.length,0);
    await assert.rejects(save(3,ids,null,'Unauthorized'),/manager access required/);
  } finally { await db.close(); }
});

test("legacy family placement expands atomically before an individual move and undo",async()=>{
  const db=await stabilizationDatabase();
  try {
    const owner=await testOrganization(db), other=await testOrganization(db);
    const [parent,first,second,foreign]=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
    for(const id of [parent,first,second,foreign]){
      const scope=id===foreign?other:owner;
      await db.query("insert into project_requirements(id,project_id,organization_id,category,requirement_key,value_text,value_json,status) values($1,$2,$3,'general','individual-chapter-test','Original',$4,'extracted_unreviewed')",[id,scope.project,scope.org,JSON.stringify({sourceText:'Keep original'})]);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner.user]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.user,role:'authenticated'})]);
    await db.exec('set role authenticated');
    await db.query('select save_project_chapter_organization($1,0,$2,$3)',[owner.project,[parent],'chapter-a']);
    const base={[parent]:'chapter-a',[first]:'chapter-a',[second]:'chapter-a'};
    const save=async(revision:number,ids:string[],target:string|null,normalized:Record<string,string>=base)=>(await db.query<{result:ChapterOrganization}>(
      'select save_individual_chapter_organization($1,$2,$3,$4,null,$5) result',[owner.project,revision,ids,target,JSON.stringify(normalized)])).rows[0].result;
    await assert.rejects(save(1,[first],'chapter-b',{...base,[foreign]:'chapter-a'}),/Invalid legacy/);
    await assert.rejects(save(1,[foreign],'chapter-b'),/not found in project/);
    assert.deepEqual((await db.query<{placements:Record<string,string>}>('select placements from project_chapter_organization where project_id=$1',[owner.project])).rows[0].placements,{[parent]:'chapter-a'});
    const moved=await save(1,[first],'chapter-b');
    assert.deepEqual(moved.placements,{...base,[first]:'chapter-b'});
    assert.equal((await db.query<{placement_version:number}>('select placement_version from project_chapter_organization where project_id=$1',[owner.project])).rows[0].placement_version,2);
    await assert.rejects(save(1,[second],'chapter-c'),/changed; reload/);
    const undone=await save(2,[second],null);
    assert.deepEqual(undone.placements,{[parent]:'chapter-a',[first]:'chapter-b'});
    const again=await save(3,[first],'chapter-c');
    assert.deepEqual(again.placements,{[parent]:'chapter-a',[first]:'chapter-c'});
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other.user]);
    await assert.rejects(save(4,[first],'chapter-a'),/manager access required/);
  } finally { await db.close(); }
});
