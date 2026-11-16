import assert from 'node:assert/strict';
import test from 'node:test';
import { validDirectAssignment } from './direct-project-assignment';
const uid='00000000-0000-4000-8000-000000000001';
const request={targets:[{scope_type:'pdf_chapter',scope_value:uid}],assignee:uid,mode:'explicit',replaceOverrides:false,version:'a'.repeat(32)};
test('assignment API validation rejects ambiguous modes, malformed targets and unbounded batches',()=>{
  assert.equal(validDirectAssignment(request),true);
  assert.equal(validDirectAssignment({...request,mode:'inherit',assignee:null}),true);
  for(const patch of [{mode:'inherit'},{assignee:null},{targets:[]},{targets:Array(501).fill(request.targets[0])},{targets:[null]},{targets:[{scope_type:'chapter',scope_value:uid}]},{targets:[{scope_type:'post',scope_value:'bad'}]},{replaceOverrides:'true'},{version:null}]) assert.equal(validDirectAssignment({...request,...patch}),false);
});
