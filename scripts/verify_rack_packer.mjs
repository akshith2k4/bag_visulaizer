#!/usr/bin/env node
/**
 * Verifies the rack packer end to end.
 *
 * Usage:
 *   npm run verify:rack
 *
 * Checks:
 *   - expected rack/shelf/stack counts for fixed baskets
 *   - no overlapping stacks on a shelf
 *   - every stack stays inside the usable shelf footprint
 *   - every stack stays within the 50.56 cm clearance
 *   - no empty shelves or empty racks
 *   - placed + unfitted item counts equal the basket counts
 *   - rotation output matches the placed footprint
 *   - repeated runs produce identical output
 */
import assert from 'node:assert/strict';
import { RackPacker } from '../src/algo/rackPacker.js';
import { PRODUCTS } from '../src/data/products.js';

const spec = { length: 130.6, width: 40.55, clearance: 50.56 };
const EPS = 1e-6;

function pack(basket) {
  return new RackPacker(spec).pack(basket, spec.clearance);
}

function close(a, b) {
  return Math.abs(a - b) <= EPS;
}

function plural(count, word) {
  if (count === 1) return `${count} ${word}`;
  return `${count} ${word === 'shelf' ? 'shelves' : `${word}s`}`;
}

function normalized(result) {
  return result.racks.map(rack => rack.shelves.map(shelf => shelf.stacks.map(stack => [
    stack.product.id,
    stack.count,
    stack.x.toFixed(6),
    stack.z.toFixed(6),
    stack.dx.toFixed(6),
    stack.dz.toFixed(6),
    stack.rot
  ].join(':'))));
}

function validate(name, result, basket) {
  assert.equal(result.racksRequired, result.racks.length, `${name}: rack count mismatch`);
  assert.equal(result.shelvesRequired, result.racks.reduce((n, rack) => n + rack.shelves.length, 0), `${name}: shelf count mismatch`);
  assert.equal(result.racksRequired, Math.ceil(result.shelvesRequired / 4), `${name}: shelves do not fill racks in groups of 4`);

  const expected = new Map();
  for (const entry of basket) {
    if (!entry.product || !(entry.count > 0)) continue;
    expected.set(entry.product.id, (expected.get(entry.product.id) || 0) + Math.floor(entry.count));
  }

  const actual = new Map();
  const halfLength = spec.length / 2;
  const halfWidth = spec.width / 2;

  for (const rack of result.racks) {
    assert.ok(rack.shelves.length > 0, `${name}: rack ${rack.rackIndex + 1} has no shelves`);
    const indices = new Set();

    for (const shelf of rack.shelves) {
      assert.ok(shelf.stacks.length > 0, `${name}: empty shelf in rack ${rack.rackIndex + 1}`);
      assert.ok(!indices.has(shelf.shelfIndex), `${name}: duplicate shelf index ${shelf.shelfIndex}`);
      indices.add(shelf.shelfIndex);

      const rects = [];
      for (const stack of shelf.stacks) {
        const product = stack.product;
        const left = stack.x - stack.dx / 2;
        const right = stack.x + stack.dx / 2;
        const front = stack.z - stack.dz / 2;
        const back = stack.z + stack.dz / 2;

        assert.ok(left >= -halfLength - EPS && right <= halfLength + EPS, `${name}: out of bounds on X: ${product.name}`);
        assert.ok(front >= -halfWidth - EPS && back <= halfWidth + EPS, `${name}: out of bounds on Z: ${product.name}`);
        assert.ok(stack.stackHeight > 0 && stack.stackHeight <= spec.clearance + EPS, `${name}: bad stack height: ${product.name}`);
        assert.ok(stack.count > 0, `${name}: empty stack: ${product.name}`);

        const normal = close(stack.dx, product.length) && close(stack.dz, product.width) && stack.rot === 0;
        const rotated = close(stack.dx, product.width) && close(stack.dz, product.length) && stack.rot === 90;
        assert.ok(normal || rotated, `${name}: rotation does not match footprint: ${product.name}`);

        for (const other of rects) {
          const overlaps =
            left < other.right - EPS &&
            right > other.left + EPS &&
            front < other.back - EPS &&
            back > other.front + EPS;
          assert.ok(!overlaps, `${name}: overlap ${product.name} / ${other.name}`);
        }
        rects.push({ name: product.name, left, right, front, back });

        actual.set(product.id, (actual.get(product.id) || 0) + stack.count);
      }
    }
  }

  for (const item of result.unfittedItems) {
    actual.set(item.productId, (actual.get(item.productId) || 0) + item.count);
  }

  for (const [id, count] of expected) {
    assert.equal(actual.get(id) || 0, count, `${name}: item count not conserved for ${id}`);
  }
  for (const id of actual.keys()) {
    assert.ok(expected.has(id), `${name}: unexpected product ${id}`);
  }
}

