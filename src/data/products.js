/**
 * Linen and Bag Specification Data
 * Red Bag Dimensions: 83.0 (L) × 42.0 (W) × 47.0 (H) cm.
 * Volume: 83 * 42 * 47 = 163,842 cm³ (~163.84 Liters)
 *
 * IMPORTANT: `exactHeight` is the TARGET fold thickness derived as:
 *   47 cm / ceil(bagLimit / itemsPerLayer)
 * It is a derived specification, not an empirical measurement.
 * Products with `measured: true` carry real physical/vendor-supplied thicknesses.
 */

export const DEFAULT_BAG = {
  id: "red-bag",
  name: "Red Bag",
  color: "#e11d48", // Crimson Red
  trimColor: "#881337", // Deep wine red for reinforced straps/seams
  length: 83.0, // X axis (cm)
  width: 42.0,  // Y axis / breadth (cm)
  height: 47.0, // Z axis / height (cm)
  maxHeight: 47.0,
  wallThickness: 0.4,
};

export const PRODUCTS = [
  {
    id: "pillow-cover",
    name: "Pillow Cover",
    category: "Bedding",
    length: 36.9,
    width: 24.5,
    exactHeight: 47 / 150, // 0.3133 cm for 300 items at 2/layer (150 layers)
    bagLimit: 300,
    itemsPerLayer: 2,
    measured: false,
    color: "#f8fafc",
    trimColor: "#cbd5e1",
    defaultOrientation: 90, // 24.5 * 2 = 49 <= 83 cm; 36.9 <= 42 cm
    notes: "Spec fold: 150 layers × 0.3133 cm = 47.0 cm. Fits 300 pillow covers into 1 Red Bag.",
    hasDiscrepancy: false
  },
  {
    id: "hand-towel",
    name: "Hand Towel",
    category: "Towels",
    length: 37.6,
    width: 29.2,
    exactHeight: 47 / 50, // 0.9400 cm for 100 items at 2/layer (50 layers)
    bagLimit: 100,
    itemsPerLayer: 2,
    measured: false,
    color: "#38bdf8",
    trimColor: "#0284c7",
    defaultOrientation: 90, // 29.2 * 2 = 58.4 <= 83 cm; 37.6 <= 42 cm
    notes: "Spec fold: 50 layers × 0.9400 cm = 47.0 cm. 2 items/layer × 50 layers = 100 items.",
    hasDiscrepancy: false,
    variants: [
      {
        id: "2-per-layer",
        name: "2 per layer (Wide 29.2cm fold)",
        length: 37.6,
        width: 29.2,
        exactHeight: 47 / 50,
        itemsPerLayer: 2,
        notes: "2 per layer: Width 29.2cm × 2 = 58.4cm <= 83cm. Height 0.94cm × 50 layers = 47.0cm."
      },
      {
        id: "3-per-layer",
        name: "3 per layer (Narrow 22.6cm fold)",
        length: 37.6,
        width: 22.6,
        exactHeight: 47 / 34, // 1.3824 cm for 100 items at 3/layer (34 layers)
        itemsPerLayer: 3,
        notes: "3 per layer: Width 22.6cm × 3 = 67.8cm (fits 83cm length). 34 layers × 1.3824cm = 47.0cm. Fits all 100 towels in 1 bag."
      }
    ]
  },
  {
    id: "double-bed-sheet",
    name: "Double Bed Sheet",
    category: "Sheets",
    length: 67.5,
    width: 38.5,
    exactHeight: 47 / 45, // 1.0444 cm
    bagLimit: 45,
    itemsPerLayer: 1,
    measured: false,
    color: "#c084fc",
    trimColor: "#9333ea",
    defaultOrientation: 0, // 67.5 <= 83 cm; 38.5 <= 42 cm
    notes: "Spec fold: 45 layers × 1.0444 cm = 47.0 cm. Fits with +15.5cm length clearance & +3.5cm width clearance.",
    hasDiscrepancy: false
  },
  {
    id: "single-bed-sheet",
    name: "Single Bed Sheet",
    category: "Sheets",
    length: 47.5,
    width: 39.0,
    exactHeight: 47 / 45, // 1.0444 cm
    bagLimit: 45,
    itemsPerLayer: 1,
    measured: false,
    color: "#a5b4fc",
    trimColor: "#6366f1",
    defaultOrientation: 0, // 47.5 <= 83 cm; 39.0 <= 42 cm
    notes: "Spec fold: 45 layers × 1.0444 cm = 47.0 cm. Fits with 35.5cm length margin.",
    hasDiscrepancy: false
  },
  {
    id: "bath-mat",
    name: "Bath Mat (3 Fold)",
    category: "Bath",
    length: 35.5,
    width: 24.0,
    exactHeight: 47 / 38, // 1.2368 cm for 75 items (ceil(75/2) = 38 layers)
    bagLimit: 75,
    itemsPerLayer: 2,
    measured: false,
    color: "#4ade80",
    trimColor: "#16a34a",
    defaultOrientation: 90, // 24.0 * 2 = 48 <= 83 cm; 35.5 <= 42 cm
    notes: "Spec fold: 38 layers (ceil(75/2)) × 1.2368 cm = 47.0 cm. Fits 75 mats into 1 bag.",
    hasDiscrepancy: false
  },
  {
    id: "bath-robe",
    name: "Bath Robe",
    category: "Robes",
    length: 42.5,
    width: 29.8,
    exactHeight: 47 / 30, // 1.5667 cm
    bagLimit: 30,
    itemsPerLayer: 1,
    measured: false,
    color: "#fde047",
    trimColor: "#ca8a04",
    defaultOrientation: 0, // 42.5 <= 83 cm; 29.8 <= 42 cm
    notes: "Spec fold: 30 layers × 1.5667 cm = 47.0 cm. 1 item/layer × 30 layers = 30 items.",
    hasDiscrepancy: false
  },
  {
    id: "single-duvet-cover",
    name: "Single Duvet Cover",
    category: "Duvets",
    length: 43.5,
    width: 30.0,
    exactHeight: 47 / 20, // 2.3500 cm
    bagLimit: 20,
    itemsPerLayer: 1,
    measured: false,
    color: "#fb923c",
    trimColor: "#ea580c",
    defaultOrientation: 0, // 43.5 <= 83 cm; 30.0 <= 42 cm
    notes: "Spec fold: 20 layers × 2.3500 cm = 47.0 cm. 1 item/layer × 20 layers = 20 items.",
    hasDiscrepancy: false
  },
  {
    id: "double-duvet-cover",
    name: "Double Duvet Cover",
    category: "Duvets",
    lengthInches: 29.0,
    widthInches: 13.6,
    heightInches: 0.925, // 2.35 cm (47 cm / 20 layers)
    length: 73.66, // 29.0 inches * 2.54
    width: 34.54,  // 13.6 inches * 2.54
    exactHeight: 47 / 20, // 2.3500 cm (fits 20 items in 47 cm height)
    bagLimit: 20,
    itemsPerLayer: 1,
    measured: false,
    color: "#f43f5e",
    trimColor: "#be123c",
    defaultOrientation: 0,
    notes: "Spec fold: 29.0\" × 13.6\" × 0.93\" (73.7 × 34.5 × 2.35 cm). Footprint fits in 83×42 cm bag (+9.3 cm length clearance, +7.5 cm width clearance). 20 layers × 2.3500 cm = 47.0 cm. Fits all 20 duvet covers into 1 Red Bag.",
    hasDiscrepancy: false
  },
  {
    id: "queen-duvet-cover",
    name: "Queen Duvet Cover",
    category: "Duvets",
    length: 62.8,
    width: 35.4,
    exactHeight: 47 / 20, // 2.3500 cm
    bagLimit: 20,
    itemsPerLayer: 1,
    measured: false,
    color: "#f472b6",
    trimColor: "#db2777",
    defaultOrientation: 0, // 62.8 <= 83 cm; 35.4 <= 42 cm
    notes: "Spec fold: 20 layers × 2.3500 cm = 47.0 cm. Fits with 20.2cm length & 6.6cm width margins.",
    hasDiscrepancy: false
  },
  {
    id: "bath-towel",
    name: "Bath Towel",
    category: "Towels",
    length: 36.8,
    width: 26.5,
    exactHeight: 47 / 15, // 3.1333 cm
    bagLimit: 30,
    itemsPerLayer: 2,
    measured: false,
    color: "#2dd4bf",
    trimColor: "#0f766e",
    defaultOrientation: 90, // 26.5 * 2 = 53 <= 83 cm; 36.8 <= 42 cm
    notes: "Spec fold: 15 layers × 3.1333 cm = 47.0 cm. 2 items/layer × 15 layers = 30 items.",
    hasDiscrepancy: false
  },
  {
    id: "face-towel",
    name: "Face Towel",
    category: "Towels",
    length: 29.8,
    width: 27.4,
    exactHeight: 47 / 13, // 3.6154 cm
    bagLimit: 26,
    itemsPerLayer: 2,
    measured: false,
    color: "#34d399",
    trimColor: "#059669",
    defaultOrientation: 90, // 27.4 * 2 = 54.8 <= 83 cm; 29.8 <= 42 cm
    notes: "Spec fold: 13 layers × 3.6154 cm = 47.0 cm. 2 items/layer × 13 layers = 26 items.",
    hasDiscrepancy: false
  }
];

