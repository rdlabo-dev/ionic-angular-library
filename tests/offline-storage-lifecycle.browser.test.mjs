import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test('Web Locks serialize resets across tabs and fence stale writers', { timeout: 60000 }, async (t) => {
  const bundle = await build({
    entryPoints: ['projects/kit/offline/src/lib/offline-storage-lifecycle.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'kitLifecycle', platform: 'browser',
  });
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/kit.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/kit.js' ? bundle.outputFiles[0].text : '<!doctype html><script src="/kit.js"></script>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  t.after(async () => {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const a = await context.newPage();
  const b = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await Promise.all([a.goto(origin), b.goto(origin)]);
  const initialize = async (page, generation) => page.evaluate((generation) => {
    const markerStore = {
      get: async ({ key }) => ({ value: localStorage.getItem(key) }),
      set: async ({ key, value }) => localStorage.setItem(key, value),
      remove: async ({ key }) => localStorage.removeItem(key),
    };
    const storage = {
      keys: async () => Object.keys(localStorage),
      remove: async (key) => {
        localStorage.setItem('deletions', String(Number(localStorage.getItem('deletions') ?? 0) + 1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        localStorage.removeItem(key);
      },
    };
    window.lifecycle = new kitLifecycle.OfflineStorageLifecycle({
      markerStore, generationKey: 'generation', markerKey: 'reset', generation,
      discardPendingCommands: true, target: { kind: 'web', storage },
    });
  }, generation);
  await a.evaluate(() => {
    localStorage.setItem('offline:rows', 'old');
    localStorage.setItem('token', 'preserved');
  });
  await Promise.all([initialize(a, 'one'), initialize(b, 'one')]);
  const results = await Promise.all([a.evaluate(() => lifecycle.prepare()), b.evaluate(() => lifecycle.prepare())]);
  assert.deepEqual(results.sort(), ['ready', 'rebuilt']);
  assert.equal(await a.evaluate(() => localStorage.getItem('deletions')), '1');
  await a.evaluate(() => lifecycle.run('exclusive', async () => localStorage.setItem('offline:rows', 'current')));
  assert.equal(await b.evaluate(() => lifecycle.run('shared', async () => localStorage.getItem('offline:rows'))), 'current');

  // Hold a real cross-tab operation open; a generation reset cannot pass it.
  await a.evaluate(() => {
    window.operationStarted = false;
    window.operation = lifecycle.run('exclusive', async () => {
      window.operationStarted = true;
      await new Promise((resolve) => { window.releaseOperation = resolve; });
      localStorage.setItem('offline:rows', 'old-in-flight');
    });
  });
  await a.waitForFunction(() => window.operationStarted);
  await initialize(b, 'two');
  await b.evaluate(() => { window.rebuilding = lifecycle.prepare(); });
  await b.waitForFunction(async () => (await navigator.locks.query()).pending.length === 1);
  assert.equal(await a.evaluate(() => localStorage.getItem('generation')), 'one');
  await a.evaluate(async () => { releaseOperation(); await operation; });
  assert.equal(await b.evaluate(() => rebuilding), 'rebuilt');
  assert.equal(await b.evaluate(() => localStorage.getItem('offline:rows')), null);
  assert.equal(await b.evaluate(() => localStorage.getItem('token')), 'preserved');
  assert.equal(await a.evaluate(async () => {
    try {
      await lifecycle.run('exclusive', async () => localStorage.setItem('offline:rows', 'stale'));
      return 'unexpected-write';
    } catch (error) { return error.name; }
  }), 'OfflineStorageGenerationChangedError');
  assert.equal(await b.evaluate(() => localStorage.getItem('offline:rows')), null);
});