function runBenchmark(name, basket, expected) {
  const result = pack(basket);
  validate(name, result, basket);

  const actual = {
    racks: result.racksRequired,
    shelves: result.shelvesRequired,
    stacks: result.totalStacks,
    unfitted: result.unfittedItems.length
  };
  assert.deepEqual(actual, expected, `${name}: metrics changed`);
  assert.deepEqual(normalized(result), normalized(pack(basket)), `${name}: output is not deterministic`);

  console.log(
    `PASS  ${name}: ${plural(actual.racks, 'rack')}, ${plural(actual.shelves, 'shelf')}, ${plural(actual.stacks, 'stack')}` +
    (actual.unfitted ? `, ${actual.unfitted} unfitted` : '')
  );
  return result;
}

console.log(`Rack packer verification (${spec.length} x ${spec.width} cm deck, ${spec.clearance} cm clearance)\n`);

const all500 = PRODUCTS.map(product => ({ product, count: 500 }));
const pillow = PRODUCTS.find(product => product.id === 'pillow-cover');
const bathTowel = PRODUCTS.find(product => product.id === 'bath-towel');
const doubleSheet = PRODUCTS.find(product => product.id === 'double-bed-sheet');
const handTowel = PRODUCTS.find(product => product.id === 'hand-towel');

const fullResult = runBenchmark('500 of every SKU', all500, {
  racks: 20,
  shelves: 78,
  stacks: 208,
  unfitted: 0
});

const rotated = fullResult.racks
  .flatMap(rack => rack.shelves)
  .flatMap(shelf => shelf.stacks)
  .filter(stack => stack.rot === 90);
assert.ok(rotated.length > 0, 'rotation was never used');
console.log(`PASS  rotation used on ${rotated.length} of ${fullResult.totalStacks} stacks`);

runBenchmark('mixed 300 pillow / 190 bath towel / 90 double sheet', [
  { product: pillow, count: 300 },
  { product: bathTowel, count: 190 },
  { product: doubleSheet, count: 90 }
], { racks: 2, shelves: 6, stacks: 16, unfitted: 0 });

runBenchmark('190 bath towels', [{ product: bathTowel, count: 190 }], {
  racks: 1,
  shelves: 3,
  stacks: 12,
  unfitted: 0
});

runBenchmark('3000 pillows', [{ product: pillow, count: 3000 }], {
  racks: 1,
  shelves: 4,
  stacks: 19,
  unfitted: 0
});

runBenchmark('3000 hand towels', [{ product: handTowel, count: 3000 }], {
  racks: 4,
  shelves: 15,
  stacks: 57,
  unfitted: 0
});

runBenchmark('empty basket', [], { racks: 0, shelves: 0, stacks: 0, unfitted: 0 });

const oversized = { ...PRODUCTS[0], id: 'oversized', name: 'Oversized test item', length: 200, width: 100 };
const oversizedResult = pack([{ product: oversized, count: 3 }]);
validate('oversized item', oversizedResult, [{ product: oversized, count: 3 }]);
assert.equal(oversizedResult.racksRequired, 0, 'oversized item should not be racked');
assert.equal(oversizedResult.unfittedItems[0]?.count, 3, 'oversized item count not reported');
console.log('PASS  oversized item rejected');

const tooTall = { ...PRODUCTS[0], id: 'too-tall', name: 'Too tall test item', exactHeight: 60 };
const tooTallResult = pack([{ product: tooTall, count: 3 }]);
validate('too tall item', tooTallResult, [{ product: tooTall, count: 3 }]);
assert.equal(tooTallResult.racksRequired, 0, 'too tall item should not be racked');
assert.equal(tooTallResult.unfittedItems[0]?.count, 3, 'too tall item count not reported');
console.log('PASS  too tall item rejected');

let seed = 123456789;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

for (let i = 0; i < 100; i++) {
  const basket = PRODUCTS
    .filter(() => random() < 0.55)
    .map(product => ({ product, count: 1 + Math.floor(random() * 1200) }));
  if (basket.length === 0) basket.push({ product: PRODUCTS[0], count: 10 });
  validate(`random basket ${i + 1}`, pack(basket), basket);
}
console.log('PASS  100 randomized baskets: bounds, overlaps, heights, counts');

for (let i = 0; i < 100; i++) {
  const product = {
    id: `custom-${i}`,
    name: `Custom item ${i}`,
    length: 1 + random() * 150,
    width: 1 + random() * 50,
    exactHeight: 0.2 + random() * 8,
    category: ['A', 'B', 'C'][Math.floor(random() * 3)]
  };
  const basket = [{ product, count: 1 + Math.floor(random() * 100) }];
  validate(`custom item ${i + 1}`, pack(basket), basket);
}
console.log('PASS  100 custom-dimension baskets: including unfitted items');

console.log('\nAll rack packer checks passed.');
