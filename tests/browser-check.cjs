const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..');
const output = require('node:os').tmpdir();
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const page = await context.newPage(); const errors = []; const writes = []; const blobs = new Map(); const docs = new Map(); const images = new Map();
  page.on('pageerror', e => errors.push(e.message));
  for (const key of ['accueil','contenu','institutionnel','aftermovies','shooting','etalonnage']) {
    const path = key === 'accueil' ? 'data/accueil.json' : `data/services/${key}.json`;
    docs.set(path, { sha: `original-${key}`, data: JSON.parse(await fs.readFile(`${root}/${path}`, 'utf8')) });
  }
  let tree = [], cloud = false, commits = 0;
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://identity.netlify.com/**', route => route.fulfill({ contentType: 'text/javascript', body: `const handlers={}; const user={id:'tom',email:'tom@example.test',user_metadata:{full_name:'Tom Carvalho'},jwt:async()=> 'test-token'}; window.netlifyIdentity={currentUser:()=>user,on:(name,fn)=>handlers[name]=fn,init:()=>handlers.init?.(user),close:()=>{},open:()=>{},logout:async()=>handlers.logout?.()};` }));
  await context.route('**/.netlify/functions/media-sign', async route => {
    if (route.request().method() === 'GET') return route.fulfill({json: { configured: cloud, limits: { video: 100*1024*1024, image: 30*1024*1024 }, error: 'Stockage vidéo à connecter.' }});
    const req = route.request().postDataJSON();
    return route.fulfill({json: { kind: req.kind, cloudName: 'test-cloud', apiKey:'test-key', params: {timestamp:123,public_id:'portfolio-tom/video/test',overwrite:false}, signature:'signed'}});
  });
  await context.route('**/.netlify/git/github/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace('/.netlify/git/github',''); const body = req.postData() ? req.postDataJSON() : null;
    if (req.method() !== 'GET') writes.push({path,body});
    if (path === '/branches/main') return route.fulfill({json:{commit:{sha:`head-${commits}`}}});
    if (path.startsWith('/contents/')) { const doc=docs.get(path.slice(10)); return route.fulfill({json:{sha:doc.sha,content:Buffer.from(JSON.stringify(doc.data)).toString('base64')}}); }
    if (path === '/git/blobs') { const sha=`blob-${blobs.size}`; blobs.set(sha,body); return route.fulfill({json:{sha}}); }
    if (path.startsWith('/git/commits/')) return route.fulfill({json:{tree:{sha:'tree'}}});
    if (path === '/git/trees') { tree=body.tree; return route.fulfill({json:{sha:'new-tree'}}); }
    if (path === '/git/commits') return route.fulfill({json:{sha:'new-commit'}});
    if (path === '/git/refs/heads/main') { for(const entry of tree){const blob=blobs.get(entry.sha); if(entry.path.startsWith('data/'))docs.set(entry.path,{sha:entry.sha,data:JSON.parse(blob.content)});else images.set('/'+entry.path,Buffer.from(blob.content,'base64'));} commits++; return route.fulfill({json:{object:{sha:'new-commit'}}}); }
    throw new Error(`Unknown path ${path}`);
  });
  await context.route('**/data/**', route => { const doc=docs.get(new URL(route.request().url()).pathname.slice(1)); return doc ? route.fulfill({json:doc.data}) : route.fallback(); });
  await context.route('**/img/uploads/**', route => { const data=images.get(new URL(route.request().url()).pathname); return data ? route.fulfill({body:data,contentType:'image/webp'}) : route.fallback(); });
  await page.goto('http://127.0.0.1:8080/admin/'); await page.locator('.media-card').first().waitFor({timeout:10000}).catch(async e=>{console.log(await page.locator('body').innerText(),errors);await page.screenshot({path:`${output}/tom-admin-error.png`});throw e;});
  assert.equal(await page.locator('[data-section="projets"] .media-card').count(),3);
  await page.screenshot({path:`${output}/tom-admin-desktop.png`,fullPage:true});
  const chooser = page.waitForEvent('filechooser'); await page.locator('[data-action="upload"][data-list="projets"]').click();
  await (await chooser).setFiles([`${root}/img/DSC00203.jpg`,`${root}/img/DSC00912.jpg`]);
  await page.waitForFunction(()=>document.querySelectorAll('[data-section="projets"] .media-card').length===5);
  await page.waitForFunction(()=>document.querySelectorAll('.upload-row').length===2 && [...document.querySelectorAll('.upload-detail')].every(e=>e.textContent.includes('Prêt')));
  assert.equal(writes.length,0,'photos must not publish before explicit action');
  await page.locator('[data-list="projets"][data-action="edit"]').first().click();
  await page.locator('[name="titre"]').fill('Essai São João 🎬'); await page.getByRole('button',{name:'Garder les modifications'}).click();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Brouillon sur'));
  const popupPromise=page.waitForEvent('popup'); await page.locator('#preview').click(); const preview=await popupPromise;
  await preview.locator('.admin-preview-banner').waitFor(); assert.equal(await preview.locator('.work-grid .card').count(),5);
  assert.match(await preview.locator('.work-grid').innerText(),/Essai São João/i); await preview.close();
  await page.reload(); await page.locator('#restore-draft').waitFor(); await page.locator('#restore-draft').click();
  assert.equal(await page.locator('[data-section="projets"] .media-card').count(),5);
  assert.match(await page.locator('[data-section="projets"] .media-card').last().locator('img').getAttribute('src'),/^data:image\/webp/);
  page.on('dialog',dialog=>dialog.accept());
  for(let i=0;i<5;i++) await page.locator('[data-action="delete"][data-list="galerie"]').first().click();
  assert.equal(await page.locator('[data-section="galerie"] .media-card').count(),0);
  await page.locator('#publish').click(); await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Enregistré'));
  assert.equal(commits,1); assert.equal(docs.get('data/accueil.json').data.galerie.length,0); assert.equal(images.size,2);
  const publicPage=await context.newPage(); await publicPage.goto('http://127.0.0.1:8080/'); await publicPage.waitForFunction(()=>document.querySelectorAll('.work-grid .card').length===5);
  assert.equal(await publicPage.locator('.gal-grid figure').count(),0); await publicPage.close();
  await page.locator('[data-page="contenu"]').click(); await page.waitForFunction(()=>document.querySelector('#page-title').textContent.includes('Création'));
  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:`${output}/tom-admin-mobile.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile horizontal overflow');
  await page.locator('[data-list="medias"][data-action="edit"]').first().click();
  assert.equal(await page.locator('#edit-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true); await page.locator('#cancel-dialog').click();
  // Missing storage must leave the page untouched, with a recoverable upload error.
  let videoChooser=page.waitForEvent('filechooser'); await page.locator('[data-action="upload"][data-list="medias"]').click();
  await (await videoChooser).setFiles({name:'film.mp4',mimeType:'video/mp4',buffer:Buffer.from('test-video')});
  await page.locator('.upload-row.failed').waitFor(); assert.match(await page.locator('.upload-detail').innerText(),/pas encore connecté/);
  assert.equal(await page.locator('.media-card').count(),5);
  cloud=true; await page.reload(); await page.waitForFunction(()=>document.querySelector('#media-status').textContent.includes('connectées'));
  const chunks=[];let retry=false;
  await context.route('https://api.cloudinary.com/**',async route=>{
    const headers=route.request().headers();const range=headers['content-range']; chunks.push(range);
    if(range?.startsWith('bytes 6291456-')&&!retry){retry=true;return route.fulfill({status:503,json:{error:{message:'Temporary network failure'}}});}
    return route.fulfill({json: range?.endsWith('-12583011/12583012')?{done:true,secure_url:'https://res.cloudinary.com/test-cloud/video/upload/v1/portfolio-tom/video/test.mp4',public_id:'portfolio-tom/video/test',version:1,resource_type:'video',format:'mp4'}:{done:false}});
  });
  const sample=await fs.readFile(`${__dirname}/fixtures/playback.webm`);const poster=await fs.readFile(`${root}/img/DSC00203.jpg`);
  await context.route('https://res.cloudinary.com/**', route=>route.fulfill({body:route.request().url().endsWith('.mp4')?sample:poster,contentType:route.request().url().endsWith('.mp4')?'video/webm':'image/jpeg'}));
  videoChooser=page.waitForEvent('filechooser');await page.locator('[data-action="upload"][data-list="projets"]').click();
  await (await videoChooser).setFiles({name:'Dernier tournage.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(12583012)});
  await page.waitForFunction(()=>document.querySelector('.upload-detail')?.textContent.includes('Prêt'));
  assert.equal(chunks.length,4);assert.equal(chunks[1],chunks[2]);
  assert.equal(await page.locator('[data-section="projets"] .media-card').count(),6);
  const videoPreviewPromise=page.waitForEvent('popup');await page.locator('#preview').click();const videoPreview=await videoPreviewPromise;
  await videoPreview.setViewportSize({width:390,height:844});await videoPreview.locator('[data-play-video]').click();
  await videoPreview.waitForFunction(()=>document.querySelector('.portfolio-video-dialog video').currentTime>0);
  assert.equal(await videoPreview.locator('.portfolio-video-dialog').evaluate(d=>d.open),true);
  await videoPreview.getByRole('button',{name:'Fermer la vidéo'}).click();
  await videoPreview.waitForFunction(()=>!document.querySelector('.portfolio-video-dialog video').hasAttribute('src'));
  assert.equal(await videoPreview.locator('.portfolio-video-dialog video').getAttribute('src'),null);await videoPreview.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: batch photo optimization; no premature publication; edit; preview; IndexedDB restoration; empty gallery; atomic publication; services; mobile; missing video configuration; video chunk retry; actual video playback and close.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
