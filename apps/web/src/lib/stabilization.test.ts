import test from "node:test";
import assert from "node:assert/strict";
import {authRequest,AuthServiceUnavailableError} from "./auth-transport";
import {createSingleFlight,withCallerAbort} from "./single-flight";
import {consumeRateLimit} from "./request-rate-limit";
import {resolveRequirementOverviews} from "./project-overview-cache";

test("auth preserves invalid sessions separately from upstream and transport outages",async()=>{
 for (const status of [429,500,503]) await assert.rejects(authRequest('https://auth.example',{},async()=>new Response(null,{status})),AuthServiceUnavailableError);
 await assert.rejects(authRequest('https://auth.example',{},async()=>{throw new TypeError('offline')}),AuthServiceUnavailableError);
 assert.equal((await authRequest('https://auth.example',{},async(_url,init)=>{assert.ok(init?.signal);return new Response(null,{status:401})})).status,401);
});
test("identical concurrent lookups share work and caller cancellation is isolated",async()=>{
 const flight=createSingleFlight<string>();let calls=0,finish:(value:string)=>void=()=>undefined;
 const work=()=>{calls++;return new Promise<string>(resolve=>{finish=resolve})};
 const first=flight('article',work), second=flight('article',work);await Promise.resolve();
 const controller=new AbortController();const cancelled=withCallerAbort(first,controller.signal);controller.abort();
 await assert.rejects(cancelled);finish('product');assert.equal(await second,'product');assert.equal(calls,1);
 assert.equal(await flight('article',async()=>{calls++;return 'fresh'}),'fresh');assert.equal(calls,2);
});
test("fresh high-cardinality limiter traffic is evicted without losing recent protection",()=>{
 const now=Date.now();assert.equal(consumeRateLimit('oldest',1,60_000,now).allowed,true);
 for(let i=0;i<10000;i++)consumeRateLimit(`fresh-${i}`,1,60_000,now);
 assert.equal(consumeRateLimit('fresh-9999',1,60_000,now).allowed,false);
 assert.equal(consumeRateLimit('oldest',1,60_000,now).allowed,true);
});
test("cold overview uses eight reads for 3850 posts and does not await cache writes",async()=>{
 const heads=Array.from({length:3850},(_,i)=>({id:String(i),edit_revision:0,updated_at:'2026-10-12T10:00:00Z'}));
 let reads=0,writes=0;const deferred:Array<()=>Promise<void>>=[];
 const result=await resolveRequirementOverviews(heads,{batchSize:500,loadDetails:async ids=>{reads++;return ids.map(id=>({...heads[Number(id)],value_text:'Pipe',value_json:{postNumber:id,quantity:1,unit:'m'}}))},save:async()=>{writes++},defer:work=>{deferred.push(work)}});
 assert.equal(result.length,3850);assert.equal(reads,8);assert.equal(writes,0);
 await deferred[0]();assert.equal(writes,8);
});
