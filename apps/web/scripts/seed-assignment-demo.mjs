import { readFile } from 'node:fs/promises';
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
  const existing = (await db.query("select value from local_runtime.settings where key='unified-assignment-demo-v1'")).rows[0]?.value;
  if (existing) {
    console.log(`Lokalt exempel finns: http://127.0.0.1:3100/projects/${existing}/management`);
  } else {
    await db.exec('begin');
    const owner = (await db.query('select id from auth.users where email=$1', [CUSTOMER_EMAIL])).rows[0]?.id;
    if (!owner) throw new Error('Lokalt kundkonto saknas');
    const org = (await db.query("select organization_id from organization_members where user_id=$1 and status='active' order by created_at limit 1", [owner])).rows[0].organization_id;
    const sprinkler = randomUUID(), vvs = randomUUID();
    await db.query("insert into teams(id,organization_id,name) values($1,$3,'Sprinkler · demo'),($2,$3,'VVS · demo')", [sprinkler, vvs, org]);
    const people = [];
    for (const [name, team] of [['Anna Demo', sprinkler], ['Erik Demo', sprinkler], ['Ola Demo', vvs]]) {
      const id = randomUUID(); people.push(id);
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.test`]);
      await db.query('update profiles set display_name=$2 where id=$1', [id, name]);
      const member = (await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='full_user' and organization_id is null returning id", [org, id])).rows[0].id;
      await db.query('insert into team_members(team_id,organization_member_id) values($1,$2)', [team, member]);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: owner, role: 'authenticated' })]);
    await db.exec('set local role authenticated');
    const project = (await db.query("select create_project_with_defaults($1,null,'Fordeling – lokalt eksempel',requested_customer_name=>'Demokunde',requested_country_code=>'NO',requested_standard=>'NS',requested_owner_user_id=>$2) id", [org, owner])).rows[0].id;
    await db.exec('reset role');
    const posts = [];
    for (const [index, title] of ['Sprinklerhoder K80', 'Ventilsentral', 'Sprinklerrør DN50', 'Sanitærarmatur', 'Vannledning DN25', 'Avstengningsventiler'].entries()) {
      const id = randomUUID(); posts.push(id);
      await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,$4,$5,'extracted_unreviewed')", [id, org, project, title, JSON.stringify({ postNumber: `${index < 3 ? 33 : 31}.0${index % 3 + 1}`, sourceOrder: index, sourceChapter: { title: index < 3 ? '33 Brannslokking' : '31 Sanitær' }, quantity: [40, 1, 120, 6, 80, 12][index], unit: [2, 4].includes(index) ? 'm' : 'stk', localTestData: true })]);
    }
    await db.exec('set local role authenticated');
    await db.query('select save_project_management($1,$2,-1)', [project, JSON.stringify({ deadline: '2026-12-15', departments: [{ department_id: sprinkler, supervisor_id: people[0] }, { department_id: vvs, supervisor_id: people[2] }] })]);
    for (const [scope, rid, team, person] of [['pdf_chapter', posts[0], sprinkler, people[0]], ['post', posts[1], sprinkler, people[1]], ['pdf_chapter', posts[3], vvs, null]]) {
      const version = (await db.query('select read_project_management($1) data', [project])).rows[0].data.assignmentVersion;
      await db.query("select assign_project_work_unified($1,$2,$3,'explicit',false,$4,$5,null,false)", [project, JSON.stringify([{ scope_type: scope, scope_value: rid }]), person, version, team]);
    }
    await db.query('select update_project_task($1,$2,-1,true)', [project, posts[0]]);
    await db.exec('reset role');
    await db.query("insert into local_runtime.settings(key,value) values('unified-assignment-demo-v1',$1)", [project]);
    await db.exec('commit');
    console.log(`Lokalt exempel skapat: http://127.0.0.1:3100/projects/${project}/management`);
  }
} catch (error) { await db.exec('rollback').catch(() => {}); throw error; }
finally { await db.close(); }
