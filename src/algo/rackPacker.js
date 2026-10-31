const EPS = 0.01;
const MIX_UTILIZATION = 0.30;
const SHELVES_PER_RACK = 4;

/**
 * Rack packer:
 * 1. Converts SKU quantities into vertical stacks (1D).
 * 2. Groups stacks by category and sorts each group largest-area first.
 * 3. Packs stacks onto shelves using MaxRects + best-fit with rotation.
 * 4. Assembles shelves into 4-tier racks.
 *
 * The packer is deliberately conservative about category mixing:
 * a shelf from another category is only eligible while it is below 30% full.
 */
export class RackPacker {
  constructor(shelfSpec = { length: 130.6, width: 40.55, clearance: 50.56 }) {
    this.shelfSpec = {
      length: Number(shelfSpec.length) || 130.6,
      width: Number(shelfSpec.width) || 40.55,
      clearance: Number(shelfSpec.clearance) || 50.56
    };
  }

  pack(basket, maxStackHeight) {
    if (!Array.isArray(basket) || basket.length === 0) {
      return this._emptyResult();
    }

    const stackLimit = Math.max(0, Number(maxStackHeight) || this.shelfSpec.clearance);
    const { stacks: allStacks, unfittedItems } = this._buildStacks(basket, stackLimit);
    const shelves = [];

    // Preserve category grouping; pack each category largest-first.
    const grouped = new Map();
    for (const stack of allStacks) {
      if (!grouped.has(stack.category)) grouped.set(stack.category, []);
      grouped.get(stack.category).push(stack);
    }

    const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b));

    for (const category of categories) {
      const stacks = grouped.get(category).sort((a, b) =>
        (b.area - a.area) ||
        (b.stackHeight - a.stackHeight) ||
        a.product.name.localeCompare(b.product.name)
      );

      for (const stack of stacks) {
        // Global best fit: evaluate every eligible open shelf and every free rectangle.
        const placement = this._findBestPlacement(shelves, stack, category);

        if (placement) {
          this._place(
            shelves[placement.shelfIndex],
            stack,
            placement.freeRect,
            placement.orientation,
            category
          );
          continue;
        }

        // Open a candidate shelf, but only keep it if the stack actually fits.
        // This removes the old phantom empty-shelf behaviour.
        const candidate = this._createShelf(category);
        const newPlacement = this._findBestOnShelf(candidate, stack);

        if (newPlacement) {
          this._place(candidate, stack, newPlacement.freeRect, newPlacement.orientation, category);
          shelves.push(candidate);
        } else {
          unfittedItems.push({
            name: stack.product.name,
            count: stack.count,
            dimensions: `${stack.dx} × ${stack.dz} cm`,
            reason: `Exceeds shelf ${this.shelfSpec.length} × ${this.shelfSpec.width} cm`
          });
        }
      }
    }

    const packedShelves = shelves.filter(shelf => shelf.stacks.length > 0);
    const shelvesRequired = packedShelves.length;
    const racksRequired = Math.ceil(shelvesRequired / SHELVES_PER_RACK) || 0;
    const racks = Array.from({ length: racksRequired }, (_, i) => ({
      rackIndex: i,
      shelves: []
    }));

    packedShelves.forEach((shelf, idx) => {
      // Shift coordinates so (0,0) is the shelf centre for Three.js.
      for (const stack of shelf.stacks) {
        stack.x = stack.x - (this.shelfSpec.length / 2) + (stack.dx / 2);
        stack.z = stack.z - (this.shelfSpec.width / 2) + (stack.dz / 2);
      }

      const rackIndex = Math.floor(idx / SHELVES_PER_RACK);
      racks[rackIndex].shelves.push({
        shelfIndex: idx % SHELVES_PER_RACK,
        utilization: Number((this._getUtilization(shelf) * 100).toFixed(1)),
        stacks: shelf.stacks
      });
    });

    return {
      racksRequired,
      shelvesRequired,
      totalStacks: packedShelves.reduce((sum, shelf) => sum + shelf.stacks.length, 0),
      racks,
      unfittedItems
    };
  }

  _emptyResult() {
    return {
      racksRequired: 0,
      shelvesRequired: 0,
      totalStacks: 0,
      racks: [],
      unfittedItems: []
    };
  }

  _buildStacks(basket, maxStackHeight) {
    const stacks = [];
    const unfittedItems = [];

    for (const entry of basket) {
      const product = entry.product;
      const count = Math.max(0, Math.floor(Number(entry.count) || 0));

      if (!product || count === 0) continue;

      const dimensions = product && Number.isFinite(product.length) && Number.isFinite(product.width)
        ? `${product.length} × ${product.width} cm`
        : 'invalid dimensions';

      if (!(product.exactHeight > 0) || !(product.length > 0) || !(product.width > 0)) {
        unfittedItems.push({
          productId: product.id,
          name: product.name || 'Unknown item',
          count,
          dimensions,
          reason: 'Invalid product dimensions'
        });
        continue;
      }

      const footprintFits =
        (product.length <= this.shelfSpec.length + EPS && product.width <= this.shelfSpec.width + EPS) ||
        (product.width <= this.shelfSpec.length + EPS && product.length <= this.shelfSpec.width + EPS);

      if (!footprintFits) {
        unfittedItems.push({
          productId: product.id,
          name: product.name,
          count,
          dimensions,
          reason: `Exceeds shelf ${this.shelfSpec.length} × ${this.shelfSpec.width} cm`
        });
        continue;
      }

      if (product.exactHeight > maxStackHeight + 1e-9) {
        unfittedItems.push({
          productId: product.id,
          name: product.name,
          count,
          dimensions: `${dimensions} × ${product.exactHeight.toFixed(2)} cm high`,
          reason: `Item is taller than the ${maxStackHeight.toFixed(2)} cm shelf clearance`
        });
        continue;
      }

      const itemsPerStack = Math.max(1, Math.floor((maxStackHeight + 1e-9) / product.exactHeight));
      let remaining = count;

      while (remaining > 0) {
        const itemsInStack = Math.min(itemsPerStack, remaining);
        const stackHeight = Math.min(maxStackHeight, itemsInStack * product.exactHeight);

        stacks.push({
          product,
          count: itemsInStack,
          stackHeight: Number(stackHeight.toFixed(2)),
          dx: product.length,
          dz: product.width,
          area: product.length * product.width,
          category: product.category || 'General'
        });

        remaining -= itemsInStack;
      }
    }

    return { stacks, unfittedItems };
  }

  _createShelf(category) {
    return {
      stacks: [],
      categories: new Set([category]),
      freeRects: [{
        x: 0,
        z: 0,
        w: this.shelfSpec.length,
        h: this.shelfSpec.width
      }]
    };
  }

  _findBestPlacement(shelves, stack, category) {
    let best = null;

    for (let shelfIndex = 0; shelfIndex < shelves.length; shelfIndex++) {
      const shelf = shelves[shelfIndex];
      if (!this._isShelfEligible(shelf, category)) continue;

      const placement = this._findBestOnShelf(shelf, stack);
      if (!placement) continue;

      if (!best || this._compareScores(placement.score, best.score) < 0) {
        best = { ...placement, shelfIndex };
      }
    }

    return best;
  }

  _findBestOnShelf(shelf, stack) {
    let best = null;
    const orientations = this._orientations(stack);
    const shelfUtilization = this._getUtilization(shelf);

    for (const freeRect of shelf.freeRects) {
      for (const orientation of orientations) {
        if (!this._fits(freeRect, orientation)) continue;

        const leftoverW = freeRect.w - orientation.dx;
        const leftoverH = freeRect.h - orientation.dz;
        const shortSide = Math.min(leftoverW, leftoverH);
        const longSide = Math.max(leftoverW, leftoverH);
        const areaFit = (freeRect.w * freeRect.h) - (orientation.dx * orientation.dz);

        // Best-short-side-fit first, then best area, then a fuller shelf.
        // Orientation 0 and the bottom-left free rectangle win exact ties.
        const score = [
          shortSide,
          longSide,
          areaFit,
          -shelfUtilization,
          orientation.rot,
          freeRect.z,
          freeRect.x
        ];

        if (!best || this._compareScores(score, best.score) < 0) {
          best = { freeRect, orientation, score };
        }
      }
    }

    return best;
  }

  _isShelfEligible(shelf, category) {
    if (shelf.stacks.length === 0) return true;
    if (shelf.categories.has(category)) return true;
    return this._getUtilization(shelf) < MIX_UTILIZATION;
  }

  _orientations(stack) {
    const orientations = [{ dx: stack.dx, dz: stack.dz, rot: 0 }];
    if (Math.abs(stack.dx - stack.dz) > EPS) {
      orientations.push({ dx: stack.dz, dz: stack.dx, rot: 90 });
    }
    return orientations;
  }

  _fits(freeRect, orientation) {
    return orientation.dx <= freeRect.w + EPS && orientation.dz <= freeRect.h + EPS;
  }

  _place(shelf, stack, freeRect, orientation, category) {
    const placed = {
      ...stack,
      x: freeRect.x,
      z: freeRect.z,
      dx: orientation.dx,
      dz: orientation.dz,
      rot: orientation.rot
    };

    shelf.stacks.push(placed);
    shelf.categories.add(category);
    this._splitFreeRects(shelf, {
      x: freeRect.x,
      z: freeRect.z,
      w: orientation.dx,
      h: orientation.dz
    });
  }

  _splitFreeRects(shelf, used) {
    const next = [];

    for (const free of shelf.freeRects) {
      if (!this._intersects(used, free)) {
        next.push(free);
        continue;
      }

      if (used.x > free.x + EPS) {
        next.push({ x: free.x, z: free.z, w: used.x - free.x, h: free.h });
      }
      if (used.x + used.w < free.x + free.w - EPS) {
        next.push({
          x: used.x + used.w,
          z: free.z,
          w: free.x + free.w - (used.x + used.w),
          h: free.h
        });
      }
      if (used.z > free.z + EPS) {
        next.push({ x: free.x, z: free.z, w: free.w, h: used.z - free.z });
      }
      if (used.z + used.h < free.z + free.h - EPS) {
        next.push({
          x: free.x,
          z: used.z + used.h,
          w: free.w,
          h: free.z + free.h - (used.z + used.h)
        });
      }
    }

    shelf.freeRects = this._pruneFreeRects(next);
  }

  _intersects(a, b) {
    return !(
      a.x >= b.x + b.w - EPS ||
      a.x + a.w <= b.x + EPS ||
      a.z >= b.z + b.h - EPS ||
      a.z + a.h <= b.z + EPS
    );
  }

  _pruneFreeRects(rects) {
    const unique = [];
    const seen = new Set();

    for (const rect of rects) {
      if (rect.w <= EPS || rect.h <= EPS) continue;

      const key = [
        rect.x.toFixed(4),
        rect.z.toFixed(4),
        rect.w.toFixed(4),
        rect.h.toFixed(4)
      ].join(':');

      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(rect);
    }

    return unique.filter((rect, i) => !unique.some((other, j) => {
      if (i === j) return false;
      return (
        other.x <= rect.x + EPS &&
        other.z <= rect.z + EPS &&
        other.x + other.w >= rect.x + rect.w - EPS &&
        other.z + other.h >= rect.z + rect.h - EPS
      );
    }));
  }

  _getUtilization(shelf) {
    const usedArea = shelf.stacks.reduce((sum, stack) => sum + (stack.dx * stack.dz), 0);
    return usedArea / (this.shelfSpec.length * this.shelfSpec.width);
  }

  _compareScores(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i] - 1e-9) return -1;
      if (a[i] > b[i] + 1e-9) return 1;
    }
    return 0;
  }
}
