import test from 'node:test';
import assert from 'node:assert/strict';
import { actionableManagementSnapshot, managementChapters, managementMainPosts, type HierarchyPost, type HierarchySnapshot } from './project-management-hierarchy';
const post=(id:string,order:number):HierarchyPost=>({id,number:`31.311.2.${order}`,title:'DN'+order,chapter:'31 SANITÆR',chapterKey:'pdf-a:31',assignmentId:null,dueDate:null,ownDeadline:null,deadlineRevision:-1,canEdit:true,done:false,revision:-1,openHelp:0,sourcePage:16,sourceOrder:order,sourceChapter:{title:'31 SANITÆR'},measurement:{unit:'m',quantity:90},mainPost:{id:'main',number:'31.311.2',title:'AVLØPSLEDNING',standalone:false}});
const data:HierarchySnapshot={projectId:'project',name:'Example',userId:'manager',manager:true,settings:null,departments:[],members:[],assignments:[],posts:[post('two',2),post('one',1)]};
test('both chapter views preserve ordered product IDs and do not count the main heading',()=>{
 for(const mode of ['pdf','main'] as const) {
  const groups=managementChapters(data,mode);assert.equal(groups.length,1);assert.deepEqual(groups[0].posts.map(p=>p.id),['one','two']);
 }
 assert.equal(managementChapters(data,'main')[0].title,'31.311.2 AVLØPSLEDNING');
 assert.equal(managementMainPosts(data.posts,[]).length,1);
 assert.equal(data.departments.length,0);
});
test('non-product text is excluded and a hidden chapter anchor still resolves by chapter key',()=>{
 const heading={...post('heading',0),measurement:{}};
 const input={...data,posts:[heading,...data.posts],assignments:[{id:'assignment',scope_type:'pdf_chapter' as const,scope_value:'heading',chapter_key:'pdf-a:31',assigned_to:'lead',department_id:'department',due_date:null,revision:2}]};
 const snapshot=actionableManagementSnapshot(input);
 assert.equal(snapshot.posts.length,2);assert.equal(managementChapters(snapshot)[0].anchor,'heading');
});
test('uncertain parent stays reviewable even when a PDF chapter exists',()=>{
 const groups=managementChapters({...data,posts:[{...post('one',1),mainPost:null,hierarchyReview:true}]});
 assert.equal(groups[0].review,true);assert.equal(groups[0].scope,'post');
});
