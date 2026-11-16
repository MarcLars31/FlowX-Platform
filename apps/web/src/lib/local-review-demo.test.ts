import assert from 'node:assert/strict';
import test from 'node:test';
import { localReviewPersona } from './local-review-demo';
test('local role testing allows only fixed personas and a local UUID project path', () => {
  const id='11111111-1111-4111-8111-111111111111';
  assert.deepEqual(localReviewPersona('reviewer',id),{email:'granskare@scipx.local',path:`/projects/${id}/management`});
  for(const view of ['admin','someone@example.test','__proto__',null]) assert.equal(localReviewPersona(view,id),null);
  for(const path of [undefined,'https://example.test','../other',id+'/../../admin']) assert.equal(localReviewPersona('reviewer',path),null);
});
