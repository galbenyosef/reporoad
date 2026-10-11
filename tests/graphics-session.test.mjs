import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsSession, webgl2Context } from '../lib/graphics-session.ts';

test('a failed session stays latched across dismissal and repeated failures', () => {
  const session = createGraphicsSession();
  let updates = 0;
  const unsubscribe = session.subscribe(() => updates++);
  session.fail('unavailable');
  session.setHelpOpen(false);
  for (let i = 0; i < 30; i++) session.fail('unavailable');
  assert.deepEqual(session.getSnapshot(), { attempt: 0, failure: 'unavailable', helpOpen: false });
  assert.equal(updates, 2);
  unsubscribe();
  session.retry();
  assert.equal(updates, 2);
});

test('only explicit retry clears failure, and stale callbacks cannot fail a new attempt', () => {
  const session = createGraphicsSession();
  session.fail('context-lost', 0);
  session.retry();
  session.fail('scene', 0);
  assert.deepEqual(session.getSnapshot(), { attempt: 1, failure: null, helpOpen: false });
  session.fail('unavailable', 1);
  assert.deepEqual(session.getSnapshot(), { attempt: 1, failure: 'unavailable', helpOpen: true });
});

test('WebGL2 check makes a single request, preserves attributes and handles denied contexts', () => {
  const attributes = { antialias: true, alpha: true };
  let calls = 0;
  const context = {};
  assert.equal(webgl2Context({ getContext(kind, options) {
    calls++;
    assert.equal(kind, 'webgl2');
    assert.equal(options, attributes);
    return context;
  } }, attributes), context);
  assert.equal(calls, 1);
  assert.equal(webgl2Context({ getContext: () => null }), null);
  assert.equal(webgl2Context({ getContext: () => { throw Error('Blocked by browser'); } }), null);
});
