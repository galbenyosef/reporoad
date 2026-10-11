// Run against a local dev server: npm run test:graphics:browser
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';

const baseURL = process.env.REPOROAD_TEST_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use a local test server');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const repository = { fullName: 'test/repository', name: 'repository', stars: 12345, language: 'TypeScript', description: '', defaultBranch: 'main', fetchedAt: Date.now(), configStatus: 'custom', building: { version: 1, style: 'woodland', color: '#778565', roof: 'gable', garden: true, signText: '', support: {} } };
async function open(fault, viewport = { width: 1280, height: 900 }, path = '/') {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Isolate UI verification from D1, GitHub, music and real chat messages.
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/repositories') return route.fulfill({ json: { repositories: [repository], source: 'test' } });
    if (pathname === '/api/chat') return route.fulfill({ json: { messages: [{ id: 1, name: 'Test', body: 'Test chat is available', createdAt: Date.now() }], signedIn: true, signInUrl: '/' } });
    if (pathname === '/api/github/session') return route.fulfill({ json: {} });
    if (pathname === '/api/presence') return route.fulfill({ json: { online: 1, now: Date.now() } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.addInitScript(fault => {
    window.__graphicsFault = fault;
    window.__webglCalls = 0;
    window.__webglContexts = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, attributes) {
      if (kind !== 'webgl2') return original.call(this, kind, attributes);
      window.__webglCalls++;
      if (window.__graphicsFault === 'unavailable') return null;
      if (window.__graphicsFault === 'throw') throw Error('Test: WebGL blocked');
      const gl = original.call(this, kind, attributes);
      if (gl) {
        window.__webglContexts.push(gl);
        if (window.__graphicsFault === 'constructor') gl.getShaderPrecisionFormat = () => { throw Error('Test: renderer setup failure'); };
      }
      return gl;
    };
  }, fault);
  await page.goto(baseURL + path);
  return { page, context, errors };
}
async function modal(page) {
  const dialog = page.getByRole('dialog', { name: '3D graphics unavailable' });
  await dialog.waitFor({ timeout: 30000 });
  return dialog;
}
async function addEditor(page) {
  await page.getByRole('tab', { name: 'Add', exact: true }).click();
  // Current Sites source has an accordion; GitHub main has the same editor expanded.
  const customise = page.getByRole('button', { name: 'Customise', exact: true });
  if (await customise.count() && await customise.getAttribute('aria-expanded') !== 'true') await customise.click();
  await page.getByLabel('Sign text', { exact: true }).waitFor();
}
async function dismiss(page) {
  await (await modal(page)).getByRole('button', { name: 'Continue without 3D' }).click();
  await page.getByRole('dialog', { name: '3D graphics unavailable' }).waitFor({ state: 'hidden' });
}
async function screenshot(page, name) {
  if (!process.env.REPOROAD_SCREENSHOTS) return;
  await mkdir(process.env.REPOROAD_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.REPOROAD_SCREENSHOTS}/${name}.png`, fullPage: true });
}
try {
  for (const fault of ['unavailable', 'throw', 'constructor']) {
    const { page, context, errors } = await open(fault);
    const dialog = await modal(page);
    assert.match(await dialog.innerText(), /chrome:\/\/settings\/system/);
    assert.equal(await page.evaluate(() => window.__webglCalls), 1);
    assert.equal(await page.locator('canvas').count(), 0);
    if (fault === 'unavailable') await screenshot(page, 'webgl-unavailable');
    await dismiss(page);
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search repositories' }).fill('no-such-repository');
    await page.getByText('No matching repositories.').waitFor();
    await addEditor(page);
    await page.getByLabel('Sign text', { exact: true }).fill('Preserved draft');
    const downloadButton = page.getByRole('button', { name: /Get repo file|Download.*(?:YAML|reporoad)/ });
    if (await downloadButton.count()) {
      const downloaded = page.waitForEvent('download');
      await downloadButton.click();
      const download = await downloaded;
      assert.match(download.suggestedFilename(), /^\.?reporoad\.yml$/);
      assert.match(await readFile(await download.path(), 'utf8'), /Preserved draft/);
    }
    await page.getByRole('tab', { name: 'Chat', exact: true }).click();
    await page.getByRole('textbox', { name: 'Chat message' }).fill('Local test only');
    assert.equal(await page.getByRole('button', { name: 'Send message' }).isEnabled(), true);
    await addEditor(page);
    assert.equal(await page.getByLabel('Sign text', { exact: true }).inputValue(), 'Preserved draft');
    // Multiple clock ticks and tab remounts must not schedule renderer attempts.
    await page.waitForTimeout(2500);
    assert.equal(await page.evaluate(() => window.__webglCalls), 1);
    assert.equal(await page.getByRole('dialog').count(), 0);
    const failedRoots = await page.evaluate(async () => {
      const entry = performance.getEntriesByType('resource').find(entry => /\/@react-three_fiber\.js/.test(entry.name));
      if (!entry) throw Error('Fiber module was not observed');
      return (await import(entry.name))._roots.size;
    });
    assert.equal(failedRoots, 0, 'Failed initialization releases the Fiber root registry');
    await page.getByRole('button', { name: 'Graphics help' }).first().click();
    await (await modal(page)).getByRole('button', { name: 'Try Again' }).click();
    await page.waitForFunction(() => window.__webglCalls === 2);
    await modal(page);
    assert.equal(await page.evaluate(() => window.__webglCalls), 2);
    assert.equal(await page.getByLabel('Sign text', { exact: true }).inputValue(), 'Preserved draft');
    assert.deepEqual(errors, [], `${fault}: no unhandled browser errors`);
    console.log(`PASS ${fault}: one attempt, dismissal, Chat/Explore/Add, draft retention, explicit retry`);
    await context.close();
  }
  {
    const { page, context, errors } = await open('unavailable', { width: 390, height: 844 });
    const dialog = await modal(page);
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
    await dialog.getByRole('button', { name: 'Try Again' }).focus();
    await page.keyboard.press('Tab');
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Focus stays inside the modal');
    await screenshot(page, 'webgl-unavailable-mobile');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log('PASS mobile: viewport fit, keyboard focus, Escape dismissal, tab access');
    await context.close();
  }
  {
    const { page, context, errors } = await open('none');
    await page.waitForFunction(() => window.__reporoadRenderProbe?.submittedFrames > 2, undefined, { timeout: 60000 });
    assert.equal(await page.getByRole('dialog').count(), 0);
    await screenshot(page, 'webgl-working');
    await page.evaluate(() => window.__webglContexts[0].getExtension('WEBGL_lose_context').loseContext());
    await modal(page);
    assert.equal(await page.locator('canvas').count(), 0);
    const calls = await page.evaluate(() => window.__webglCalls);
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.__webglCalls), calls);
    await dismiss(page);
    await addEditor(page);
    await page.getByLabel('Sign text', { exact: true }).fill('Survives recovery');
    await page.getByRole('button', { name: 'Graphics help' }).first().click();
    await (await modal(page)).getByRole('button', { name: 'Try Again' }).click();
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 2 && window.__reporoadRenderProbe?.submittedFrames > 2, undefined, { timeout: 60000 });
    await page.waitForTimeout(2000);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.getByLabel('Sign text', { exact: true }).inputValue(), 'Survives recovery');
    assert.deepEqual(errors, []);
    console.log('PASS working WebGL, context loss, no automatic retries, recovery of both canvases');
    await context.close();
  }
  {
    const { page, context, errors } = await open('unavailable', undefined, '/?broadcast=1');
    await modal(page);
    await dismiss(page);
    await page.getByRole('button', { name: 'Exit broadcast view' }).click();
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__webglCalls), 1);
    assert.deepEqual(errors, []);
    console.log('PASS broadcast failure and exit to usable community UI');
    await context.close();
  }
} finally {
  await browser.close();
}