/**
 * Calculates packing geometry, height, clearances, compression, and bag capacity.
 * @param {Object} product
 * @param {number} count
 * @param {number} orientationDeg
 * @param {Object} bag
 * @param {number} compressionFactor - default 0 (0% squish)
 */
export function calculateFit(product, count, orientationDeg, bag = DEFAULT_BAG, compressionFactor = 0) {
  const isRotated = orientationDeg === 90;
  // If rotated 90°, swap product dimensions on the floor plane
  const itemLen = isRotated ? product.width : product.length;
  const itemWid = isRotated ? product.length : product.width;

  const itemsPerLayer = product.itemsPerLayer || 1;
  const totalLayers = Math.ceil(count / itemsPerLayer);
  const rawHeight = totalLayers * product.exactHeight;

  // Apply squish / compression factor (default 0 = uncompressed fold spec)
  const effectiveHeight = rawHeight * (1 - compressionFactor);
  const heightRatio = effectiveHeight / bag.height;
  const rawHeightRatio = rawHeight / bag.height;
  const heightOverflow = Math.max(0, effectiveHeight - bag.height);
  const heightClearance = Math.max(0, bag.height - effectiveHeight);

  // Bag count requirements (using 1e-6 to avoid floating point precision edge cases)
  const bagsRequiredRaw = Math.ceil((rawHeight - 1e-6) / bag.height) || 1;
  const bagsRequiredCompressed = Math.ceil((effectiveHeight - 1e-6) / bag.height) || 1;
  const bagsSaved = Math.max(0, bagsRequiredRaw - bagsRequiredCompressed);

  // Footprint arrangement calculation
  let layerFootprintX = itemLen;
  let layerFootprintY = itemWid;

  if (itemsPerLayer === 2) {
    // 2 side-by-side along the bag's Length (X)
    layerFootprintX = itemLen * 2;
    layerFootprintY = itemWid;
  } else if (itemsPerLayer === 3) {
    // 3 side-by-side along the bag's Length (X)
    layerFootprintX = itemLen * 3;
    layerFootprintY = itemWid;
  }

  // Allow flexible bag compression on length/width (only if squish is dialed in)
  const lengthOverflow = Math.max(0, layerFootprintX - bag.length * (1 + compressionFactor * 0.3));
  const widthOverflow = Math.max(0, layerFootprintY - bag.width * (1 + compressionFactor * 0.3));

  const footprintFits = lengthOverflow <= 0.05 && widthOverflow <= 0.05;
  const heightFits = effectiveHeight <= bag.height + 0.05; // 0.05 cm float margin

  // Volume calculations
  const productSingleVolume = product.length * product.width * product.exactHeight;
  const totalProductVolume = count * productSingleVolume;
  const bagVolume = bag.length * bag.width * bag.height;
  const volumeUtilization = (totalProductVolume / bagVolume) * 100;

  return {
    count,
    totalLayers,
    rawHeight: Number(rawHeight.toFixed(2)),
    totalHeight: Number(effectiveHeight.toFixed(2)),
    compressionFactor,
    compressionPercent: Math.round(compressionFactor * 100),
    heightRatio: Number((heightRatio * 100).toFixed(1)),
    rawHeightRatio: Number((rawHeightRatio * 100).toFixed(1)),
    heightFits,
    heightOverflow: Number(heightOverflow.toFixed(2)),
    heightClearance: Number(heightClearance.toFixed(2)),
    bagsRequired: bagsRequiredCompressed,
    bagsRequiredRaw,
    bagsSaved,
    layerFootprintX: Number(layerFootprintX.toFixed(2)),
    layerFootprintY: Number(layerFootprintY.toFixed(2)),
    lengthClearance: Number((bag.length - layerFootprintX).toFixed(2)),
    widthClearance: Number((bag.width - layerFootprintY).toFixed(2)),
    lengthOverflow: Number(lengthOverflow.toFixed(2)),
    widthOverflow: Number(widthOverflow.toFixed(2)),
    footprintFits,
    totalProductVolume: Math.round(totalProductVolume),
    bagVolume: Math.round(bagVolume),
    volumeUtilization: Number(volumeUtilization.toFixed(1)),
    itemLen,
    itemWid,
    itemsPerLayer
  };
}
