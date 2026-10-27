/**
 * 3D Cuboid Bin Packing Engine for Linen Logistics
 * 
 * Implements 3D-BPP with:
 * 1. Yaw-only rotation rules (0° and 90° on the horizontal floor plane; thickness stays strictly vertical)
 * 2. Support surface constraints (prevent floating items and unphysical overhanging)
 * 3. Multi-bag partition (allocates items across as many Red Bags as needed)
 * 4. Fabric compression / squish factor integration
 */

export class Packer3D {
  constructor(bagSpec = { length: 83.0, width: 42.0, height: 47.0, maxWeight: 25.0 }) {
    this.bagSpec = bagSpec;
  }

  /**
   * Axis-aligned bounding box intersection check with floating-point tolerance
   */
  intersects(a, b) {
    const margin = 0.05;
    return (
      a.x < b.x + b.dx - margin &&
      a.x + a.dx > b.x + margin &&
      a.y < b.y + b.dy - margin &&
      a.y + a.dy > b.y + margin &&
      a.z < b.z + b.dz - margin &&
      a.z + a.dz > b.z + margin
    );
  }

  /**
   * Calculates the proportion of an item's bottom surface supported by items directly underneath or the bag base
   */
  getSupportRatio(candidate, packedItems) {
    // If resting on base floor (y == 0), 100% physically supported
    if (candidate.y <= 0.05) return 1.0;

    let supportedArea = 0;
    const candArea = candidate.dx * candidate.dz;

    for (const item of packedItems) {
      // Check if item's top surface is coplanar with candidate's bottom surface
      if (Math.abs(item.y + item.dy - candidate.y) < 0.15) {
        // Calculate 2D intersection on X-Z floor plane
        const xOverlap = Math.max(0, Math.min(candidate.x + candidate.dx, item.x + item.dx) - Math.max(candidate.x, item.x));
        const zOverlap = Math.max(0, Math.min(candidate.z + candidate.dz, item.z + item.dz) - Math.max(candidate.z, item.z));
        supportedArea += xOverlap * zOverlap;
      }
    }

    return candArea > 0 ? supportedArea / candArea : 0;
  }

