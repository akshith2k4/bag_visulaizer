export class RackPacker {
  constructor(shelfSpec = { length: 130.6, width: 40.55, clearance: 50.56 }) {
    this.shelfSpec = shelfSpec;
  }

  pack(basket, maxStackHeight) {
    if (!basket || basket.length === 0) {
      return { racksRequired: 0, shelvesRequired: 0, totalStacks: 0, racks: [], unfittedItems: [] };
    }

    const allStacks = [];
    const unfittedItems = [];

    // --- STAGE 1: Generate 1D Vertical Stacks (Bays) ---
    basket.forEach(entry => {
      const p = entry.product;
      // Safety: at least 1 item per stack
      const itemsPerStack = Math.max(1, Math.floor(maxStackHeight / p.exactHeight));
      const totalStacks = Math.ceil(entry.count / itemsPerStack);
      
      for (let i = 0; i < totalStacks; i++) {
        const remaining = entry.count - (i * itemsPerStack);
        const itemsInThisStack = Math.min(itemsPerStack, remaining);
        
        allStacks.push({
          product: p,
          count: itemsInThisStack,
          stackHeight: Number((itemsInThisStack * p.exactHeight).toFixed(2)),
          dx: p.length,
          dz: p.width,
          area: p.length * p.width,
          category: p.category || 'General'
        });
      }
    });

    // --- STAGE 2: Sort by Category, then Largest Area First ---
    allStacks.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return b.area - a.area;
    });

    // --- STAGE 3: 2D Packing with Option C (Hybrid 30% Rule) ---
    const packedShelves = [];
    let currentShelf = this._createEmptyShelf();
    let currentCategory = allStacks.length > 0 ? allStacks[0].category : null;

    allStacks.forEach((stack) => {
      const isNewCategory = stack.category !== currentCategory;
      
      // Hybrid Rule: If category changes, check if previous shelf is < 30% full
      if (isNewCategory) {
        const utilization = this._getUtilization(currentShelf);
        if (utilization >= 0.30) {
          packedShelves.push(currentShelf);
          currentShelf = this._createEmptyShelf();
        }
        currentCategory = stack.category;
      }

      let placed = this._tryPlaceOnShelf(currentShelf, stack);

      // If it doesn't fit, push current shelf and open a new one
      if (!placed) {
        packedShelves.push(currentShelf);
        currentShelf = this._createEmptyShelf();
        placed = this._tryPlaceOnShelf(currentShelf, stack);
      }

      if (!placed) {
        unfittedItems.push({ name: stack.product.name, reason: 'Exceeds shelf dimensions' });
      }
    });

    if (currentShelf.stacks.length > 0) {
      packedShelves.push(currentShelf);
    }

    // --- STAGE 4: Assemble into Racks (4 shelves per rack) ---
    const shelvesRequired = packedShelves.length;
    const racksRequired = Math.ceil(shelvesRequired / 4) || 0;
    const racks = Array.from({ length: racksRequired }, (_, i) => ({ rackIndex: i, shelves: [] }));

    packedShelves.forEach((shelf, idx) => {
      const rackIndex = Math.floor(idx / 4);
      const shelfIndex = idx % 4;
      
      shelf.shelfIndex = shelfIndex;
      shelf.utilization = Number((this._getUtilization(shelf) * 100).toFixed(1));
      
      // Shift coordinates so (0,0) is top-left of shelf, then center for Three.js
      shelf.stacks.forEach(stack => {
        stack.x = stack.x - (this.shelfSpec.length / 2) + (stack.dx / 2);
        stack.z = stack.z - (this.shelfSpec.width / 2) + (stack.dz / 2);
      });

      racks[rackIndex].shelves.push(shelf);
    });

    return {
      racksRequired,
      shelvesRequired,
      totalStacks: packedShelves.reduce((sum, s) => sum + s.stacks.length, 0),
      racks,
      unfittedItems
    };
  }

  _createEmptyShelf() {
    return { stacks: [], pivots: [{ x: 0, z: 0 }] };
  }

  _getUtilization(shelf) {
    const usedArea = shelf.stacks.reduce((sum, s) => sum + (s.dx * s.dz), 0);
    const totalArea = this.shelfSpec.length * this.shelfSpec.width;
    return usedArea / totalArea;
  }

  _tryPlaceOnShelf(shelf, stack) {
    // Sort pivots by Z then X (bottom-left preference)
    shelf.pivots.sort((a, b) => (a.z - b.z) || (a.x - b.x));

    // Try normal (0) and rotated (90)
    const orientations = [
      { dx: stack.dx, dz: stack.dz, rot: 0 },
      { dx: stack.dz, dz: stack.dx, rot: 90 }
    ];

    for (let pIdx = 0; pIdx < shelf.pivots.length; pIdx++) {
      const pivot = shelf.pivots[pIdx];

      for (const ori of orientations) {
        // Bounds check
        if (pivot.x + ori.dx > this.shelfSpec.length + 0.01 || 
            pivot.z + ori.dz > this.shelfSpec.width + 0.01) continue;

        // Collision check
        let collides = false;
        for (const existing of shelf.stacks) {
          if (
            pivot.x < existing.x + existing.dx - 0.01 &&
            pivot.x + ori.dx > existing.x + 0.01 &&
            pivot.z < existing.z + existing.dz - 0.01 &&
            pivot.z + ori.dz > existing.z + 0.01
          ) {
            collides = true;
            break;
          }
        }
        if (collides) continue;

        // Placement valid
        shelf.stacks.push({
          ...stack,
          x: pivot.x,
          z: pivot.z,
          dx: ori.dx,
          dz: ori.dz,
          rot: ori.rot
        });

        // Update pivots
        shelf.pivots.splice(pIdx, 1);
        shelf.pivots.push({ x: pivot.x + ori.dx, z: pivot.z });
        shelf.pivots.push({ x: pivot.x, z: pivot.z + ori.dz });

        // Deduplicate and clean out-of-bounds pivots
        shelf.pivots = shelf.pivots.filter(pt => 
          pt.x < this.shelfSpec.length - 0.1 && pt.z < this.shelfSpec.width - 0.1
        );

        return true;
      }
    }
    return false;
  }
}
