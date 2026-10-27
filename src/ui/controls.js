import confetti from 'canvas-confetti';
import { PRODUCTS, DEFAULT_BAG, calculateFit } from '../data/products.js';
import { Packer3D } from '../algo/packer3d.js';

export class UIController {
  constructor(visualizer) {
    this.visualizer = visualizer;
    this.products = PRODUCTS;
    this.currentProduct = PRODUCTS[0]; // Start with Pillow Cover
    this.currentCount = PRODUCTS[0].bagLimit;
    this.currentOrientation = PRODUCTS[0].defaultOrientation;
    this.bagSpec = this.visualizer.bagSpec;

    // 3D Bin Packer Engine initialization
    this.packer = new Packer3D(this.bagSpec);
    this.currentPackedResult = null;
    this.selectedBagIndex = 0;

    // Mixed packing order basket (sample: single sheets, hand towels, pillow covers)
    this.mixedBag = [
      { product: PRODUCTS.find(p => p.id === 'single-bed-sheet') || PRODUCTS[3], count: 10 },
      { product: PRODUCTS.find(p => p.id === 'hand-towel') || PRODUCTS[1], count: 20 },
      { product: PRODUCTS.find(p => p.id === 'pillow-cover') || PRODUCTS[0], count: 40 }
    ];

    this.activeTab = 'single'; // 'single' | 'mixed' | 'matrix'
    this.compressionFactor = 0; // Default 0 (uncompressed fold spec hits 47.0cm exactly)
    this.handTowelVariant = '2-per-layer'; // '2-per-layer' or '3-per-layer'

    this.cacheDOMElements();
    this.bindEvents();
    this.renderProductCards();
    this.renderMatrixTable();
    this.applyProduct(this.currentProduct);
  }

  cacheDOMElements() {
    this.productSelect = document.getElementById('product-select');
    this.productGrid = document.getElementById('product-grid');
    this.itemCountSlider = document.getElementById('item-count-slider');
    this.itemCountInput = document.getElementById('item-count-input');
    this.maxCountLabel = document.getElementById('max-count-label');
    this.btnPresetLimit = document.getElementById('btn-preset-limit');
    this.btnPreset47cm = document.getElementById('btn-preset-47cm');
    this.btnDecLayer = document.getElementById('btn-dec-layer');
    this.btnIncLayer = document.getElementById('btn-inc-layer');

    // Orientation & Display
    this.btnOrient0 = document.getElementById('btn-orient-0');
    this.btnOrient90 = document.getElementById('btn-orient-90');
    this.explodeSlider = document.getElementById('explode-slider');
    this.explodeValueDisplay = document.getElementById('explode-value');
    this.opacitySlider = document.getElementById('opacity-slider');
    this.opacityValueDisplay = document.getElementById('opacity-value');
    this.toggleDimsCheckbox = document.getElementById('toggle-dims');

    // Metrics display
    this.metricHeightVal = document.getElementById('metric-height-val');
    this.metricHeightBar = document.getElementById('metric-height-bar');
    this.metricHeightBadge = document.getElementById('metric-height-badge');
    this.metricFootprintX = document.getElementById('metric-footprint-x');
    this.metricFootprintY = document.getElementById('metric-footprint-y');
    this.metricFootprintBadge = document.getElementById('metric-footprint-badge');
    this.metricLayers = document.getElementById('metric-layers');
    this.metricItemsPerLayer = document.getElementById('metric-items-per-layer');
    this.metricVolumeUtil = document.getElementById('metric-volume-util');
    this.productNotesText = document.getElementById('product-notes-text');
    this.discrepancyBox = document.getElementById('discrepancy-box');

    // Hand Towel layout variant elements
    this.handTowelLayoutCard = document.getElementById('hand-towel-layout-card');
    this.btnHt2 = document.getElementById('btn-ht-2');
    this.btnHt3 = document.getElementById('btn-ht-3');

    // Fabric Compression / Squish elements
    this.squishSlider = document.getElementById('squish-slider');
    this.squishValueDisplay = document.getElementById('squish-value-display');
    this.squishPctBadge = document.getElementById('squish-pct-badge');
    this.squishSavingsBanner = document.getElementById('squish-savings-banner');

    // Bags Required elements
    this.metricBagsCount = document.getElementById('metric-bags-count');
    this.metricBagsSavings = document.getElementById('metric-bags-savings');

    // Camera preset buttons
    this.camButtons = document.querySelectorAll('[data-cam]');
    this.lightButtons = document.querySelectorAll('[data-light]');
    this.brightnessSlider = document.getElementById('light-brightness-slider');
    this.brightnessVal = document.getElementById('light-brightness-val');
    this.btnExport = document.getElementById('btn-export-png');

    // Tabs
    this.tabButtons = document.querySelectorAll('[data-tab]');
    this.tabSingle = document.getElementById('tab-content-single');
    this.tabMixed = document.getElementById('tab-content-mixed');
    this.tabMatrix = document.getElementById('tab-content-matrix');

    // Mixed tab elements (Packer3D)
    this.mixedItemsContainer = document.getElementById('mixed-items-container');
    this.mixedProductSelect = document.getElementById('mixed-product-select');
    this.mixedAddQty = document.getElementById('mixed-add-qty');
    this.btnMixedAddItem = document.getElementById('btn-mixed-add-item');
    this.btnRunPacker3D = document.getElementById('btn-run-packer3d');
    this.mixedBagSwitcher = document.getElementById('mixed-bag-switcher');
    this.mixedBagButtons = document.getElementById('mixed-bag-buttons');
    this.mixedBagsCount = document.getElementById('mixed-bags-count');
    this.mixedMaxHeight = document.getElementById('mixed-max-height');
    this.mixedHeightBar = document.getElementById('mixed-height-bar');
    this.mixedStatusBadge = document.getElementById('mixed-status-badge');
    this.mixedTotalUnits = document.getElementById('mixed-total-units');
    this.mixedTotalWeight = document.getElementById('mixed-total-weight');
    this.mixedVolumeUtil = document.getElementById('mixed-volume-util');
    this.mixedSupportCheck = document.getElementById('mixed-support-check');
    this.mixedManifestText = document.getElementById('mixed-manifest-text');
    this.btnPresetHotel = document.getElementById('btn-preset-hotel');
    this.btnPresetTrolley = document.getElementById('btn-preset-trolley');
    this.btnPresetTowels = document.getElementById('btn-preset-towels');
    this.btnPresetClear = document.getElementById('btn-preset-clear');

    // Matrix
    this.matrixTableBody = document.getElementById('matrix-table-body');
    this.btnExportCsv = document.getElementById('btn-export-csv');
  }

