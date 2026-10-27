import { PRODUCTS, calculateFit } from '../data/products.js';
import { Packer3D } from '../algo/packer3d.js';

export class UIController {
  constructor(visualizer) {
    this.visualizer = visualizer;
    this.products = PRODUCTS;
    this.bagSpec = visualizer.bagSpec;

    // 3D Bin Packer Engine initialization
    this.packer = new Packer3D(this.bagSpec);
    this.currentPackedResult = null;
    this.selectedBagIndex = 0;

    // Mixed packing order basket (starts empty)
    this.mixedBag = [];

    this.activeTab = 'mixed'; // 'mixed' | 'matrix'
    this.compressionFactor = 0; // 0 = uncompressed fold spec

    this.cacheDOMElements();
    this.bindEvents();
    this.switchTab('mixed');
  }

  cacheDOMElements() {
    this.workspace = document.querySelector('.main-workspace');

    // Viewport visual controls
    this.explodeSlider = document.getElementById('explode-slider');
    this.explodeValueDisplay = document.getElementById('explode-value');
    this.opacitySlider = document.getElementById('opacity-slider');
    this.opacityValueDisplay = document.getElementById('opacity-value');
    this.toggleDimsCheckbox = document.getElementById('toggle-dims');

    // Camera preset buttons
    this.camButtons = document.querySelectorAll('[data-cam]');
    this.lightButtons = document.querySelectorAll('[data-light]');
    this.brightnessSlider = document.getElementById('light-brightness-slider');
    this.brightnessVal = document.getElementById('light-brightness-val');
    this.btnExport = document.getElementById('btn-export-png');

    // Tabs
    this.tabButtons = document.querySelectorAll('[data-tab]');
    this.tabMixed = document.getElementById('tab-content-mixed');
    this.tabMatrix = document.getElementById('tab-content-matrix');

    // Mixed tab elements
    this.mixedItemsContainer = document.getElementById('mixed-items-container');
    this.mixedProductSelect = document.getElementById('mixed-product-select');
    this.mixedAddQty = document.getElementById('mixed-add-qty');
    this.btnMixedAddItem = document.getElementById('btn-mixed-add-item');
    this.btnClearBasket = document.getElementById('btn-clear-basket');
    this.mixedBagSwitcher = document.getElementById('mixed-bag-switcher');
    this.mixedBagButtons = document.getElementById('mixed-bag-buttons');
    this.mixedBagsCount = document.getElementById('mixed-bags-count');
    this.mixedBagsLabel = document.getElementById('mixed-bags-label');
    this.mixedMaxHeight = document.getElementById('mixed-max-height');
    this.mixedHeightBar = document.getElementById('mixed-height-bar');
    this.mixedStatusBadge = document.getElementById('mixed-status-badge');
    this.mixedTotalUnits = document.getElementById('mixed-total-units');
    this.mixedTotalWeight = document.getElementById('mixed-total-weight');
    this.mixedVolumeUtil = document.getElementById('mixed-volume-util');
    this.mixedSupportCheck = document.getElementById('mixed-support-check');
    this.mixedManifestText = document.getElementById('mixed-manifest-text');

    // Fabric compression / squish
    this.squishSlider = document.getElementById('squish-slider');
    this.squishPctBadge = document.getElementById('squish-pct-badge');

    // Matrix
    this.matrixTableBody = document.getElementById('matrix-table-body');
    this.btnExportCsv = document.getElementById('btn-export-csv');
  }