  /**
   * Packs an array of items [{ product, count }] into Red Bags.
   * @param {Array} itemList - List of { product, count }
   * @param {Object} options - { squishFactor, supportThreshold, maxBags }
   * @returns {Object} { bagsRequired, bags, unfittedItems, allPacked }
   */
  pack(itemList, options = {}) {
    const squishFactor = options.squishFactor || 0;
    const supportThreshold = options.supportThreshold !== undefined ? options.supportThreshold : 0.65;
    const maxBags = options.maxBags || 10;

    // 1. Expand items into individual units with compressed thickness
    const expandedItems = [];
    itemList.forEach(entry => {
      const p = entry.product;
      const count = entry.count || 1;
      const itemH = p.exactHeight * (1 - squishFactor);
      for (let i = 0; i < count; i++) {
        expandedItems.push({
          id: p.id,
          name: p.name,
          color: p.color,
          trimColor: p.trimColor || '#cbd5e1',
          length: p.length,
          width: p.width,
          exactHeight: itemH,
          weight: p.weight || 0.35,
          unitIndex: i + 1,
          totalUnits: count,
          footprint: p.length * p.width,
          volume: p.length * p.width * itemH
        });
      }
    });

    // 2. Sort items: largest footprint first (heavier base layer stability)
    expandedItems.sort((a, b) => {
      if (Math.abs(b.footprint - a.footprint) > 10) {
        return b.footprint - a.footprint;
      }
      return b.volume - a.volume;
    });

    const bags = [];
    let remainingItems = [...expandedItems];

    // 3. Iteratively pack into Red Bags
    for (let bagIdx = 0; bagIdx < maxBags && remainingItems.length > 0; bagIdx++) {
      const packedInThisBag = [];
      const pivots = [{ x: 0, y: 0, z: 0 }];
      const unfittedInThisBag = [];

      for (const item of remainingItems) {
        let placed = false;

        // Sort candidate pivots: lowest Y first (gravity stacking), then lowest X, then lowest Z
        pivots.sort((a, b) => {
          if (Math.abs(a.y - b.y) > 0.05) return a.y - b.y;
          if (Math.abs(a.x - b.x) > 0.05) return a.x - b.x;
          return a.z - b.z;
        });

        // Yaw-only rotation rules:
        // Rot 0:  dx = length, dz = width,  dy = exactHeight
        // Rot 90: dx = width,  dz = length, dy = exactHeight
        // (dy is NEVER swapped because folded linen cannot balance on its thin edge!)
        const orientations = [
          { dx: item.length, dy: item.exactHeight, dz: item.width, rot: 0 },
          { dx: item.width, dy: item.exactHeight, dz: item.length, rot: 90 }
        ];

        pivotLoop:
        for (let pIdx = 0; pIdx < pivots.length; pIdx++) {
          const pivot = pivots[pIdx];

          for (const ori of orientations) {
            const candidate = {
              x: pivot.x,
              y: pivot.y,
              z: pivot.z,
              dx: ori.dx,
              dy: ori.dy,
              dz: ori.dz,
              rot: ori.rot
            };

            // Boundary check: must fit strictly within Red Bag dimensions
            if (
              candidate.x + candidate.dx > this.bagSpec.length + 0.05 ||
              candidate.y + candidate.dy > this.bagSpec.height + 0.05 ||
              candidate.z + candidate.dz > this.bagSpec.width + 0.05
            ) {
              continue;
            }

            // Collision check with previously packed items in this bag
            let collides = false;
            for (const existing of packedInThisBag) {
              if (this.intersects(candidate, existing)) {
                collides = true;
                break;
              }
            }
            if (collides) continue;

            // Physical support constraint (cannot float or overhang thin air)
            const support = this.getSupportRatio(candidate, packedInThisBag);
            if (support < supportThreshold) {
              continue;
            }

            // Valid placement found!
            const packedItem = {
              ...item,
              ...candidate,
              supportRatio: Math.round(support * 100)
            };
            packedInThisBag.push(packedItem);

            // Generate 3 new potential placement pivots
            pivots.push(
              { x: candidate.x + candidate.dx, y: candidate.y, z: candidate.z },
              { x: candidate.x, y: candidate.y, z: candidate.z + candidate.dz },
              { x: candidate.x, y: candidate.y + candidate.dy, z: candidate.z }
            );

            // Deduplicate and filter out-of-bounds pivots
            const filteredPivots = [];
            const seen = new Set();
            for (const pt of pivots) {
              const k = `${pt.x.toFixed(1)},${pt.y.toFixed(1)},${pt.z.toFixed(1)}`;
              if (
                !seen.has(k) &&
                pt.x < this.bagSpec.length &&
                pt.y < this.bagSpec.height &&
                pt.z < this.bagSpec.width
              ) {
                seen.add(k);
                filteredPivots.push(pt);
              }
            }
            pivots.length = 0;
            pivots.push(...filteredPivots);

            placed = true;
            break pivotLoop;
          }
        }

        if (!placed) {
          unfittedInThisBag.push(item);
        }
      }

      // Compute statistics for this bag
      if (packedInThisBag.length > 0) {
        const bagVolume = this.bagSpec.length * this.bagSpec.width * this.bagSpec.height;
        const packedVolume = packedInThisBag.reduce((sum, it) => sum + (it.dx * it.dy * it.dz), 0);
        const maxHeight = packedInThisBag.reduce((max, it) => Math.max(max, it.y + it.dy), 0);
        const totalWeight = packedInThisBag.reduce((sum, it) => sum + it.weight, 0);

        // Group item breakdown by product name
        const productCounts = {};
        packedInThisBag.forEach(it => {
          productCounts[it.name] = (productCounts[it.name] || 0) + 1;
        });

        bags.push({
          bagIndex: bagIdx,
          bagNumber: bagIdx + 1,
          bagName: `Red Bag #${bagIdx + 1}`,
          items: packedInThisBag,
          itemCount: packedInThisBag.length,
          productCounts,
          maxHeight: Number(maxHeight.toFixed(2)),
          totalWeight: Number(totalWeight.toFixed(2)),
          packedVolume: Math.round(packedVolume),
          bagVolume: Math.round(bagVolume),
          volumeUtilization: Number(((packedVolume / bagVolume) * 100).toFixed(1)),
          heightFits: maxHeight <= this.bagSpec.height + 0.05
        });
      }

      remainingItems = unfittedInThisBag;
    }

    return {
      bagsRequired: bags.length,
      bags,
      unfittedItems: remainingItems,
      allPacked: remainingItems.length === 0
    };
  }
}