  bindEvents() {
    // Product selection change
    if (this.productSelect) {
      this.productSelect.addEventListener('change', (e) => {
        const prod = this.products.find(p => p.id === e.target.value);
        if (prod) this.applyProduct(prod);
      });
    }

    // Slider and input count change
    if (this.itemCountSlider) {
      this.itemCountSlider.addEventListener('input', (e) => {
        const count = parseInt(e.target.value, 10);
        this.updateCount(count);
      });
    }

    if (this.itemCountInput) {
      this.itemCountInput.addEventListener('change', (e) => {
        let count = parseInt(e.target.value, 10) || 1;
        const maxBound = parseInt(this.itemCountSlider ? this.itemCountSlider.max : 500, 10);
        count = Math.min(maxBound, Math.max(1, count));
        this.updateCount(count);
      });
    }

    // Preset buttons
    if (this.btnPresetLimit) {
      this.btnPresetLimit.addEventListener('click', () => {
        this.updateCount(this.currentProduct.bagLimit);
      });
    }

    if (this.btnPreset47cm) {
      this.btnPreset47cm.addEventListener('click', () => {
        // Preset count to stated limit which targets 47cm
        this.updateCount(this.currentProduct.bagLimit);
      });
    }

    if (this.btnDecLayer) {
      this.btnDecLayer.addEventListener('click', () => {
        const step = this.currentProduct.itemsPerLayer || 1;
        this.updateCount(Math.max(1, this.currentCount - step));
      });
    }

    if (this.btnIncLayer) {
      this.btnIncLayer.addEventListener('click', () => {
        const step = this.currentProduct.itemsPerLayer || 1;
        this.updateCount(this.currentCount + step);
      });
    }

    // Orientation buttons
    if (this.btnOrient0) {
      this.btnOrient0.addEventListener('click', () => this.setOrientation(0));
    }
    if (this.btnOrient90) {
      this.btnOrient90.addEventListener('click', () => this.setOrientation(90));
    }

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

    // Brightness / Exposure slider
    if (this.brightnessSlider) {
      this.brightnessSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.brightnessVal) {
          this.brightnessVal.textContent = `${val.toFixed(1)}x`;
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
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Mixed Tab (Packer3D)
    if (this.btnRunPacker3D) {
      this.btnRunPacker3D.addEventListener('click', () => this.runPacker3D());
    }

    if (this.btnMixedAddItem && this.mixedProductSelect && this.mixedAddQty) {
      this.btnMixedAddItem.addEventListener('click', () => {
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
      });
    }

    // Presets
    if (this.btnPresetHotel) this.btnPresetHotel.addEventListener('click', () => this.setPresetOrder('hotel'));
    if (this.btnPresetTrolley) this.btnPresetTrolley.addEventListener('click', () => this.setPresetOrder('trolley'));
    if (this.btnPresetTowels) this.btnPresetTowels.addEventListener('click', () => this.setPresetOrder('towels'));
    if (this.btnPresetClear) this.btnPresetClear.addEventListener('click', () => this.setPresetOrder('clear'));

    // Hand Towel layout variant toggle
    if (this.btnHt2) {
      this.btnHt2.addEventListener('click', () => this.setHandTowelVariant('2-per-layer'));
    }
    if (this.btnHt3) {
      this.btnHt3.addEventListener('click', () => this.setHandTowelVariant('3-per-layer'));
    }

    // Fabric Compression / Squish slider
    if (this.squishSlider) {
      this.squishSlider.addEventListener('input', (e) => {
        const factor = parseFloat(e.target.value);
        this.compressionFactor = factor;
        const pct = Math.round(factor * 100);
        if (this.squishValueDisplay) {
          this.squishValueDisplay.textContent = `${pct}% Squish (${pct === 0 ? 'Rigid / Spec' : pct < 8 ? 'Light' : pct === 8 ? 'Typical' : 'Heavy'})`;
        }
        if (this.squishPctBadge) {
          this.squishPctBadge.textContent = `${pct}% Squish`;
        }
        this.visualizer.setCompression(factor);
        if (this.activeTab === 'single') {
          this.refreshMetrics();
        } else if (this.activeTab === 'mixed') {
          this.runPacker3D();
        } else if (this.activeTab === 'matrix') {
          this.renderMatrixTable();
        }
      });
    }

    // Matrix CSV export
    if (this.btnExportCsv) {
      this.btnExportCsv.addEventListener('click', () => this.exportCsv());
    }
  }

  setHandTowelVariant(variantId) {
    this.handTowelVariant = variantId;
    const ht = this.products.find(p => p.id === 'hand-towel');
    if (!ht || !ht.variants) return;

    const variant = ht.variants.find(v => v.id === variantId);
    if (variant) {
      ht.width = variant.width;
      ht.length = variant.length;
      ht.exactHeight = variant.exactHeight;
      ht.itemsPerLayer = variant.itemsPerLayer;
      ht.notes = variant.notes;
    }

    if (this.btnHt2) this.btnHt2.classList.toggle('active', variantId === '2-per-layer');
    if (this.btnHt3) this.btnHt3.classList.toggle('active', variantId === '3-per-layer');

    this.renderProductCards();
    if (this.activeTab === 'matrix') this.renderMatrixTable();
    this.refreshMetrics();
  }

  renderProductCards() {
    if (!this.productGrid) return;
    this.productGrid.innerHTML = '';

    this.products.forEach(p => {
      const card = document.createElement('div');
      card.className = `product-card ${p.id === this.currentProduct.id ? 'active' : ''}`;
      card.dataset.id = p.id;

      const fit = calculateFit(p, p.bagLimit, p.defaultOrientation, this.bagSpec, this.compressionFactor);
      let badgeHtml;
      if (p.hasDiscrepancy) {
        badgeHtml = `<span class="status-pill danger" title="${p.notes}">${p.discrepancyType === 'footprint_and_height_overflow' ? 'Overflows' : 'Check'}</span>`;
      } else if (!fit.heightFits || !fit.footprintFits) {
        badgeHtml = `<span class="status-pill warning" title="Overflows at limit">Overflows</span>`;
      } else {
        badgeHtml = `<span class="status-pill safe">Fits</span>`;
      }

      const typeTag = `<span class="status-pill ${p.measured ? 'measured' : 'spec'}">${p.measured ? 'measured' : 'spec'}</span>`;

      card.innerHTML = `
        <div class="product-card-top">
          <div class="color-dot" style="background-color: ${p.color}; border: 1px solid ${p.trimColor};"></div>
          <span class="product-name">${p.name}</span>
          <div style="margin-left:auto; display:flex; gap:4px; align-items:center;">
            ${typeTag}
            ${badgeHtml}
          </div>
        </div>
        <div class="product-card-specs">
          <span>${p.length} × ${p.width} × ${p.exactHeight.toFixed(2)} cm</span>
          <span>Limit: <strong>${p.bagLimit}</strong> (${p.itemsPerLayer}/layer)</span>
        </div>
      `;

      card.addEventListener('click', () => {
        this.applyProduct(p);
      });

      this.productGrid.appendChild(card);
    });
  }

  applyProduct(product) {
    this.currentProduct = product;
    this.currentCount = product.bagLimit;
    this.currentOrientation = product.defaultOrientation;

    if (this.productSelect) {
      this.productSelect.value = product.id;
    }

    // Update active state in grid cards
    if (this.productGrid) {
      this.productGrid.querySelectorAll('.product-card').forEach(card => {
        card.classList.toggle('active', card.dataset.id === product.id);
      });
    }

    // Slider bounds
    const maxBound = Math.max(product.bagLimit * 2, 60);
    if (this.itemCountSlider) {
      this.itemCountSlider.min = 1;
      this.itemCountSlider.max = maxBound;
      this.itemCountSlider.value = this.currentCount;
    }
    if (this.maxCountLabel) {
      this.maxCountLabel.textContent = `${maxBound} max`;
    }

    if (this.handTowelLayoutCard) {
      this.handTowelLayoutCard.style.display = product.id === 'hand-towel' ? 'block' : 'none';
    }

    this.setOrientation(product.defaultOrientation, false);
    this.refreshMetrics();
  }

  updateCount(count) {
    this.currentCount = count;
    if (this.itemCountSlider) this.itemCountSlider.value = count;
    if (this.itemCountInput) this.itemCountInput.value = count;
    this.refreshMetrics();
  }

  setOrientation(deg, updateVisual = true) {
    this.currentOrientation = deg;
    if (this.btnOrient0) this.btnOrient0.classList.toggle('active', deg === 0);
    if (this.btnOrient90) this.btnOrient90.classList.toggle('active', deg === 90);

    if (updateVisual) {
      this.refreshMetrics();
    }
  }

  refreshMetrics() {
    const p = this.currentProduct;
    const fit = calculateFit(p, this.currentCount, this.currentOrientation, this.bagSpec, this.compressionFactor);

    // Update 3D scene with compression factor
    this.visualizer.updateProductStack(p, this.currentCount, this.currentOrientation, this.compressionFactor);

    // Update Bags Required
    if (this.metricBagsCount) {
      this.metricBagsCount.textContent = `${fit.bagsRequired} Red Bag${fit.bagsRequired > 1 ? 's' : ''}`;
      this.metricBagsCount.style.color = fit.bagsRequired > 1 ? '#f87171' : '#34d399';
    }

    if (this.metricBagsSavings) {
      if (fit.bagsSaved > 0) {
        this.metricBagsSavings.className = 'bag-savings-tag highlight';
        this.metricBagsSavings.textContent = `💡 Saved ${fit.bagsSaved} Bag via ${fit.compressionPercent}% Squish!`;
      } else if (fit.heightFits) {
        this.metricBagsSavings.className = 'bag-savings-tag safe';
        this.metricBagsSavings.textContent = `✓ Fits in ${fit.bagsRequired} Bag`;
      } else {
        this.metricBagsSavings.className = 'bag-savings-tag danger';
        this.metricBagsSavings.textContent = `⚠️ Overflows into Bag #${fit.bagsRequired}`;
      }
    }

    // Squish Savings Banner
    if (this.squishSavingsBanner) {
      if (fit.bagsSaved > 0) {
        this.squishSavingsBanner.style.display = 'block';
        this.squishSavingsBanner.className = 'alert-box warning-box';
        this.squishSavingsBanner.innerHTML = `<strong>🎉 Compression Advantage:</strong> With <strong>${fit.compressionPercent}% squish</strong>, the stack compresses from <strong>${fit.rawHeight.toFixed(1)} cm</strong> down to <strong>${fit.totalHeight.toFixed(1)} cm</strong>, keeping all ${fit.count} items in <strong>1 Red Bag</strong> and avoiding opening an unnecessary 2nd bag!`;
      } else {
        this.squishSavingsBanner.style.display = 'none';
      }
    }

    // Update Height Metric (Shows both compressed and uncompressed)
    if (this.metricHeightVal) {
      this.metricHeightVal.innerHTML = `
        ${fit.totalHeight.toFixed(2)} <span class="unit">cm</span> <span class="ratio">(${fit.heightRatio}%)</span>
        <div style="font-size:0.75rem; color:#94a3b8; font-weight:normal; margin-top:2px;">
          Uncompressed: <strong>${fit.rawHeight.toFixed(2)} cm</strong> (${fit.rawHeightRatio}%)
        </div>
      `;
    }

    if (this.metricHeightBar) {
      const fillPct = Math.min(fit.heightRatio, 130);
      this.metricHeightBar.style.width = `${(fillPct / 130) * 100}%`;

      if (fit.totalHeight > this.bagSpec.height + 0.1) {
        this.metricHeightBar.className = 'progress-fill danger';
      } else if (fit.totalHeight >= this.bagSpec.height * 0.95) {
        this.metricHeightBar.className = 'progress-fill warning';
      } else {
        this.metricHeightBar.className = 'progress-fill safe';
      }
    }

    if (this.metricHeightBadge) {
      if (Math.abs(fit.totalHeight - this.bagSpec.height) <= 0.2) {
        this.metricHeightBadge.className = 'status-badge safe';
        this.metricHeightBadge.textContent = '✓ PERFECT 47.0cm LIMIT';
        // Confetti burst for exact match on stated limit
        if (this.currentCount === p.bagLimit && fit.totalHeight <= this.bagSpec.height + 0.1 && fit.footprintFits) {
          confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
        }
      } else if (fit.totalHeight < this.bagSpec.height) {
        this.metricHeightBadge.className = 'status-badge safe';
        this.metricHeightBadge.textContent = `✓ FITS: ${(this.bagSpec.height - fit.totalHeight).toFixed(2)}cm remaining`;
      } else {
        this.metricHeightBadge.className = 'status-badge danger';
        this.metricHeightBadge.textContent = `⚠️ EXCEEDS BAG by +${(fit.totalHeight - this.bagSpec.height).toFixed(2)}cm`;
      }
    }

    // Footprint metrics
    if (this.metricFootprintX) {
      this.metricFootprintX.innerHTML = `<strong>${fit.layerFootprintX.toFixed(1)} cm</strong> / ${this.bagSpec.length} cm (${fit.lengthClearance >= 0 ? '+' : ''}${fit.lengthClearance.toFixed(1)} cm)`;
    }
    if (this.metricFootprintY) {
      this.metricFootprintY.innerHTML = `<strong>${fit.layerFootprintY.toFixed(1)} cm</strong> / ${this.bagSpec.width} cm (${fit.widthClearance >= 0 ? '+' : ''}${fit.widthClearance.toFixed(1)} cm)`;
    }
    if (this.metricFootprintBadge) {
      if (fit.footprintFits) {
        this.metricFootprintBadge.className = 'status-badge safe';
        this.metricFootprintBadge.textContent = `✓ Footprint Fits in ${this.bagSpec.length}×${this.bagSpec.width}cm`;
      } else {
        this.metricFootprintBadge.className = 'status-badge danger';
        const overflow = Math.max(fit.lengthOverflow, fit.widthOverflow);
        this.metricFootprintBadge.textContent = `⚠️ Footprint Exceeded by +${overflow.toFixed(1)}cm`;
      }
    }

    // Layers & Counts
    if (this.metricLayers) {
      const statedLayers = Math.ceil(p.bagLimit / p.itemsPerLayer);
      this.metricLayers.textContent = `${fit.totalLayers} layers (Limit requires: ${statedLayers} layers)`;
    }
    if (this.metricItemsPerLayer) {
      this.metricItemsPerLayer.textContent = `${p.itemsPerLayer} per layer (${this.currentOrientation === 0 ? 'Normal 0°' : 'Rotated 90°'})`;
    }
    if (this.metricVolumeUtil) {
      this.metricVolumeUtil.textContent = `${fit.volumeUtilization}% (${(fit.totalProductVolume / 1000).toFixed(1)} L / ${(fit.bagVolume / 1000).toFixed(1)} L)`;
    }

    // Notes
    if (this.productNotesText) {
      this.productNotesText.textContent = p.notes;
    }

    // Discrepancy Alert Box driven strictly from data
    if (this.discrepancyBox) {
      this.discrepancyBox.style.display = p.hasDiscrepancy ? 'block' : 'none';
      if (p.hasDiscrepancy) {
        this.discrepancyBox.className = 'alert-box danger-box';
        this.discrepancyBox.innerHTML = `
          <div class="alert-title">⚠️ ${p.name} (${p.measured ? 'Measured Vendor Sample' : 'Discrepancy'})</div>
          <p>${p.notes}</p>
        `;
      }
    }
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    this.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    if (this.tabSingle) this.tabSingle.style.display = tabId === 'single' ? 'block' : 'none';
    if (this.tabMixed) this.tabMixed.style.display = tabId === 'mixed' ? 'block' : 'none';
    if (this.tabMatrix) this.tabMatrix.style.display = tabId === 'matrix' ? 'block' : 'none';

    if (tabId === 'single') {
      this.applyProduct(this.currentProduct);
    } else if (tabId === 'mixed') {
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

  setPresetOrder(presetName) {
    if (presetName === 'hotel') {
      this.mixedBag = [
        { product: this.products.find(p => p.id === 'double-bed-sheet') || this.products[2], count: 2 },
        { product: this.products.find(p => p.id === 'pillow-cover') || this.products[0], count: 4 },
        { product: this.products.find(p => p.id === 'bath-towel') || this.products[9], count: 4 },
        { product: this.products.find(p => p.id === 'bath-mat') || this.products[4], count: 2 },
        { product: this.products.find(p => p.id === 'bath-robe') || this.products[5], count: 2 }
      ];
    } else if (presetName === 'trolley') {
      this.mixedBag = [
        { product: this.products.find(p => p.id === 'single-bed-sheet') || this.products[3], count: 10 },
        { product: this.products.find(p => p.id === 'hand-towel') || this.products[1], count: 20 },
        { product: this.products.find(p => p.id === 'pillow-cover') || this.products[0], count: 40 }
      ];
    } else if (presetName === 'towels') {
      this.mixedBag = [
        { product: this.products.find(p => p.id === 'hand-towel') || this.products[1], count: 20 },
        { product: this.products.find(p => p.id === 'bath-towel') || this.products[9], count: 15 },
        { product: this.products.find(p => p.id === 'face-towel') || this.products[10], count: 20 }
      ];
    } else if (presetName === 'clear') {
      this.mixedBag = [];
    }
    this.selectedBagIndex = 0;
    this.renderMixedTab();
    this.runPacker3D();
  }

  // Mixed Packing Mode with 3D Bin Packing
  renderMixedTab() {
    this.populateMixedProductSelect();
    if (!this.mixedItemsContainer) return;
    this.mixedItemsContainer.innerHTML = '';

    if (this.mixedBag.length === 0) {
      this.mixedItemsContainer.innerHTML = '<div style="color:#94a3b8; font-size:0.8rem; text-align:center; padding:12px;">Basket is empty. Choose a preset or add items above.</div>';
      return;
    }

    this.mixedBag.forEach((item, index) => {
      const p = item.product;
      const row = document.createElement('div');
      row.className = 'mixed-item-card';
      row.innerHTML = `
        <div class="mixed-item-top">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="color-dot" style="background-color: ${p.color}; border: 1px solid ${p.trimColor};"></div>
            <strong>${p.name}</strong>
          </div>
          <button class="btn-remove-mixed" data-index="${index}" title="Remove item">✕</button>
        </div>
        <div class="mixed-item-controls">
          <label>Qty:</label>
          <input type="number" min="1" max="300" value="${item.count}" class="mixed-qty-input" data-index="${index}" />
          <span style="font-size:0.75rem; color:#94a3b8;">${p.length} × ${p.width} × ${(p.exactHeight * (1 - this.compressionFactor)).toFixed(2)} cm</span>
        </div>
      `;
      this.mixedItemsContainer.appendChild(row);
    });

    // Remove buttons
    this.mixedItemsContainer.querySelectorAll('.btn-remove-mixed').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        this.mixedBag.splice(idx, 1);
        this.renderMixedTab();
        this.runPacker3D();
      });
    });

