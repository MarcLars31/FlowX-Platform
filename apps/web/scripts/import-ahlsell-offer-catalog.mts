/** Private catalog deployment. Dry-run by default; explicit --apply performs
 * an idempotent upload and records the import in catalog_imports.
 * Usage: node --import tsx --env-file=... scripts/import-ahlsell-offer-catalog.mts
 *   --file=<private catalog.json> --organization=<uuid> [--apply]
 * A changed existing catalog requires --expected-version=<observed version>.
 * Keep input data, snapshots and receipts out of Git/public static assets.
 */
import fs from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {parseAhlsellOfferCatalog,offerCatalogObjectPath} from '../src/lib/ahlsell-offer-catalog';
import {buildSupabaseHeaders} from '../src/lib/supabase-headers';
const args = new Map(process.argv.slice(2).map(arg => {const [key,...value]=arg.replace(/^--/,'').split('=');return [key,value.join('=')];}));
const file=args.get('file'); const org=args.get('organization');
if(!file||!org)throw Error('--file and --organization are required');
const body=await fs.readFile(file,'utf8');
if(Buffer.byteLength(body)>6_000_000)throw Error('Catalog exceeds size limit');
const raw=JSON.parse(body);const catalog=parseAhlsellOfferCatalog(raw,org);
if(!catalog||catalog.products.length===0)throw Error('Invalid or empty catalog');
const digest=createHash('sha256').update(body).digest('hex');
const base=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw Error('Backend configuration required');
const headers=buildSupabaseHeaders(key);
async function request(path:string,init:RequestInit={}){return fetch(new URL(path,base!.replace(/\/?$/,'/')),{...init,headers:{...headers,...init.headers},redirect:'error',signal:AbortSignal.timeout(20000)});}
const objectPath='storage/v1/object/product-documents/'+offerCatalogObjectPath(org);
const prior=await request(objectPath);let previousVersion:string|null=null;
if(prior.ok){const text=await prior.text();const existing=JSON.parse(text);previousVersion=existing.version;if(!parseAhlsellOfferCatalog(existing,org))throw Error('Existing catalog is invalid; refusing replacement');if(previousVersion===catalog.version&&createHash('sha256').update(text).digest('hex')!==digest)throw Error('Same catalog version has different content');}
else {const problem=await prior.json().catch(()=>null);if(prior.status!==404&&String(problem?.statusCode)!=='404')throw Error(`Cannot inspect existing catalog (${prior.status})`);}
const plan={organizationId:org,version:catalog.version,productCount:catalog.products.length,previousVersion,sha256:digest,changed:previousVersion!==catalog.version};
if(!args.has('apply')){console.log(JSON.stringify({mode:'dry_run',...plan}));}
else if(previousVersion===catalog.version){console.log(JSON.stringify({mode:'unchanged',...plan}));}
else {
if(previousVersion&&previousVersion!==catalog.version&&args.get('expected-version')!==previousVersion)throw Error('Existing catalog changed; pass its observed --expected-version before replacing it');
const orgResponse=await request(`rest/v1/organizations?id=eq.${org}&select=id`);
if(!orgResponse.ok||(await orgResponse.json()).length!==1)throw Error('Organization not found');
const importId=randomUUID();const started=new Date().toISOString();
async function audit(method:string,payload:unknown){const r=await request(`rest/v1/catalog_imports${method==='PATCH'?`?id=eq.${importId}`:''}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw Error(`Import audit failed (${r.status})`);}
await audit('POST',{id:importId,organization_id:org,import_type:'ahlsell_private_offer_catalog_v1',filename:`catalog-${digest}.json`,status:'running',total_rows:catalog.products.length,started_at:started});
try {
 const snapshot=objectPath.replace('/catalog.json',`/snapshots/${digest}.json`);
 const saved=await request(snapshot,{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'false'},body});
 if(!saved.ok&&saved.status!==409)throw Error(`Snapshot upload failed (${saved.status})`);
 if(saved.status===409){const old=await request(snapshot);if(!old.ok||createHash('sha256').update(await old.text()).digest('hex')!==digest)throw Error('Existing snapshot differs');}
 const uploaded=await request(objectPath,{method:'POST',headers:{'Content-Type':'application/json','x-upsert':previousVersion?'true':'false'},body});
 if(!uploaded.ok)throw Error(`Catalog upload failed (${uploaded.status})`);
 const readback=await request(objectPath);if(!readback.ok||createHash('sha256').update(await readback.text()).digest('hex')!==digest)throw Error('Catalog readback mismatch');
 await audit('PATCH',{status:'completed',successful_rows:catalog.products.length,completed_at:new Date().toISOString()});
 console.log(JSON.stringify({mode:'completed',importId,...plan}));
} catch(error){await audit('PATCH',{status:'failed',completed_at:new Date().toISOString()}).catch(()=>{});throw error;}
}
