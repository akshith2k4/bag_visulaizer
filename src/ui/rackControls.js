import { PRODUCTS } from '../data/products.js';

export class RackControls {
  constructor(visualizer) {
    this.visualizer = visualizer;
    this.products = PRODUCTS;
    this.basket = []; // Array of { product, count }
    
    // Defaults for warehouse config
    this.maxStackHeight = 35.0; 

    this.cacheDOMElements();
    this.bindEvents();
    this.render();
  }

  cacheDOMElements() {
    this.productSelect = document.getElementById('rack-product-select');
    this.addQtyInput = document.getElementById('rack-add-qty');
    this.btnAddItem = document.getElementById('btn-rack-add-item');
    this.btnClearBasket = document.getElementById('btn-clear-rack-basket');
    this.itemsContainer = document.getElementById('rack-items-container');

    this.stackHeightSlider = document.getElementById('stack-height-slider');
    this.stackHeightBadge = document.getElementById('stack-height-badge');

    this.racksCount = document.getElementById('racks-count');
    this.shelvesCount = document.getElementById('shelves-count');
    this.stacksCount = document.getElementById('stacks-count');
    this.statusBadge = document.getElementById('rack-status-badge');
    this.shelfBreakdown = document.getElementById('rack-shelf-breakdown');
  }

