import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const base = 'http://127.0.0.1:3100';
const run = process.env.RUN_LOCAL_PLATFORM_HTTP_TEST === '1' ? test : test.skip;
run('full local application opens customer and administration pages with actual sessions', async () => {
  const health = await fetch('http://127.0.0.1:54329/health');
  assert.equal((await health.json()).local, true);
  for (const [view, paths] of [
    ['customer', ['/dashboard', '/projects', '/projects/management', '/project-history', '/statistics', '/crm', '/regler', '/organization', '/organization/settings', '/organization/activity', '/organization/trash', '/settings', '/technical-descriptions', '/projects/new', '/imports']],
    ['admin', ['/admin', '/admin/review', '/admin/documents/failed', '/admin/sprsok', '/products', '/regler']]
  ]) {
    const login = await fetch(`${base}/api/local/session`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `view=${view}`, redirect: 'manual' });
    assert.equal(login.status, 303);
    assert.equal(new URL(login.headers.get('location')).origin, base);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    for (const path of paths) {
      const response = await fetch(base + path, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(45000) });
      const html = await response.text();
      assert.equal(response.status, 200, `${view} ${path}: HTTP ${response.status}`);
      assert.ok(!/Application error|data-next-error|"digest":"\d+"/.test(html), `${path}: server render failed`);
      assert.ok(html.includes('Utvecklingskopia'), `${path}: missing local environment label`);
      console.log(`${view} ${path} OK`);
    }
    if (view === 'customer') {
      const projects = await fetch(`${base}/api/projects`, { headers: { cookie } });
      assert.equal(projects.status, 200);
      const project = (await projects.json()).projects.find(project => project.name === 'Lokalt testprojekt');
      assert.ok(project);
      for (const suffix of ['', '/product-resolution', '/management']) {
        const response = await fetch(`${base}/projects/${project.id}${suffix}`, { headers: { cookie } });
        const html = await response.text();
        assert.equal(response.status, 200, `Project ${suffix}`);
        assert.ok(!/Application error|data-next-error|"digest":"\d+"/.test(html), `Project ${suffix} render failed`);
      }
    }
  }
});

run('PDF upload uses signed local storage and creates a persisted project', async () => {
  const login = await fetch(`${base}/api/local/session`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'view=customer', redirect: 'manual' });
  assert.equal(login.status, 303);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  ['LOKALT FUNKTIONSTEST - SCIPX', '31 SANITAERANLEGG', '31.1 Rorledninger', 'Postnr.    Beskrivelse                                 Enhet    Mengde', '31.1.1     UB1.111121 RORLEDNING AV KOBBER              m        20', 'Materiale: kobber. Nominell diameter: DN25.', '31.1.2     UL1.1111 AVSTENGNINGSVENTIL                 stk       4', 'Materiale: messing. Nominell diameter: DN25.'].forEach((text, index) => page.drawText(text, { x: 40, y: 790 - index * 34, size: 11, font }));
  const bytes = await pdf.save();
  const setup = await fetch(`${base}/api/technical-descriptions/upload`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: 'Lokalt funktionstest.pdf', size: bytes.length, contentType: 'application/pdf' }) });
  assert.equal(setup.status, 200, await setup.clone().text());
  const { uploadId, signedUrl } = await setup.json();
  assert.equal(new URL(signedUrl).origin, 'http://127.0.0.1:54329');
  const upload = await fetch(signedUrl, { method: 'PUT', headers: { Origin: base, 'Content-Type': 'application/pdf', 'Cache-Control': 'max-age=0' }, body: bytes });
  assert.equal(upload.status, 200, await upload.clone().text());
  const form = new FormData();
  form.set('uploadId', uploadId); form.set('fileName', 'Lokalt funktionstest.pdf'); form.set('createProject', 'true');
  const queued = await fetch(`${base}/api/technical-descriptions/jobs`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(queued.status, 202, await queued.clone().text());
  const { jobId } = await queued.json();
  assert.match(jobId ?? '', /^[a-f0-9-]{36}$/);
  let job;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const status = await fetch(`${base}/api/technical-descriptions/jobs?id=${jobId}`, { headers: { cookie } });
    assert.equal(status.status, 200, await status.clone().text());
    job = (await status.json()).jobs[0];
    if (['completed', 'failed', 'awaiting_ocr', 'cancelled'].includes(job.status)) break;
  }
  assert.equal(job.status, 'completed', JSON.stringify({ status: job.status, phase: job.phase, error: job.error_code, result: job.result }));
  assert.ok(job.project_id);
  const projects = await fetch(`${base}/api/projects`, { headers: { cookie } });
  assert.ok((await projects.json()).projects.some(project => project.id === job.project_id));
  console.log(`PDF_PROJECT_READY ${job.project_id}`);
});
