// v126 speed, part 3 (the early open): a whole document saved while the screen still shows this phone's copy at a
// start is put on the cloud's document as it is now (UMCore.merge3Doc) — only where the other side did not change the
// same part; the same part changed on both is a conflict (the save is refused and said, as the compare-and-set refuses).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const U = require(path.join(__dirname, '..', 'www', 'js', 'core.js'));
const clone = x => JSON.parse(JSON.stringify(x));

test('merge3Doc: an object — this phone\'s key and the other\'s key both land, nested', () => {
  const base = { Mariam: { revenue: 20000, brands: { Intensiv: 5000 } }, Renova: { revenue: 10000 }, month: '2026-11' };
  const mine = clone(base); mine.Renova.revenue = 15000;
  const theirs = clone(base); theirs.Mariam.revenue = 22222; theirs.Mariam.brands.TePe = 900;
  const r = U.merge3Doc(base, mine, theirs);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.value, { Mariam: { revenue: 22222, brands: { Intensiv: 5000, TePe: 900 } }, Renova: { revenue: 15000 }, month: '2026-11' });
  assert.deepStrictEqual(mine.Renova.revenue, 15000); assert.strictEqual(theirs.Renova.revenue, 10000); // inputs untouched
});

test('merge3Doc: the same part changed on both to different values is a conflict, named', () => {
  const base = { Renova: { revenue: 10000 } };
  const r = U.merge3Doc(base, { Renova: { revenue: 15000 } }, { Renova: { revenue: 11111 } });
  assert.deepStrictEqual(r, { ok: false, at: '.Renova.revenue' });
  // …the same change on both is not one
  assert.deepStrictEqual(U.merge3Doc(base, { Renova: { revenue: 15000 } }, { Renova: { revenue: 15000 } }), { ok: true, value: { Renova: { revenue: 15000 } } });
});

test('merge3Doc: a list of records by id — added, removed and changed on either side', () => {
  const base = [{ id: 'a', price: 1 }, { id: 'b', name: 'Brush' }, { id: 'c', price: 3 }, { id: 'x', price: 9 }];
  const mine = [{ id: 'a', price: 1 }, { id: 'b', name: 'Renamed' }, { id: 'x', price: 9 }, { id: 'n', price: 5 }];  // c removed here, n added here
  const theirs = [{ id: 'a', price: 7 }, { id: 'b', name: 'Brush' }, { id: 'c', price: 3 }, { id: 'd', price: 4 }]; // x removed there, d added there
  const r = U.merge3Doc(base, mine, theirs);
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(r.value, [{ id: 'a', price: 7 }, { id: 'b', name: 'Renamed' }, { id: 'n', price: 5 }, { id: 'd', price: 4 }]);
});

test('merge3Doc: a record changed on one side and removed on the other is a conflict', () => {
  const base = [{ id: 'a', price: 1 }];
  assert.strictEqual(U.merge3Doc(base, [{ id: 'a', price: 2 }], []).ok, false);
  assert.strictEqual(U.merge3Doc(base, [], [{ id: 'a', price: 2 }]).ok, false);
  // removed on one side, unchanged on the other: removed
  assert.deepStrictEqual(U.merge3Doc(base, [], [{ id: 'a', price: 1 }]), { ok: true, value: [] });
});

test('merge3Doc: nothing changed here takes the cloud\'s whole; nothing changed there keeps this phone\'s', () => {
  const base = { a: 1, b: [1, 2] };
  assert.deepStrictEqual(U.merge3Doc(base, clone(base), { a: 2, b: [3] }), { ok: true, value: { a: 2, b: [3] } });
  assert.deepStrictEqual(U.merge3Doc(base, { a: 5, b: [1, 2] }, clone(base)), { ok: true, value: { a: 5, b: [1, 2] } });
  // a list without ids changed on both sides: a conflict (never mixed)
  assert.strictEqual(U.merge3Doc(base, { a: 1, b: [1, 2, 3] }, { a: 1, b: [2] }).ok, false);
});

test('merge3Doc: keys are data — never through the prototype; a key added on both with one value is kept once', () => {
  const r = U.merge3Doc({}, JSON.parse('{"__proto__": {"x": 1}, "k": 2}'), { k: 2, j: 3 });
  assert.ok(r.ok);
  assert.strictEqual(Object.getPrototypeOf(r.value), Object.prototype);
  assert.deepStrictEqual(Object.keys(r.value).sort(), ['__proto__', 'j', 'k']);
  assert.strictEqual(({}).x, undefined);
});

test('merge3Doc: no document in the copy (created here and on another device) merges key by key', () => {
  assert.deepStrictEqual(U.merge3Doc(null, { a: 1 }, { b: 2 }), { ok: true, value: { a: 1, b: 2 } });
  assert.strictEqual(U.merge3Doc(null, { a: 1 }, { a: 2 }).ok, false);
});
