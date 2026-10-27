import './style.css';
import { BagVisualizer } from './scene/bagVisualizer.js';
import { UIController } from './ui/controls.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('viewport-canvas-container');
  const tooltip = document.getElementById('product-tooltip');

  if (!container) {
    console.error('Canvas container not found');
    return;
  }

  // Initialize Three.js scene engine
  const visualizer = new BagVisualizer(container, tooltip);

  // Initialize UI interactive controls & logic
  const ui = new UIController(visualizer);

  console.log('🧺 Red Bag 3D Packing Visualizer initialized successfully.');
});