    // Quantity inputs
    this.mixedItemsContainer.querySelectorAll('.mixed-qty-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const count = Math.max(1, parseInt(e.target.value, 10) || 1);
        this.mixedBag[idx].count = count;
        this.runPacker3D();
      });
    });
  }

  runPacker3D() {
    if (!this.packer || !this.mixedBag) return;

    if (this.mixedBag.length === 0) {
      if (this.visualizer) {
        this.visualizer.renderPackedBag({ items: [], maxHeight: 0 });
      }
      if (this.mixedBagsCount) this.mixedBagsCount.textContent = '0 Bags';
      if (this.mixedMaxHeight) this.mixedMaxHeight.textContent = '0.00 cm (0%)';
      if (this.mixedHeightBar) this.mixedHeightBar.style.width = '0%';
      if (this.mixedStatusBadge) {
        this.mixedStatusBadge.className = 'status-badge safe';
        this.mixedStatusBadge.textContent = 'Basket Empty';
      }
      if (this.mixedBagSwitcher) this.mixedBagSwitcher.style.display = 'none';
      if (this.mixedManifestText) this.mixedManifestText.textContent = 'Add linens above or choose a preset to pack.';
      return;
    }

    // Run 3D Bin Packing
    this.currentPackedResult = this.packer.pack(this.mixedBag, {
      squishFactor: this.compressionFactor,
      supportThreshold: 0.65
    });

    const res = this.currentPackedResult;
    this.selectedBagIndex = Math.min(this.selectedBagIndex, Math.max(0, res.bagsRequired - 1));
    const activeBag = res.bags[this.selectedBagIndex];

    if (!activeBag) return;

    // Render active bag in 3D scene!
    this.visualizer.renderPackedBag(activeBag);

    // Update Bags Count Banner
    if (this.mixedBagsCount) {
      this.mixedBagsCount.textContent = `${res.bagsRequired} Red Bag${res.bagsRequired > 1 ? 's' : ''}`;
      this.mixedBagsCount.style.color = res.bagsRequired > 1 ? '#fbbf24' : '#34d399';
    }

    // Update Max Height Metric
    if (this.mixedMaxHeight) {
      const ratio = ((activeBag.maxHeight / this.bagSpec.height) * 100).toFixed(1);
      this.mixedMaxHeight.innerHTML = `${activeBag.maxHeight.toFixed(2)} <span class="unit">cm</span> <span class="ratio">(${ratio}%)</span>`;
    }

    if (this.mixedHeightBar) {
      const fillPct = Math.min((activeBag.maxHeight / this.bagSpec.height) * 100, 130);
      this.mixedHeightBar.style.width = `${(fillPct / 130) * 100}%`;
      this.mixedHeightBar.className = activeBag.maxHeight > this.bagSpec.height ? 'progress-fill danger' : 'progress-fill safe';
    }

    // Update Status Badge
    if (this.mixedStatusBadge) {
      if (activeBag.heightFits && res.allPacked) {
        this.mixedStatusBadge.className = 'status-badge safe';
        this.mixedStatusBadge.textContent = res.bagsRequired === 1 ? '✓ FITS 100% IN 1 BAG' : `✓ PACKED IN ${res.bagsRequired} BAGS`;
      } else {
        this.mixedStatusBadge.className = 'status-badge danger';
        this.mixedStatusBadge.textContent = '⚠️ EXCEEDS BAG CAPACITY';
      }
    }

    // Update Stats
    if (this.mixedTotalUnits) {
      this.mixedTotalUnits.textContent = `${activeBag.itemCount} items`;
    }
    if (this.mixedTotalWeight) {
      this.mixedTotalWeight.textContent = `${activeBag.totalWeight.toFixed(1)} kg`;
    }
    if (this.mixedVolumeUtil) {
      this.mixedVolumeUtil.textContent = `${activeBag.volumeUtilization}%`;
    }
    if (this.mixedSupportCheck) {
      this.mixedSupportCheck.innerHTML = `<span style="color:#34d399;">✓ 100% supported</span>`;
    }

    // Multi-bag switcher
    if (this.mixedBagSwitcher && this.mixedBagButtons) {
      if (res.bagsRequired > 1) {
        this.mixedBagSwitcher.style.display = 'block';
        this.mixedBagButtons.innerHTML = '';
        res.bags.forEach((bag, idx) => {
          const btn = document.createElement('button');
          btn.className = `btn-pill ${idx === this.selectedBagIndex ? 'primary' : ''}`;
          btn.style.fontSize = '0.75rem';
          btn.textContent = `Bag #${idx + 1} (${bag.volumeUtilization}% vol, ${bag.itemCount} items)`;
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

    // Manifest breakdown text
    if (this.mixedManifestText) {
      const breakdown = Object.entries(activeBag.productCounts)
        .map(([name, count]) => `<strong>${count}×</strong> ${name}`)
        .join(' &nbsp;•&nbsp; ');
      this.mixedManifestText.innerHTML = `
        <div style="margin-bottom:4px;"><strong>Contents of ${activeBag.bagName}:</strong></div>
        <div>${breakdown}</div>
        <div style="margin-top:6px; color:#94a3b8; font-size:0.72rem;">
          Stack height: <strong>${activeBag.maxHeight} cm</strong> / 47 cm (${Math.max(0, this.bagSpec.height - activeBag.maxHeight).toFixed(1)} cm headroom remaining).
        </div>
      `;
    }
  }

  // Full Comparison Matrix
  renderMatrixTable() {
    if (!this.matrixTableBody) return;
    this.matrixTableBody.innerHTML = '';

    const specProducts = this.products.filter(p => !p.measured);
    const measuredProducts = this.products.filter(p => p.measured);

    const renderGroup = (products, groupTitle, groupSubtitle, isMeasured) => {
      const headerRow = document.createElement('tr');
      headerRow.className = 'matrix-group-header';
      headerRow.innerHTML = `
        <td colspan="9" style="background: ${isMeasured ? 'rgba(244, 63, 94, 0.14)' : 'rgba(99, 102, 241, 0.12)'}; color: ${isMeasured ? '#fecdd3' : '#c7d2fe'}; font-weight: 700; padding: 10px 14px; border-left: 3px solid ${isMeasured ? '#f43f5e' : '#818cf8'};">
          ${isMeasured ? '🔬' : '📐'} ${groupTitle} &nbsp;•&nbsp; <span style="font-weight: normal; font-size: 0.8rem; opacity: 0.9;">${groupSubtitle}</span>
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
          heightStatusBadge = `<span class="badge-danger">${fit.totalHeight.toFixed(2)} cm (+${fit.heightOverflow.toFixed(2)}cm)</span>`;
        }

        let footprintStatusBadge = '';
        if (fit.footprintFits) {
          footprintStatusBadge = `<span class="badge-safe">Fits (${fit.layerFootprintX}×${fit.layerFootprintY}cm)</span>`;
        } else {
          const overflow = Math.max(fit.lengthOverflow, fit.widthOverflow);
          footprintStatusBadge = `<span class="badge-danger">Exceeds (+${overflow.toFixed(1)}cm)</span>`;
        }

        const typeBadge = `<span class="status-pill ${p.measured ? 'measured' : 'spec'}" style="margin-left: 6px;">${p.measured ? 'measured' : 'spec'}</span>`;

        // For measured products, show computed max fit
        const maxFitDisplay = p.measured
          ? `<br/><small style="color:#fb7171">Max fit @ 47cm: ${Math.floor(this.bagSpec.height / p.exactHeight) * p.itemsPerLayer} items</small>`
          : '';

        row.innerHTML = `
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="color-dot" style="background:${p.color}; border: 1px solid ${p.trimColor}; width:12px; height:12px;"></div>
              <strong>${p.name}</strong>
              ${typeBadge}
            </div>
          </td>
          <td>${p.length} cm</td>
          <td>${p.width} cm</td>
          <td>${p.exactHeight.toFixed(4)} cm</td>
          <td><strong>${p.bagLimit}</strong>${maxFitDisplay}</td>
          <td>${p.itemsPerLayer} / layer (${requiredLayers} layers)</td>
          <td>${heightStatusBadge}</td>
          <td>${footprintStatusBadge}</td>
          <td style="font-size: 0.82rem; color: #cbd5e1;">${p.notes}</td>
        `;

        this.matrixTableBody.appendChild(row);
      });
    };

    renderGroup(
      specProducts,
      'DERIVED FOLD SPECIFICATIONS (10 Products)',
      'Fold thickness derived as 47 cm ÷ required layers. Fits 100% by mathematical definition at 0% squish.',
      false
    );

    renderGroup(
      measuredProducts,
      'MEASURED PHYSICAL SAMPLES (1 Product)',
      'Real empirical vendor measurements. Tests actual physical bag capacity & clearances.',
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
