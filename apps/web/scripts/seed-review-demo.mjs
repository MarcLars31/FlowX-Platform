import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalPlatformEnvironment } from './local-platform/environment.mjs';
import { readLocalPlatformBranch } from './local-platform/git.mjs';
import { openDatabase, CUSTOMER_EMAIL } from './local-platform/database.mjs';
import { credentialsAt, passwordHash } from './local-platform/server.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assertLocalPlatformEnvironment(process.env, readLocalPlatformBranch(web));
const directory = resolve(web, '.local-platform');
try {
  const lock = JSON.parse(await readFile(resolve(directory, 'runtime.lock'), 'utf8'));
  let running = false;
  try { process.kill(lock.pid, 0); running = true; } catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (running) throw new Error('Stoppa den lokala servern innan exempeldatan skapas.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const credentials = await credentialsAt(directory);
const db = await openDatabase(directory, resolve(web, '../..'), passwordHash(credentials.password));
try {
  let project = (await db.query("select value from local_runtime.settings where key='work-review-demo-v1'")).rows[0]?.value;
  if (!project) {
    await db.exec('begin');
    const manager = (await db.query('select id from auth.users where email=$1', [CUSTOMER_EMAIL])).rows[0].id;
    const org = (await db.query("select organization_id from organization_members where user_id=$1 and status='active' order by created_at limit 1", [manager])).rows[0].organization_id;
    const people=[];
    for (const [email,name] of [['medarbetare@scipx.local','Linnea · medarbetare'],['granskare@scipx.local','Karin · granskare']]) {
      const id=randomUUID(); people.push(id);
      await db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,email,JSON.stringify({role:'customer',local_test_account:true})]);
      await db.query('update profiles set display_name=$2 where id=$1',[id,name]);
      await db.query('insert into local_runtime.accounts values($1,$2)',[id,passwordHash(credentials.password)]);
      await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='engineer' and organization_id is null",[org,id]);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[manager]);
    await db.exec('set local role authenticated');
    project=(await db.query("select create_project_with_defaults($1,null,'Roller och granskning – lokalt exempel',requested_customer_name=>'Demokund',requested_country_code=>'NO',requested_standard=>'NS',requested_owner_user_id=>$2) id",[org,manager])).rows[0].id;
    await db.exec('reset role');
    const posts=[];
    for (const [index,title] of ['Sprinklerhuvud K80','Ventil DN50','Rörledning DN50'].entries()) {
      const id=randomUUID();posts.push(id);
      await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,$4,$5,'extracted_unreviewed')",[id,org,project,title,JSON.stringify({postNumber:`33.0${index+1}`,sourceChapter:{title:'33 Brandsläckning'},quantity:[12,2,30][index],unit:index===2?'m':'stk',localTestData:true})]);
    }
    await db.exec('set local role authenticated');
    await db.query('select save_project_management($1,$2,-1)',[project,JSON.stringify({deadline:'2026-12-20',departments:[],review_required:true,reviewer_id:people[1]})]);
    const version=(await db.query('select read_project_management($1) data',[project])).rows[0].data.assignmentVersion;
    await db.query("select assign_project_work_direct($1,$2,$3,'explicit',false,$4)",[project,JSON.stringify([{scope_type:'pdf_chapter',scope_value:posts[0]}]),people[0],version]);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[people[0]]);
    await db.exec('set local role authenticated');
    await db.query('select update_project_task($1,$2,-1,true)',[project,posts[0]]);
    await db.exec('reset role');
    await db.query("insert into local_runtime.settings(key,value) values('work-review-demo-v1',$1)",[project]);
    await db.exec('commit');
  }
  await writeFile(resolve(directory,'review-demo.json'),JSON.stringify({project}));
  console.log(`Lokalt rollexempel: http://127.0.0.1:3100/projects/${project}/management`);
} catch(error) { await db.exec('rollback').catch(()=>{});throw error; }
finally { await db.close(); }
