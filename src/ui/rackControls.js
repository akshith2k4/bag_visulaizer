import { PRODUCTS } from '../data/products.js';
import { RackPacker } from '../algo/rackPacker.js';

export class RackControls {
  constructor(visualizer) {
    this.visualizer = visualizer;
    this.products = PRODUCTS;
    this.basket = []; // Array of { product, count }
    
    // Fixed rack height: every shelf is planned at the full 50.56 cm clearance.
    this.rackSpec = { length: 130.6, width: 40.55, clearance: 50.56 };

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

  }

  // Called when the tab is opened to ensure data is fresh
  onTabActivated() {
    this.populateSelect();
    this.render();
    if (this.basket.length > 0) {
      this.calculateRacks();
    } else {
      if (this.visualizer) this.visualizer.renderRackContents({ racks: [] });
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
      if (this.visualizer) this.visualizer.renderRackContents({ racks: [] });
      return;
    }

    // 1. Run the real algorithm
    const packer = new RackPacker(this.rackSpec);
    const result = packer.pack(this.basket, this.rackSpec.clearance);

    // 2. Update Metrics UI
    this.racksCount.textContent = result.racksRequired;
    this.shelvesCount.textContent = result.shelvesRequired;
    this.stacksCount.textContent = result.totalStacks;
    
    this.statusBadge.className = result.unfittedItems.length > 0 ? 'status-badge danger' : 'status-badge safe';
    this.statusBadge.textContent = result.unfittedItems.length > 0 ? 'Items too large' : 'Fits in warehouse';

    // 3. Update Breakdown List
    let breakdownHtml = '';
    if (result.racksRequired === 0) {
      breakdownHtml = '<div style="color: var(--color-bad);">Items cannot fit on the 130.6×40.55cm shelves.</div>';
    } else {
      result.racks.forEach(rack => {
        breakdownHtml += `<div style="margin-bottom: 12px; border-bottom: 1px solid var(--color-rule); padding-bottom: 6px;">`;
        breakdownHtml += `<strong style="color: var(--color-accent-deep);">Rack ${rack.rackIndex + 1}</strong><br/>`;
        
        rack.shelves.forEach(shelf => {
          breakdownHtml += `<div style="margin-top: 4px; font-size: 11px;">`;
          breakdownHtml += `<strong>Shelf ${shelf.shelfIndex + 1}</strong> (${shelf.utilization}% full)<br/>`;
          
          // Aggregate counts by SKU
          const skuCounts = {};
          shelf.stacks.forEach(s => {
            skuCounts[s.product.name] = (skuCounts[s.product.name] || 0) + s.count;
          });
          
          Object.entries(skuCounts).forEach(([name, count]) => {
            breakdownHtml += `&nbsp;&nbsp;• ${count}× ${name}<br/>`;
          });
          breakdownHtml += `</div>`;
        });
        breakdownHtml += `</div>`;
      });
    }
    this.shelfBreakdown.innerHTML = breakdownHtml;

    // 4. Update 3D Scene
    if (this.visualizer) {
      this.visualizer.renderRackContents(result);
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