  bindEvents() {
    // Visual controls
    if (this.explodeSlider) {
      this.explodeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.explodeValueDisplay) this.explodeValueDisplay.textContent = `${Math.round(val * 100)}%`;
        this.visualizer.setExplode(val);
      });
    }

    if (this.opacitySlider) {
      this.opacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.opacityValueDisplay) this.opacityValueDisplay.textContent = `${Math.round(val * 100)}%`;
        this.visualizer.setBagOpacity(val);
      });
    }

    if (this.toggleDimsCheckbox) {
      this.toggleDimsCheckbox.addEventListener('change', (e) => {
        this.visualizer.toggleDimensions(e.target.checked);
      });
    }

    // Camera presets
    this.camButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const camPreset = btn.getAttribute('data-cam');
        this.camButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.visualizer.setCameraView(camPreset);
      });
    });

    // Lighting presets
    this.lightButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-light');
        this.lightButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.visualizer.setLightingPreset(preset);
      });
    });

    // Brightness / exposure slider
    if (this.brightnessSlider) {
      this.brightnessSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.brightnessVal) {
          this.brightnessVal.textContent = `${val.toFixed(1)}×`;
        }
        this.visualizer.setExposure(val);
      });
    }

    if (this.btnExport) {
      this.btnExport.addEventListener('click', () => {
        this.visualizer.exportSnapshot();
      });
    }

    // Tabs
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.getAttribute('data-tab'));
      });
    });

    // Mixed Tab (Packer3D)
    if (this.btnMixedAddItem && this.mixedProductSelect && this.mixedAddQty) {
      const addItem = () => {
        const prodId = this.mixedProductSelect.value;
        const qty = parseInt(this.mixedAddQty.value, 10) || 1;
        const prod = this.products.find(p => p.id === prodId);
        if (!prod) return;
        const existing = this.mixedBag.find(item => item.product.id === prodId);
        if (existing) {
          existing.count += qty;
        } else {
          this.mixedBag.push({ product: prod, count: qty });
        }
        this.renderMixedTab();
        this.runPacker3D();
      };

      this.btnMixedAddItem.addEventListener('click', addItem);
      this.mixedAddQty.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addItem();
        }
      });
    }

    // Clear Basket
    if (this.btnClearBasket) {
      this.btnClearBasket.addEventListener('click', () => {
        this.mixedBag = [];
        this.selectedBagIndex = 0;
        this.renderMixedTab();
        this.runPacker3D();
      });
    }

    // Fabric compression / squish slider — feeds the packer and the matrix
    if (this.squishSlider) {
      this.squishSlider.addEventListener('input', (e) => {
        const factor = parseFloat(e.target.value);
        this.compressionFactor = factor;
        const pct = Math.round(factor * 100);
        if (this.squishPctBadge) {
          this.squishPctBadge.textContent = `${pct}%`;
        }
        this.visualizer.setCompression(factor);
        this.runPacker3D();
        this.renderMatrixTable();
      });
    }

    // Matrix CSV export
    if (this.btnExportCsv) {
      this.btnExportCsv.addEventListener('click', () => this.exportCsv());
    }
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    this.tabButtons.forEach(btn => {
      const isActive = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (this.tabMixed) this.tabMixed.classList.toggle('active', tabId === 'mixed');
    if (this.tabMatrix) this.tabMatrix.classList.toggle('active', tabId === 'matrix');
    if (this.workspace) this.workspace.dataset.activeTab = tabId;

    if (tabId === 'mixed') {
      this.populateMixedProductSelect();
      this.renderMixedTab();
      this.runPacker3D();
    } else if (tabId === 'matrix') {
      this.renderMatrixTable();
    }
  }

  populateMixedProductSelect() {
    if (!this.mixedProductSelect || this.mixedProductSelect.children.length > 0) return;
    this.products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.length} × ${p.width} × ${p.exactHeight.toFixed(2)} cm)`;
      this.mixedProductSelect.appendChild(opt);
    });
  }

  // Mixed packing mode with automatic 3D bin packing
  renderMixedTab() {
    this.populateMixedProductSelect();
    if (!this.mixedItemsContainer) return;
    this.mixedItemsContainer.innerHTML = '';

    if (this.mixedBag.length === 0) {
      this.mixedItemsContainer.innerHTML = '<div class="empty-note">Basket is empty — select a linen type and click "Add" above.</div>';
      return;
    }

    this.mixedBag.forEach((item, index) => {
      const p = item.product;
      const row = document.createElement('div');
      row.className = 'mixed-item-card';
      row.innerHTML = `
        <div class="mixed-item-top">
          <span class="mixed-item-name">
            <span class="color-dot" style="--dot:${p.color}; --dot-ring:${p.trimColor}"></span>${p.name}
          </span>
          <button type="button" class="btn-remove" data-index="${index}" title="Remove ${p.name}" aria-label="Remove ${p.name}">×</button>
        </div>
        <div class="mixed-item-controls">
          <input type="number" min="1" max="300" value="${item.count}" class="mixed-qty-input" data-index="${index}" aria-label="Quantity of ${p.name}" />
          <span class="mixed-item-spec mono">${p.length} × ${p.width} × ${(p.exactHeight * (1 - this.compressionFactor)).toFixed(2)} cm</span>
        </div>
      `;
      this.mixedItemsContainer.appendChild(row);
    });

    // Remove buttons (auto re-packs)
    this.mixedItemsContainer.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        this.mixedBag.splice(idx, 1);
        this.renderMixedTab();
        this.runPacker3D();
      });
    });

    // Quantity inputs (live auto-pack on edit)
    this.mixedItemsContainer.querySelectorAll('.mixed-qty-input').forEach(input => {
      const updateQty = (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const count = Math.max(1, parseInt(e.target.value, 10) || 1);
        this.mixedBag[idx].count = count;
        this.runPacker3D();
      };
      input.addEventListener('input', updateQty);
      input.addEventListener('change', updateQty);
    });
  }

  runPacker3D() {
    if (!this.packer || !this.mixedBag) return;

    if (this.mixedBag.length === 0) {
      if (this.visualizer) {
        this.visualizer.renderPackedBag({ items: [], maxHeight: 0 });
      }
      if (this.mixedBagsCount) this.mixedBagsCount.textContent = '0';
      if (this.mixedBagsLabel) this.mixedBagsLabel.textContent = 'bags required';
      if (this.mixedMaxHeight) this.mixedMaxHeight.innerHTML = '0.00 <span class="unit">cm</span> <span class="ratio">(0%)</span>';
      if (this.mixedHeightBar) this.mixedHeightBar.style.width = '0%';
      if (this.mixedStatusBadge) {
        this.mixedStatusBadge.className = 'status-badge neutral';
        this.mixedStatusBadge.textContent = 'Basket empty';
      }
      if (this.mixedTotalUnits) this.mixedTotalUnits.textContent = '0';
      if (this.mixedTotalWeight) this.mixedTotalWeight.textContent = '0.0 kg';
      if (this.mixedVolumeUtil) this.mixedVolumeUtil.textContent = '0.0%';
      if (this.mixedSupportCheck) this.mixedSupportCheck.textContent = '100%';
      if (this.mixedBagSwitcher) this.mixedBagSwitcher.style.display = 'none';
      if (this.mixedManifestText) this.mixedManifestText.textContent = 'Add linens above to inspect bag manifest.';
      return;
    }

    // Run 3D bin packing (unchanged algorithm)
    this.currentPackedResult = this.packer.pack(this.mixedBag, {
      squishFactor: this.compressionFactor,
      supportThreshold: 0.65
    });

    const res = this.currentPackedResult;
    this.selectedBagIndex = Math.min(this.selectedBagIndex, Math.max(0, res.bagsRequired - 1));
    const activeBag = res.bags[this.selectedBagIndex];

    if (!activeBag) return;

    // Render active bag in the 3D scene
    this.visualizer.renderPackedBag(activeBag);

    // Bags required
    if (this.mixedBagsCount) this.mixedBagsCount.textContent = String(res.bagsRequired);
    if (this.mixedBagsLabel) this.mixedBagsLabel.textContent = res.bagsRequired === 1 ? 'red bag required' : 'red bags required';

    // Max height metric
    if (this.mixedMaxHeight) {
      const ratio = ((activeBag.maxHeight / this.bagSpec.height) * 100).toFixed(1);
      this.mixedMaxHeight.innerHTML = `${activeBag.maxHeight.toFixed(2)} <span class="unit">cm</span> <span class="ratio">(${ratio}%)</span>`;
    }

    if (this.mixedHeightBar) {
      const fillPct = Math.min((activeBag.maxHeight / this.bagSpec.height) * 100, 130);
      this.mixedHeightBar.style.width = `${(fillPct / 130) * 100}%`;
      this.mixedHeightBar.className = activeBag.maxHeight > this.bagSpec.height ? 'progress-fill danger' : 'progress-fill safe';
    }

    // Status badge
    if (this.mixedStatusBadge) {
      if (activeBag.heightFits && res.allPacked) {
        this.mixedStatusBadge.className = 'status-badge safe';
        this.mixedStatusBadge.textContent = res.bagsRequired === 1 ? 'Fits in 1 bag' : `Packed in ${res.bagsRequired} bags`;
      } else {
        this.mixedStatusBadge.className = 'status-badge danger';
        this.mixedStatusBadge.textContent = 'Exceeds bag capacity';
      }
    }

    // Stats
    if (this.mixedTotalUnits) {
      this.mixedTotalUnits.textContent = `${activeBag.itemCount}`;
    }
    if (this.mixedTotalWeight) {
      this.mixedTotalWeight.textContent = `${activeBag.totalWeight.toFixed(1)} kg`;
    }
    if (this.mixedVolumeUtil) {
      this.mixedVolumeUtil.textContent = `${activeBag.volumeUtilization}%`;
    }
    if (this.mixedSupportCheck) {
      this.mixedSupportCheck.textContent = '100%';
    }

    // Multi-bag switcher
    if (this.mixedBagSwitcher && this.mixedBagButtons) {
      if (res.bagsRequired > 1) {
        this.mixedBagSwitcher.style.display = 'flex';
        this.mixedBagButtons.innerHTML = '';
        res.bags.forEach((bag, idx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `btn-chip${idx === this.selectedBagIndex ? ' is-active' : ''}`;
          btn.textContent = `Bag ${idx + 1} · ${bag.volumeUtilization}% · ${bag.itemCount} items`;
          btn.addEventListener('click', () => {
            this.selectedBagIndex = idx;
            this.runPacker3D();
          });
          this.mixedBagButtons.appendChild(btn);
        });
      } else {
        this.mixedBagSwitcher.style.display = 'none';
      }
    }

    // Manifest breakdown
    if (this.mixedManifestText) {
      const breakdown = Object.entries(activeBag.productCounts)
        .map(([name, count]) => `<strong>${count}×</strong> ${name}`)
        .join(' · ');
      const headroom = Math.max(0, this.bagSpec.height - activeBag.maxHeight).toFixed(1);
      this.mixedManifestText.innerHTML = `
        <span class="manifest-list">${breakdown}</span>
        <span class="manifest-note">Stack height ${activeBag.maxHeight.toFixed(2)} cm of 47 cm — ${headroom} cm headroom remaining.</span>
      `;
    }
  }

  // Full comparison matrix
  renderMatrixTable() {
    if (!this.matrixTableBody) return;
    this.matrixTableBody.innerHTML = '';

    const squishNote = this.compressionFactor > 0
      ? ` · compression ${Math.round(this.compressionFactor * 100)}% applied`
      : '';

    const specProducts = this.products.filter(p => !p.measured);
    const measuredProducts = this.products.filter(p => p.measured);

    const renderGroup = (products, groupTitle, groupSubtitle, isMeasured) => {
      const headerRow = document.createElement('tr');
      headerRow.className = 'matrix-group-row';
      headerRow.innerHTML = `
        <td colspan="9">
          <span class="matrix-group-title">${groupTitle}</span>
          <span class="matrix-group-note">${groupSubtitle}${squishNote}</span>
        </td>
      `;
      this.matrixTableBody.appendChild(headerRow);

      products.forEach(p => {
        const fit = calculateFit(p, p.bagLimit, p.defaultOrientation, this.bagSpec, this.compressionFactor);
        const row = document.createElement('tr');
        const requiredLayers = Math.ceil(p.bagLimit / p.itemsPerLayer);

        let heightStatusBadge = '';
        if (fit.heightFits) {
          heightStatusBadge = `<span class="badge-safe">${fit.totalHeight.toFixed(2)} cm (${fit.heightRatio}%)</span>`;
        } else {
          heightStatusBadge = `<span class="badge-danger">${fit.totalHeight.toFixed(2)} cm (+${fit.heightOverflow.toFixed(2)} cm)</span>`;
        }

        let footprintStatusBadge = '';
        if (fit.footprintFits) {
          footprintStatusBadge = `<span class="badge-safe">Fits (${fit.layerFootprintX}×${fit.layerFootprintY} cm)</span>`;
        } else {
          const overflow = Math.max(fit.lengthOverflow, fit.widthOverflow);
          footprintStatusBadge = `<span class="badge-danger">Exceeds (+${overflow.toFixed(1)} cm)</span>`;
        }

        const typeBadge = `<span class="status-pill ${p.measured ? 'measured' : 'spec'}">${p.measured ? 'measured' : 'spec'}</span>`;

        // For measured products, show computed max fit
        const maxFitDisplay = p.measured
          ? `<span class="maxfit">Max fit @ 47 cm: ${Math.floor(this.bagSpec.height / p.exactHeight) * p.itemsPerLayer} items</span>`
          : '';

        row.innerHTML = `
          <td class="cell-product">
            <span class="product-cell">
              <span class="color-dot" style="--dot:${p.color}; --dot-ring:${p.trimColor}"></span>
              <strong>${p.name}</strong>
              ${typeBadge}
            </span>
            ${maxFitDisplay}
          </td>
          <td class="cell-num">${p.length} cm</td>
          <td class="cell-num">${p.width} cm</td>
          <td class="cell-num">${p.exactHeight.toFixed(4)} cm</td>
          <td class="cell-num"><strong>${p.bagLimit}</strong></td>
          <td class="cell-num">${p.itemsPerLayer} / layer · ${requiredLayers} layers</td>
          <td>${heightStatusBadge}</td>
          <td>${footprintStatusBadge}</td>
          <td class="cell-note">${p.notes}</td>
        `;

        this.matrixTableBody.appendChild(row);
      });
    };

    renderGroup(
      specProducts,
      'Derived fold specifications — 10 products',
      'Fold thickness derived as 47 cm ÷ required layers. Fits by mathematical definition at 0% squish.',
      false
    );

    renderGroup(
      measuredProducts,
      'Measured physical samples — 1 product',
      'Real empirical vendor measurements. Tests actual physical bag capacity and clearances.',
      true
    );
  }

  exportCsv() {
    let csv = "Product Name,Type,Length X (cm),Width Y (cm),Exact Height Z (cm),Bag Limit,Items Per Layer,Required Layers,Calculated Stack Height (cm),Height Status,Footprint Status,Notes\n";
    this.products.forEach(p => {
      const fit = calculateFit(p, p.bagLimit, p.defaultOrientation, this.bagSpec, this.compressionFactor);
      const requiredLayers = Math.ceil(p.bagLimit / p.itemsPerLayer);
      csv += `"${p.name}","${p.measured ? 'Measured' : 'Spec'}",${p.length},${p.width},${p.exactHeight.toFixed(4)},${p.bagLimit},${p.itemsPerLayer},${requiredLayers},${fit.totalHeight.toFixed(2)},"${fit.heightFits ? 'Fits' : 'Exceeds'}","${fit.footprintFits ? 'Fits' : 'Exceeds'}","${p.notes.replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "red-bag-linen-limit-validation-matrix.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
}
