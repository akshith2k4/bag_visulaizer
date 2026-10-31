import { PRODUCTS } from '../data/products.js';
import { RackPacker } from '../algo/rackPacker.js';

const SHELVES_PER_RACK = 4;
const RACK_FILL_TONES = [
  { limit: 30, name: 'low' },
  { limit: 70, name: 'mid' },
  { limit: Infinity, name: 'high' }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fillTone(value) {
  return RACK_FILL_TONES.find(tone => value < tone.limit)?.name || 'high';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function rackStats(rack) {
  const shelves = rack.shelves || [];
  const products = new Map();
  let stacks = 0;

  shelves.forEach(shelf => {
    stacks += shelf.stacks.length;
    shelf.stacks.forEach(stack => {
      const product = stack.product;
      const entry = products.get(product.id) || { product, count: 0 };
      entry.count += stack.count;
      products.set(product.id, entry);
    });
  });

  // Average across all four tiers so a half-empty rack does not read as full.
  const averageFill = shelves.length > 0
    ? shelves.reduce((total, shelf) => total + shelf.utilization, 0) / SHELVES_PER_RACK
    : 0;
  const categories = new Set([...products.values()].map(entry => entry.product.category));

  return {
    shelves,
    stacks,
    products,
    categories,
    averageFill
  };
}

function shelfSkuCounts(shelf) {
  const counts = new Map();
  shelf.stacks.forEach(stack => {
    const entry = counts.get(stack.product.id) || { product: stack.product, count: 0 };
    entry.count += stack.count;
    counts.set(stack.product.id, entry);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export class RackControls {
  constructor(visualizer) {
    this.visualizer = visualizer;
    this.products = PRODUCTS;
    this.basket = []; // Array of { product, count }

    // Fixed rack height: every shelf is planned at the full 50.56 cm clearance.
    this.rackSpec = { length: 130.6, width: 40.55, clearance: 50.56 };

    // Rack map / detail state
    this.lastResult = null;
    this.selectedRackIndex = 0;
    this.viewMode = 'detail'; // 'detail' | 'overview'
    this.tabActive = false;

    this.cacheDOMElements();
    this.bindEvents();
    this.render();
    this.syncRackUi();
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

    // Rack map
    this.overview = document.getElementById('rack-overview');
    this.overviewGrid = document.getElementById('rack-overview-grid');
    this.overviewSummary = document.getElementById('rack-overview-summary');
    this.btnOverviewClose = document.getElementById('btn-rack-overview-close');

    // Rack inspector
    this.inspectorScope = document.getElementById('rack-inspector-scope');
    this.inspectorFill = document.getElementById('rack-inspector-fill');
    this.inspectorTiers = document.getElementById('rack-inspector-tiers');
    this.inspectorStacks = document.getElementById('rack-inspector-stacks');
    this.inspectorSkus = document.getElementById('rack-inspector-skus');
    this.elevationRows = document.getElementById('rack-elevation-rows');
    this.btnPrev = document.getElementById('btn-rack-prev');
    this.btnNext = document.getElementById('btn-rack-next');
    this.btnOverview = document.getElementById('btn-rack-overview');
    this.btnFit = document.getElementById('btn-rack-fit');

    // Canvas HUD
    this.rackHud = document.getElementById('rack-view-hud');
    this.rackHudScope = document.getElementById('rack-hud-scope');
    this.btnHudPrev = document.getElementById('btn-rack-hud-prev');
    this.btnHudOverview = document.getElementById('btn-rack-hud-overview');
    this.btnHudNext = document.getElementById('btn-rack-hud-next');
    this.btnHudFit = document.getElementById('btn-rack-hud-fit');
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

    const stepPrevious = () => this.stepRack(-1);
    const stepNext = () => this.stepRack(1);
    this.btnPrev?.addEventListener('click', stepPrevious);
    this.btnHudPrev?.addEventListener('click', stepPrevious);
    this.btnNext?.addEventListener('click', stepNext);
    this.btnHudNext?.addEventListener('click', stepNext);

    const showOverview = () => this.openOverview();
    this.btnOverview?.addEventListener('click', showOverview);
    this.btnHudOverview?.addEventListener('click', showOverview);
    this.btnOverviewClose?.addEventListener('click', () => this.closeOverview());

    const fitRack = () => this.fitSelectedRack();
    this.btnFit?.addEventListener('click', fitRack);
    this.btnHudFit?.addEventListener('click', fitRack);

    // Delegated click keeps the rack map cheap to rebuild.
    this.overviewGrid?.addEventListener('click', (event) => {
      const tile = event.target.closest('.rack-tile');
      if (!tile) return;
      this.selectRack(Number(tile.dataset.rackIndex));
    });
  }

  // Called when the rack tab is opened to ensure data is fresh.
  onTabActivated() {
    this.tabActive = true;
    this.populateSelect();
    this.render();

    if (this.basket.length > 0) {
      this.calculateRacks({ autoOverview: false });
    } else {
      this.lastResult = null;
      this.updateMetricsEmpty();
      this.renderOverview();
      this.renderInspector();
      if (this.visualizer) this.visualizer.renderRackContents({ racks: [] });
    }

    if (this.viewMode === 'overview' && this.lastResult?.racks.length) {
      this.overview.hidden = false;
    }
    this.syncRackUi();
  }

  // Called when another tab becomes active so the rack HUD does not linger.
  onTabDeactivated() {
    this.tabActive = false;
    if (this.overview) this.overview.hidden = true;
    this.syncRackUi();
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
            <span class="color-dot" style="--dot:${p.color}; --dot-ring:${p.trimColor}"></span>${escapeHtml(p.name)}
          </span>
          <button type="button" class="btn-remove" data-index="${index}" aria-label="Remove ${escapeHtml(p.name)}">×</button>
        </div>
        <div class="mixed-item-controls">
          <input type="number" min="1" max="5000" value="${item.count}" class="mixed-qty-input" data-index="${index}" aria-label="Quantity of ${escapeHtml(p.name)}" />
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

  calculateRacks({ autoOverview = true } = {}) {
    if (this.basket.length === 0) {
      this.lastResult = null;
      this.selectedRackIndex = 0;
      this.viewMode = 'detail';
      if (this.overview) this.overview.hidden = true;
      this.updateMetricsEmpty();
      this.renderOverview();
      this.renderInspector();
      this.syncRackUi();
      if (this.visualizer) this.visualizer.renderRackContents({ racks: [] });
      return;
    }

    const previousRackCount = this.lastResult?.racks.length || 0;

    // Run the real algorithm
    const packer = new RackPacker(this.rackSpec);
    const result = packer.pack(this.basket, this.rackSpec.clearance);
    this.lastResult = result;

    const rackCount = result.racks.length;
    this.selectedRackIndex = rackCount > 0
      ? clamp(this.selectedRackIndex, 0, rackCount - 1)
      : 0;

    // Update summary metrics
    this.racksCount.textContent = result.racksRequired;
    this.shelvesCount.textContent = result.shelvesRequired;
    this.stacksCount.textContent = result.totalStacks;

    this.statusBadge.className = result.unfittedItems.length > 0 ? 'status-badge danger' : 'status-badge safe';
    this.statusBadge.textContent = result.unfittedItems.length > 0 ? 'Items too large' : 'Fits in warehouse';

    // A plan that first grows beyond a single rack row opens on the all-racks map.
    if (rackCount > 8 && previousRackCount <= 8 && autoOverview) {
      this.viewMode = 'overview';
    } else if (rackCount === 0) {
      this.viewMode = 'detail';
    }

    if (this.viewMode === 'overview' && rackCount > 0) {
      this.overview.hidden = false;
    } else {
      this.overview.hidden = true;
    }

    // 3D only ever renders the selected rack.
    this.renderSelectedRack(this.viewMode === 'detail');
    this.renderOverview();
    this.renderInspector();
    this.syncRackUi();
  }

  hasRacks() {
    return Boolean(this.lastResult && this.lastResult.racks.length > 0);
  }

  selectedRack() {
    if (!this.hasRacks()) return null;
    return this.lastResult.racks[this.selectedRackIndex] || null;
  }

  selectRack(index) {
    if (!this.hasRacks()) return;
    const nextIndex = clamp(Number(index) || 0, 0, this.lastResult.racks.length - 1);
    this.selectedRackIndex = nextIndex;
    this.viewMode = 'detail';
    if (this.overview) this.overview.hidden = true;

    this.renderSelectedRack(true);
    this.renderOverview();
    this.renderInspector();
    this.syncRackUi();
  }

  stepRack(delta) {
    if (!this.hasRacks()) return;
    const count = this.lastResult.racks.length;
    const nextIndex = (this.selectedRackIndex + delta + count) % count;
    this.selectRack(nextIndex);
  }

  renderSelectedRack(fitCamera) {
    if (!this.visualizer) return;
    if (!this.hasRacks()) {
      this.visualizer.renderRackContents({ racks: [] });
      return;
    }
    this.visualizer.renderRackContents(this.lastResult, this.selectedRackIndex, fitCamera);
  }

  openOverview() {
    if (!this.hasRacks()) return;
    this.viewMode = 'overview';
    if (this.overview) this.overview.hidden = false;
    this.renderOverview();
    this.syncRackUi();
  }

  closeOverview() {
    if (this.viewMode !== 'overview') return;
    this.viewMode = 'detail';
    if (this.overview) this.overview.hidden = true;
    this.renderInspector();
    this.syncRackUi();
    if (this.visualizer && this.hasRacks()) this.visualizer.fitRackCamera();
  }

  fitSelectedRack() {
    if (!this.hasRacks()) return;
    this.viewMode = 'detail';
    if (this.overview) this.overview.hidden = true;
    this.renderInspector();
    this.syncRackUi();
    if (this.visualizer) this.visualizer.fitRackCamera();
  }

  renderOverview() {
    if (!this.overviewGrid || !this.overviewSummary) return;

    if (!this.hasRacks()) {
      this.overviewGrid.classList.remove('is-compact');
      this.overviewSummary.textContent = '0 racks · 0 shelves · 0 stacks';
      this.overviewGrid.innerHTML = '<div class="rack-overview-empty">Add inventory to generate a rack plan.</div>';
      return;
    }

    const result = this.lastResult;
    this.overviewSummary.textContent =
      `${result.racksRequired} racks · ${result.shelvesRequired} shelves · ${result.totalStacks} stacks`;

    // Large plans switch to shorter tiles so every rack can be seen without scrolling.
    this.overviewGrid.classList.toggle('is-compact', result.racks.length > 8);

    this.overviewGrid.innerHTML = result.racks.map((rack, index) => {
      const stats = rackStats(rack);
      const tone = fillTone(stats.averageFill);
      const isSelected = index === this.selectedRackIndex;
      const rackNumber = index + 1;
      const accent = stats.shelves[0]?.stacks[0]?.product.color || '#94a3b8';

      const shelfBars = Array.from({ length: SHELVES_PER_RACK }, (_, tier) => {
        const shelf = stats.shelves.find(candidate => candidate.shelfIndex === tier);
        if (!shelf) return '<span class="rack-shelf-bar is-empty" aria-hidden="true"></span>';
        return `<span class="rack-shelf-bar" aria-hidden="true"><span class="rack-fill--${fillTone(shelf.utilization)}" style="width:${Math.min(100, shelf.utilization)}%"></span></span>`;
      }).reverse().join('');

      const categoryDots = [...stats.products.values()]
        .slice(0, 4)
        .map(entry => `<i style="--cat:${entry.product.color}; --cat-ring:${entry.product.trimColor}"></i>`)
        .join('');

      return `
        <button
          type="button"
          class="rack-tile${isSelected ? ' is-selected' : ''}"
          data-rack-index="${index}"
          style="--tile-accent:${accent}"
          aria-label="Rack ${rackNumber}, ${stats.averageFill.toFixed(1)} percent full, ${stats.shelves.length} of ${SHELVES_PER_RACK} tiers, ${stats.stacks} stacks"
          aria-pressed="${isSelected ? 'true' : 'false'}"
        >
          <span class="rack-tile-top">
            <span class="rack-tile-id mono">R${String(rackNumber).padStart(2, '0')}</span>
            <span class="rack-tile-cats" aria-hidden="true">${categoryDots}</span>
            <span class="rack-tile-fill rack-fill-text--${tone} mono">${stats.averageFill.toFixed(0)}%</span>
          </span>
          <span class="rack-tile-bars">${shelfBars}</span>
          <span class="rack-tile-meta">
            <span>${stats.shelves.length}/${SHELVES_PER_RACK} tiers</span>
            <span>${stats.stacks} stacks</span>
          </span>
        </button>
      `;
    }).join('');
  }

  renderInspector() {
    if (!this.inspectorScope) return;

    const rack = this.selectedRack();

    if (!rack) {
      this.inspectorScope.textContent = 'No rack selected';
      this.inspectorFill.textContent = '—';
      this.inspectorTiers.textContent = '—';
      this.inspectorStacks.textContent = '—';
      this.inspectorSkus.textContent = '—';
      this.elevationRows.innerHTML = '<div class="empty-note">Select a rack to view its shelves.</div>';
      return;
    }

    const stats = rackStats(rack);
    const rackNumber = this.selectedRackIndex + 1;
    this.inspectorScope.textContent = `Rack ${rackNumber} of ${this.lastResult.racks.length}`;
    this.inspectorFill.textContent = `${stats.averageFill.toFixed(1)}%`;
    this.inspectorTiers.textContent = `${stats.shelves.length} / ${SHELVES_PER_RACK}`;
    this.inspectorStacks.textContent = String(stats.stacks);
    this.inspectorSkus.textContent = `${stats.products.size} / ${stats.categories.size}`;

    // Front elevation: tier 4 at the top, tier 1 at the bottom.
    this.elevationRows.innerHTML = Array.from({ length: SHELVES_PER_RACK }, (_, position) => {
      const tierIndex = SHELVES_PER_RACK - 1 - position;
      const shelf = stats.shelves.find(candidate => candidate.shelfIndex === tierIndex);

      if (!shelf) {
        return `
          <div class="rack-elevation-row is-empty">
            <span class="rack-elevation-tier mono">S${tierIndex + 1}</span>
            <div class="rack-elevation-body">
              <div class="rack-elevation-meta">
                <span>Unused tier</span>
                <span class="rack-elevation-fill mono">—</span>
              </div>
              <div class="rack-elevation-bar" aria-hidden="true"></div>
            </div>
          </div>
        `;
      }

      const tone = fillTone(shelf.utilization);
      const skuMarkup = shelfSkuCounts(shelf).map(entry => `
        <span class="rack-sku">
          <i class="rack-sku-dot" style="--dot:${entry.product.color}; --dot-ring:${entry.product.trimColor}" aria-hidden="true"></i>
          ${entry.count}× ${escapeHtml(entry.product.name)}
        </span>
      `).join('');

      return `
        <div class="rack-elevation-row">
          <span class="rack-elevation-tier mono">S${tierIndex + 1}</span>
          <div class="rack-elevation-body">
            <div class="rack-elevation-meta">
              <span>${shelf.stacks.length} stacks</span>
              <span class="rack-elevation-fill mono">${shelf.utilization.toFixed(1)}%</span>
            </div>
            <div class="rack-elevation-bar" aria-hidden="true">
              <span class="rack-fill--${tone}" style="width:${Math.min(100, shelf.utilization)}%"></span>
            </div>
            <div class="rack-elevation-skus">${skuMarkup}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  syncRackUi() {
    const hasRacks = this.hasRacks();
    const rackCount = hasRacks ? this.lastResult.racks.length : 0;
    const canStep = rackCount > 1;

    if (this.btnPrev) this.btnPrev.disabled = !canStep;
    if (this.btnNext) this.btnNext.disabled = !canStep;
    if (this.btnOverview) this.btnOverview.disabled = !hasRacks;
    if (this.btnFit) this.btnFit.disabled = !hasRacks;

    if (this.btnHudPrev) this.btnHudPrev.disabled = !canStep;
    if (this.btnHudNext) this.btnHudNext.disabled = !canStep;
    if (this.btnHudOverview) this.btnHudOverview.disabled = !hasRacks;
    if (this.btnHudFit) this.btnHudFit.disabled = !hasRacks;
    if (this.btnOverview) this.btnOverview.classList.toggle('is-active', this.viewMode === 'overview');

    if (this.rackHud) this.rackHud.hidden = !this.tabActive || !hasRacks;
    if (this.rackHudScope) {
      this.rackHudScope.textContent = hasRacks
        ? `R${String(this.selectedRackIndex + 1).padStart(2, '0')} / ${rackCount}`
        : '—';
    }
  }

  updateMetricsEmpty() {
    this.racksCount.textContent = '0';
    this.shelvesCount.textContent = '0';
    this.stacksCount.textContent = '0';
    this.statusBadge.className = 'status-badge neutral';
    this.statusBadge.textContent = 'Basket empty';
  }
}
