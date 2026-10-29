/**
 * Mixed-bag 3D packer built on binpack3d.
 *
 * Uses binpack3d's low-level Bin/Item engine for rotation scoring, gravity
 * settling, stability checks and AABB collision handling, while keeping the
 * domain policies that matter for folded linen:
 *
 *   1. Footprint-first item ordering (large flat items before small thick ones)
 *   2. Lowest-Y / X / Z pivot search, so the bag floor fills before stacking
 *   3. Yaw-only rotations via `updown: false` (0° / 90°, thickness stays vertical)
 *   4. Fabric squish applied to item thickness before packing
 *
 * Weight is intentionally NOT enforced for now: `maxWeight` is effectively
 * infinite, matching the previous visualizer behaviour.
 */

import { Bin, Item } from 'binpack3d';

const DECIMALS = 2;
const SCALE = 10 ** DECIMALS;
const VOLUME_SCALE = SCALE ** 3;
const NO_WEIGHT_LIMIT = 1e9; // kg — deliberately not a real constraint
const EPS = 0.05;

export const DEFAULT_SUPPORT_THRESHOLD = 0.65;

export class MixedBagPacker {
  constructor(bagSpec = { length: 83.0, width: 42.0, height: 47.0 }) {
    this.bagSpec = bagSpec;
  }

  /**
   * Packs an array of items [{ product, count }] into Red Bags.
   * @param {Array} itemList - List of { product, count }
   * @param {Object} options - { squishFactor, supportThreshold, maxBags }
   * @returns {Object} Same shape as the legacy Packer3D result
   */
  pack(itemList, options = {}) {
    const squishFactor = options.squishFactor || 0;
    const supportThreshold = options.supportThreshold ?? DEFAULT_SUPPORT_THRESHOLD;
    const maxBags = options.maxBags || 10;

    const units = this._expand(itemList, squishFactor);
    if (units.length === 0) {
      return {
        bagsRequired: 0,
        bags: [],
        unfittedItems: [],
        allPacked: true,
        summary: this._buildSummary([], [], []),
      };
    }

    // Domain ordering: footprint first, then volume. This prevents small thick
    // items from building towers before large flat sheets get a chance to lay
    // on the floor.
    units.sort((a, b) => {
      if (Math.abs(b.footprint - a.footprint) > 10) {
        return b.footprint - a.footprint;
      }
      return b.volume - a.volume;
    });

    let remaining = units.map(data => ({
      data,
      item: new Item({
        partno: `${data.product.id}#${data.unitIndex}`,
        name: data.product.name,
        // binpack3d axes: W = bag length (X), H = bag height (Y), D = bag width (Z)
        whd: [data.length, data.itemHeight, data.width],
        weight: data.weight,
        // Yaw-only: keeps the folded thickness vertical, like the old packer.
        updown: false,
        color: data.product.color,
      }, DECIMALS),
    }));

    const bags = [];

    for (let bagIdx = 0; bagIdx < maxBags && remaining.length > 0; bagIdx++) {
      const bin = new Bin({
        partno: `red-bag-${bagIdx + 1}`,
        whd: [this.bagSpec.length, this.bagSpec.height, this.bagSpec.width],
        maxWeight: NO_WEIGHT_LIMIT,
        supportSurfaceRatio: supportThreshold,
        fixPoint: true,
        checkStable: true,
      }, DECIMALS);

      const placed = [];
      const rejected = [];
      const pivots = [[0, 0, 0]];
      const pivotKeys = new Set(['0,0,0']);

      for (const entry of remaining) {
        let placedOk = false;

        // Fill the lowest available space first. binpack3d's own high-level
        // packer walks pivots in insertion order, which tends to build towers.
        pivots.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]) || (a[2] - b[2]));

        for (const pivot of pivots) {
          if (!bin.putItem(entry.item, pivot)) continue;

          const dim = entry.item.getDimension();
          const [x, y, z] = entry.item.position;
          this._addPivot(pivots, pivotKeys, [x + dim[0], y, z], bin);
          this._addPivot(pivots, pivotKeys, [x, y, z + dim[2]], bin);
          this._addPivot(pivots, pivotKeys, [x, y + dim[1], z], bin);

          placed.push(entry);
          placedOk = true;
          break;
        }