  bindEvents() {
    if (this.btnAddItem) {
      const addItem = () => {
        const prodId = this.productSelect.value;
        const qty = parseInt(this.addQtyInput.value, 10) || 1;
        const prod = this.products.find(p => p.id === prodId);
        if (!prod) return;

        const existing = this.basket.find(item => item.product.id === prodId);
        if (existing) {
          existing.count += qty;
        } else {
          this.basket.push({ product: prod, count: qty });
        }
        
        this.render();
        this.calculateRacks();
      };

      this.btnAddItem.addEventListener('click', addItem);
      this.addQtyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addItem(); }
      });
    }

    if (this.btnClearBasket) {
      this.btnClearBasket.addEventListener('click', () => {
        this.basket = [];
        this.render();
        this.calculateRacks();
      });
    }

    if (this.stackHeightSlider) {
      this.stackHeightSlider.addEventListener('input', (e) => {
        this.maxStackHeight = parseFloat(e.target.value);
        if (this.stackHeightBadge) {
          this.stackHeightBadge.textContent = `${this.maxStackHeight.toFixed(1)} cm`;
        }
        this.calculateRacks(); // Recalculate on height change
      });
    }
  }

  // Called when the tab is opened to ensure data is fresh
  onTabActivated() {
    this.populateSelect();
    this.render();
    if (this.basket.length > 0) {
      this.calculateRacks();
    } else {
      if (this.visualizer) this.visualizer.renderRackContents([]);
    }
  }

  populateSelect() {
    if (!this.productSelect || this.productSelect.children.length > 0) return;
    this.products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.length} × ${p.width} cm)`;
      this.productSelect.appendChild(opt);
    });
  }

  render() {
    this.populateSelect();
    if (!this.itemsContainer) return;
    
    this.itemsContainer.innerHTML = '';

    if (this.basket.length === 0) {
      this.itemsContainer.innerHTML = '<div class="empty-note">No inventory added yet. Select an item and click Add.</div>';
      this.updateMetricsEmpty();
      return;
    }

    this.basket.forEach((item, index) => {
      const p = item.product;
      const row = document.createElement('div');
      row.className = 'mixed-item-card';
      row.innerHTML = `
        <div class="mixed-item-top">
          <span class="mixed-item-name">
            <span class="color-dot" style="--dot:${p.color}; --dot-ring:${p.trimColor}"></span>${p.name}
          </span>
          <button type="button" class="btn-remove" data-index="${index}" aria-label="Remove ${p.name}">×</button>
        </div>
        <div class="mixed-item-controls">
          <input type="number" min="1" max="5000" value="${item.count}" class="mixed-qty-input" data-index="${index}" aria-label="Quantity of ${p.name}" />
          <span class="mixed-item-spec mono">Thickness: ${p.exactHeight.toFixed(2)} cm</span>
        </div>
      `;
      this.itemsContainer.appendChild(row);
    });

    // Wire up delete buttons
    this.itemsContainer.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.basket.splice(parseInt(e.currentTarget.dataset.index, 10), 1);
        this.render();
        this.calculateRacks();
      });
    });

    // Wire up quantity updates
    this.itemsContainer.querySelectorAll('.mixed-qty-input').forEach(input => {
      const update = (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        this.basket[idx].count = Math.max(1, parseInt(e.target.value, 10) || 1);
        this.calculateRacks();
      };
      input.addEventListener('change', update);
    });
  }

  calculateRacks() {
    if (this.basket.length === 0) {
      this.updateMetricsEmpty();
      if (this.visualizer) this.visualizer.renderRackContents([]);
      return;
    }

    // --- PHASE 2A MOCK ALGORITHM ---
    // This generates fake shelf data to visualize the racks.
    // Phase 2B will replace this with the exact math.
    
    let mockShelves = [];
    let currentShelfIndex = 0;
    let currentX = -60; // Start near the left edge of the 130cm shelf
    let currentZ = 0;

    this.basket.forEach(item => {
      const p = item.product;
      
      // Basic math for mock visualization
      const itemsPerStack = Math.floor(this.maxStackHeight / p.exactHeight);
      const numStacks = Math.ceil(item.count / itemsPerStack);
      
      for (let i = 0; i < numStacks; i++) {
        // If we run out of X space (130cm), move to the next shelf
        if (currentX + p.length > 65) {
          currentShelfIndex++;
          currentX = -60;
        }
        
        // Prevent going over 4 shelves for the mock
        if (currentShelfIndex >= 4) break; 

        let shelf = mockShelves.find(s => s.shelfIndex === currentShelfIndex);
        if (!shelf) {
          shelf = { shelfIndex: currentShelfIndex, items: [] };
          mockShelves.push(shelf);
        }

        const itemsInThisStack = Math.min(itemsPerStack, item.count - (i * itemsPerStack));
        
        // Mock positioning (spread along X axis)
        shelf.items.push({
          product: p,
          count: itemsInThisStack,
          stackHeight: itemsInThisStack * p.exactHeight,
          x: currentX + (p.length / 2), // centered on its footprint
          z: currentZ,
          dx: p.length,
          dz: p.width
        });

        currentX += p.length + 2; // 2cm gap
      }
    });

    // Update UI metrics based on mock data
    this.racksCount.textContent = Math.ceil(mockShelves.length / 4) || 1;
    this.shelvesCount.textContent = mockShelves.length;
    this.stacksCount.textContent = mockShelves.reduce((sum, s) => sum + s.items.length, 0);
    
    this.statusBadge.className = 'status-badge safe';
    this.statusBadge.textContent = 'Fits in warehouse';

    // Update Breakdown List
    let breakdownHtml = '';
    mockShelves.forEach(shelf => {
      breakdownHtml += `<div style="margin-bottom: 6px;"><strong>Shelf ${shelf.shelfIndex + 1}:</strong><br/>`;
      shelf.items.forEach(i => {
        breakdownHtml += `&nbsp;&nbsp;• ${i.count}× ${i.product.name}<br/>`;
      });
      breakdownHtml += `</div>`;
    });
    this.shelfBreakdown.innerHTML = breakdownHtml;

    // Send to 3D Visualizer
    if (this.visualizer) {
      this.visualizer.renderRackContents(mockShelves);
    }
  }

  updateMetricsEmpty() {
    this.racksCount.textContent = '0';
    this.shelvesCount.textContent = '0';
    this.stacksCount.textContent = '0';
    this.statusBadge.className = 'status-badge neutral';
    this.statusBadge.textContent = 'Basket empty';
    this.shelfBreakdown.innerHTML = 'Add inventory above to calculate shelf assignments.';
  }
}
