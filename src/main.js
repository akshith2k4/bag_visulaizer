import './style.css';
import { BagVisualizer } from './scene/bagVisualizer.js';
import { UIController } from './ui/controls.js';
import { RackControls } from './ui/rackControls.js';

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
  const rackUI = new RackControls(visualizer);

  // Pass the rackUI instance to the main UIController so it can notify it on tab switch
  ui.rackUI = rackUI;

  console.log('🧺 Red Bag 3D Packing Visualizer + Rack Planner initialized.');
});