        if (!placedOk) rejected.push(entry);
      }

      if (placed.length > 0) {
        bags.push(this._buildBag(bagIdx, placed));
      }

      remaining = rejected;

      // All bags are identical. If nothing fit in this one, nothing will fit
      // in the next one either.
      if (placed.length === 0) break;
    }

    const unfittedReason = remaining.length > 0 && bags.length >= maxBags ? 'max_bags' : 'no_space';

    return {
      bagsRequired: bags.length,
      bags,
      unfittedItems: remaining.map(entry => ({
        id: entry.data.product.id,
        name: entry.data.product.name,
        count: 1,
        reason: unfittedReason,
      })),
      allPacked: remaining.length === 0,
      summary: this._buildSummary(bags, units, remaining),
    };
  }

  _buildSummary(bags, units, remaining) {
    const totalUnits = units.length;
    const packedUnits = bags.reduce((sum, bag) => sum + bag.itemCount, 0);
    const packedWeight = bags.reduce((sum, bag) => sum + bag.totalWeight, 0);
    const totalWeight = units.reduce((sum, unit) => sum + unit.weight, 0);
    const packedVolume = bags.reduce((sum, bag) => sum + bag.packedVolume, 0);
    const bagVolume = Math.round(this.bagSpec.length * this.bagSpec.width * this.bagSpec.height);
    const overallVolumeUtilization = bags.length > 0
      ? Number(((packedVolume / (bagVolume * bags.length)) * 100).toFixed(1))
      : 0;

    return {
      totalUnits,
      packedUnits,
      unfitUnits: remaining.length,
      totalWeight: Number(totalWeight.toFixed(2)),
      packedWeight: Number(packedWeight.toFixed(2)),
      overallVolumeUtilization,
      bagsRequired: bags.length,
      bagVolume,
    };
  }

  _expand(itemList, squishFactor) {
    const units = [];

    for (const entry of itemList) {
      const p = entry.product;
      const count = entry.count || 1;
      const itemHeight = Math.max(0.01, p.exactHeight * (1 - squishFactor));

      for (let i = 0; i < count; i++) {
        units.push({
          product: p,
          unitIndex: i + 1,
          totalUnits: count,
          length: p.length,
          width: p.width,
          itemHeight,
          weight: p.weight ?? 0.35,
          footprint: p.length * p.width,
          volume: p.length * p.width * itemHeight,
        });
      }
    }

    return units;
  }

  _addPivot(pivots, pivotKeys, point, bin) {
    const [x, y, z] = point;

    if (x < 0 || y < 0 || z < 0) return;
    if (x >= bin.whd[0] || y >= bin.whd[1] || z >= bin.whd[2]) return;

    const key = `${x},${y},${z}`;
    if (pivotKeys.has(key)) return;

    pivotKeys.add(key);
    pivots.push(point);
  }

  _buildBag(bagIdx, placed) {
    const items = placed.map(entry => {
      const p = entry.data.product;
      const dim = entry.item.getDimension();

      return {
        id: p.id,
        name: p.name,
        color: p.color,
        trimColor: p.trimColor || '#cbd5e1',
        length: p.length,
        width: p.width,
        exactHeight: entry.data.itemHeight,
        weight: entry.data.weight,
        unitIndex: entry.data.unitIndex,
        totalUnits: entry.data.totalUnits,
        footprint: entry.data.footprint,
        volume: (dim[0] * dim[1] * dim[2]) / VOLUME_SCALE,
        x: entry.item.position[0] / SCALE,
        y: entry.item.position[1] / SCALE,
        z: entry.item.position[2] / SCALE,
        dx: dim[0] / SCALE,
        dy: dim[1] / SCALE,
        dz: dim[2] / SCALE,
        // updown:false only allows WHD (0) and DHW (3)
        rot: entry.item.rotationType === 3 ? 90 : 0,
        supportRatio: 100,
      };
    });

    // Area-based support ratio for the tooltip, matching the legacy packer.
    for (const item of items) {
      if (item.y <= EPS) {
        item.supportRatio = 100;
        continue;
      }

      let supported = 0;
      const area = item.dx * item.dz;

      for (const other of items) {
        if (other === item) continue;
        if (Math.abs(other.y + other.dy - item.y) >= 0.15) continue;

        const xOverlap = Math.max(0, Math.min(item.x + item.dx, other.x + other.dx) - Math.max(item.x, other.x));
        const zOverlap = Math.max(0, Math.min(item.z + item.dz, other.z + other.dz) - Math.max(item.z, other.z));
        supported += xOverlap * zOverlap;
      }

      item.supportRatio = area > 0 ? Math.round(Math.min(1, supported / area) * 100) : 100;
    }

    const maxHeight = Number(items.reduce((max, it) => Math.max(max, it.y + it.dy), 0).toFixed(2));
    const totalWeight = Number(items.reduce((sum, it) => sum + it.weight, 0).toFixed(2));
    const packedVolume = Math.round(items.reduce((sum, it) => sum + it.dx * it.dy * it.dz, 0));
    const bagVolume = Math.round(this.bagSpec.length * this.bagSpec.width * this.bagSpec.height);

    const productCounts = {};
    for (const item of items) {
      productCounts[item.name] = (productCounts[item.name] || 0) + 1;
    }

    return {
      bagIndex: bagIdx,
      bagNumber: bagIdx + 1,
      bagName: `Red Bag #${bagIdx + 1}`,
      items,
      itemCount: items.length,
      productCounts,
      maxHeight,
      totalWeight,
      packedVolume,
      bagVolume,
      volumeUtilization: bagVolume > 0
        ? Number(((packedVolume / bagVolume) * 100).toFixed(1))
        : 0,
      heightFits: maxHeight <= this.bagSpec.height + EPS,
    };
  }
}
