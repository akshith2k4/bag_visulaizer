import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createFabricTexture,
  createFloorGridTexture,
  createTextBadgeTexture,
  createWireMeshTexture,
  createPerforatedDeckTexture,
  createWarehouseFloorTexture,
  createContactShadowTexture,
  createBayMarkerTexture
} from './textures.js';
import { DEFAULT_BAG } from '../data/products.js';

export class BagVisualizer {
  constructor(containerElement, tooltipElement) {
    this.container = containerElement;
    this.tooltip = tooltipElement;
    this.bagSpec = { ...DEFAULT_BAG };
    this.rackSpec = {
      length: 130.6,
      width: 40.55,
      shelfClearance: 50.56,
      deckThickness: 0.7,
      shelvesCount: 4
    };
    // Clear height stays 50.56 cm; shelf pitch includes the deck so linens never clip the tier above.
    this.rackSpec.shelfPitch = this.rackSpec.shelfClearance + this.rackSpec.deckThickness;
    this.rackSpec.totalHeight =
      this.rackSpec.shelfPitch * (this.rackSpec.shelvesCount - 1) +
      this.rackSpec.deckThickness +
      this.rackSpec.shelfClearance +
      4.0;
    this.mode = 'bag'; // 'bag' or 'rack'
    this.rackGroup = null;
    this.rackLinenGroup = null;
    this.currentProduct = null;
    this.currentCount = 0;
    this.currentOrientation = 0; // 0 or 90
    this.explodeValue = 0; // 0 to 1
    this.bagOpacity = 0.35;
    this.showWireframe = false;
    this.showDimensions = true;
    this.compressionFactor = 0; // Default 0 (uncompressed fold spec)
    this.supportThreshold = 0.65; // Matches the mixed packer's stability threshold

    // Texture and material caches to prevent GPU memory leaks
    this._fabricTexCache = new Map();
    this._linenMatCache = new Map();
    this.overflowMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.5,
      metalness: 0.1
    });

    // Mixed packing items (for mixed pack mode)
    this.mixedItems = [];

    this.productMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-1000, -1000);
    this.hoveredObject = null;

    this.initScene();
    this.setupLighting();
    this.buildGround();
    this.buildBag();
    this.setupEventListeners();
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#080d1a');
    this.defaultFog = new THREE.FogExp2('#080d1a', 0.005);
    this.scene.fog = this.defaultFog;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 2000);
    this.camera.position.set(110, 85, 120);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, this.bagSpec.height / 2, 0);
    this.controls.minDistance = 20;
    this.controls.maxDistance = 300;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // allow slightly below horizon
  }

  setupLighting() {
    this.lightGroup = new THREE.Group();

    // 1. Hemisphere Light (Sky & Ground Ambient)
    this.hemiLight = new THREE.HemisphereLight('#f8fafc', '#0f172a', 0.95);
    this.lightGroup.add(this.hemiLight);

    // 2. Primary Key Light (Main softbox casting realistic shadows)
    this.keyLight = new THREE.DirectionalLight('#fffdf5', 2.2);
    this.keyLight.position.set(75, 130, 65);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 350;
    const d = 65;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.radius = 2.5; // Soft shadow blur
    this.lightGroup.add(this.keyLight);

    // 3. Fill Light (Soft cool bounce to illuminate opposite side folds)
    this.fillLight = new THREE.DirectionalLight('#e0f2fe', 1.2);
    this.fillLight.position.set(-65, 90, 50);
    this.lightGroup.add(this.fillLight);

    // 4. Rim / Edge Light (Backlight for crisp bag and fabric silhouette)
    this.rimLight = new THREE.DirectionalLight('#93c5fd', 1.6);
    this.rimLight.position.set(-50, 95, -75);
    this.lightGroup.add(this.rimLight);

    // 5. Overhead Spotlight for Direct Downward Stack Illumination
    this.spotLight = new THREE.SpotLight('#ffffff', 2.0);
    this.spotLight.position.set(0, 110, 0);
    this.spotLight.target.position.set(0, 23.5, 0);
    this.spotLight.angle = Math.PI / 4;
    this.spotLight.penumbra = 0.5;
    this.spotLight.decay = 1.2;
    this.spotLight.distance = 250;
    this.spotLight.castShadow = false;
    this.lightGroup.add(this.spotLight);
    this.lightGroup.add(this.spotLight.target);

    // 6. Point Light Inside/Above the Bag Opening for Crystal Clear Stack Inspection
    this.interiorPointLight = new THREE.PointLight('#fffbeb', 1.5, 130);
    this.interiorPointLight.position.set(0, 52, 0);
    this.lightGroup.add(this.interiorPointLight);

    this.scene.add(this.lightGroup);
  }

  setLightingPreset(preset) {
    this.currentLightingPreset = preset;
    switch(preset) {
      case 'daylight':
        this.hemiLight.color.set('#f0f9ff');
        this.hemiLight.groundColor.set('#1e293b');
        this.hemiLight.intensity = 1.1;
        this.keyLight.color.set('#ffffff');
        this.keyLight.intensity = 2.4;
        this.fillLight.color.set('#e2e8f0');
        this.fillLight.intensity = 1.3;
        this.rimLight.color.set('#cbd5e1');
        this.spotLight.intensity = 1.8;
        this.interiorPointLight.intensity = 1.3;
        break;
      case 'spotlight':
        this.hemiLight.intensity = 0.5;
        this.keyLight.intensity = 1.2;
        this.fillLight.intensity = 0.6;
        this.rimLight.intensity = 1.0;
        this.spotLight.color.set('#ffffff');
        this.spotLight.intensity = 4.5;
        this.interiorPointLight.intensity = 3.0;
        break;
      case 'vibrant':
        this.hemiLight.color.set('#38bdf8');
        this.hemiLight.groundColor.set('#0f172a');
        this.hemiLight.intensity = 0.9;
        this.keyLight.color.set('#fed7aa');
        this.keyLight.intensity = 2.5;
        this.fillLight.color.set('#818cf8');
        this.fillLight.intensity = 1.6;
        this.rimLight.color.set('#f43f5e');
        this.rimLight.intensity = 2.4;
        this.spotLight.intensity = 2.2;
        this.interiorPointLight.intensity = 1.8;
        break;
      case 'studio':
      default:
        this.hemiLight.color.set('#f8fafc');
        this.hemiLight.groundColor.set('#0f172a');
        this.hemiLight.intensity = 0.95;
        this.keyLight.color.set('#fffdf5');
        this.keyLight.intensity = 2.2;
        this.fillLight.color.set('#e0f2fe');
        this.fillLight.intensity = 1.2;
        this.rimLight.color.set('#93c5fd');
        this.rimLight.intensity = 1.6;
        this.spotLight.intensity = 2.0;
        this.interiorPointLight.intensity = 1.5;
        break;
    }
  }

  setExposure(val) {
    if (this.renderer) {
      this.renderer.toneMappingExposure = Math.max(0.4, Math.min(3.0, val));
    }
  }

  adjustLightingForRacks(totalRacks = 1) {
    const rackSpacing = this.rackSpec.length + 40;
    const spanX = Math.max(1, totalRacks) * rackSpacing;
    const halfSpan = spanX / 2 + 120;

    // Expand keyLight shadow frustum so all racks cast beautiful, unclipped soft shadows
    if (this.keyLight) {
      this.keyLight.position.set(spanX * 0.2, 340, 240);
      this.keyLight.target.position.set(0, 100, 0);
      this.keyLight.shadow.camera.left = -halfSpan;
      this.keyLight.shadow.camera.right = halfSpan;
      this.keyLight.shadow.camera.top = 280;
      this.keyLight.shadow.camera.bottom = -80;
      this.keyLight.shadow.camera.near = 20;
      this.keyLight.shadow.camera.far = 900;
      this.keyLight.shadow.camera.updateProjectionMatrix();
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.intensity = 2.4;
    }

    // Wide ambient warehouse hemisphere lighting
    if (this.hemiLight) {
      this.hemiLight.intensity = 1.25;
      this.hemiLight.color.set('#f8fafc');
      this.hemiLight.groundColor.set('#1e293b');
    }

    if (this.fillLight) {
      this.fillLight.position.set(-halfSpan * 0.7, 260, 200);
      this.fillLight.intensity = 1.4;
    }

    if (this.rimLight) {
      this.rimLight.position.set(halfSpan * 0.7, 260, -220);
      this.rimLight.intensity = 1.5;
    }

    if (this.spotLight) {
      this.spotLight.position.set(0, 360, 0);
      this.spotLight.target.position.set(0, 100, 0);
      this.spotLight.angle = Math.PI / 2.6;
      this.spotLight.distance = Math.max(500, spanX * 1.6);
      this.spotLight.intensity = 2.2;
    }
  }

  restoreBagLighting() {
    if (this.keyLight) {
      this.keyLight.position.set(75, 130, 65);
      this.keyLight.target.position.set(0, 23.5, 0);
      const d = 65;
      this.keyLight.shadow.camera.left = -d;
      this.keyLight.shadow.camera.right = d;
      this.keyLight.shadow.camera.top = d;
      this.keyLight.shadow.camera.bottom = -d;
      this.keyLight.shadow.camera.near = 10;
      this.keyLight.shadow.camera.far = 350;
      this.keyLight.shadow.camera.updateProjectionMatrix();
      this.keyLight.intensity = 2.2;
    }

    if (this.hemiLight) {
      this.hemiLight.intensity = 0.95;
      this.hemiLight.color.set('#f8fafc');
      this.hemiLight.groundColor.set('#0f172a');
    }

    if (this.fillLight) {
      this.fillLight.position.set(-65, 90, 50);
      this.fillLight.intensity = 1.2;
    }

    if (this.rimLight) {
      this.rimLight.position.set(-50, 95, -75);
      this.rimLight.intensity = 1.6;
    }

    if (this.spotLight) {
      this.spotLight.position.set(0, 110, 0);
      this.spotLight.target.position.set(0, 23.5, 0);
      this.spotLight.angle = Math.PI / 4;
      this.spotLight.distance = 250;
      this.spotLight.intensity = 2.0;
    }
  }

  buildGround() {
    // Expansive warehouse concrete floor (60 × 60 meters)
    const groundGeo = new THREE.PlaneGeometry(6000, 6000);
    this.warehouseFloorTexture = createWarehouseFloorTexture();
    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.warehouseFloorTexture,
      roughness: 0.75,
      metalness: 0.2
    });

    this.groundMesh = new THREE.Mesh(groundGeo, this.floorMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = -0.05;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // Bag soft contact shadow (only shown in bag mode)
    const shadowGeo = new THREE.PlaneGeometry(130, 90);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.shadowPlate = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowPlate.rotation.x = -Math.PI / 2;
    this.shadowPlate.position.y = 0.01;
    this.scene.add(this.shadowPlate);

    // Group for rack staging environment (individual rack contact shadows & bay floor markers)
    this.rackEnvGroup = new THREE.Group();
    this.scene.add(this.rackEnvGroup);
  }

  buildBag() {
    if (this.bagGroup) {
      this.scene.remove(this.bagGroup);
    }

    this.bagGroup = new THREE.Group();
    const { length, width, height, color, trimColor } = this.bagSpec;

    // 1. Semi-transparent Bag Walls
    // We create a 5-sided open box (bottom, front, back, left, right)
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      roughness: 0.45,
      metalness: 0.08,
      transparent: true,
      opacity: this.bagOpacity,
      transmission: 0.25,
      ior: 1.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.bagWallMaterial = wallMat;

    // Bottom face
    const bottomGeo = new THREE.PlaneGeometry(length, width);
    const bottom = new THREE.Mesh(bottomGeo, wallMat);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.set(0, 0, 0);
    this.bagGroup.add(bottom);

    // Front wall (along X axis at +Z)
    const frontGeo = new THREE.PlaneGeometry(length, height);
    const front = new THREE.Mesh(frontGeo, wallMat);
    front.position.set(0, height / 2, width / 2);
    this.bagGroup.add(front);

    // Back wall (along X axis at -Z)
    const backGeo = new THREE.PlaneGeometry(length, height);
    const back = new THREE.Mesh(backGeo, wallMat);
    back.position.set(0, height / 2, -width / 2);
    this.bagGroup.add(back);

    // Left wall (along Z axis at -X)
    const leftGeo = new THREE.PlaneGeometry(width, height);
    const left = new THREE.Mesh(leftGeo, wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-length / 2, height / 2, 0);
    this.bagGroup.add(left);

    // Right wall (along Z axis at +X)
    const rightGeo = new THREE.PlaneGeometry(width, height);
    const right = new THREE.Mesh(rightGeo, wallMat);
    right.rotation.y = Math.PI / 2;
    right.position.set(length / 2, height / 2, 0);
    this.bagGroup.add(right);

    // 2. Reinforced Piping / Edge Seams
    const seamRadius = 0.45;
    const seamMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(trimColor),
      roughness: 0.35,
      metalness: 0.2
    });

    const makeCylinder = (x1, y1, z1, x2, y2, z2) => {
      const v1 = new THREE.Vector3(x1, y1, z1);
      const v2 = new THREE.Vector3(x2, y2, z2);
      const len = v1.distanceTo(v2);
      const cylGeo = new THREE.CylinderGeometry(seamRadius, seamRadius, len, 8);
      const cyl = new THREE.Mesh(cylGeo, seamMat);
      cyl.castShadow = true;
      const mid = v1.clone().add(v2).multiplyScalar(0.5);
      cyl.position.copy(mid);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
      return cyl;
    };

    const halfX = length / 2;
    const halfZ = width / 2;

    // 4 vertical corner seams
    this.bagGroup.add(makeCylinder(-halfX, 0, -halfZ, -halfX, height, -halfZ));
    this.bagGroup.add(makeCylinder(halfX, 0, -halfZ, halfX, height, -halfZ));
    this.bagGroup.add(makeCylinder(halfX, 0, halfZ, halfX, height, halfZ));
    this.bagGroup.add(makeCylinder(-halfX, 0, halfZ, -halfX, height, halfZ));

    // 4 bottom perimeter seams
    this.bagGroup.add(makeCylinder(-halfX, 0, -halfZ, halfX, 0, -halfZ));
    this.bagGroup.add(makeCylinder(halfX, 0, -halfZ, halfX, 0, halfZ));
    this.bagGroup.add(makeCylinder(halfX, 0, halfZ, -halfX, 0, halfZ));
    this.bagGroup.add(makeCylinder(-halfX, 0, halfZ, -halfX, 0, -halfZ));

    // 4 top perimeter lip seams (open top rim)
    this.bagGroup.add(makeCylinder(-halfX, height, -halfZ, halfX, height, -halfZ));
    this.bagGroup.add(makeCylinder(halfX, height, -halfZ, halfX, height, halfZ));
    this.bagGroup.add(makeCylinder(halfX, height, halfZ, -halfX, height, halfZ));
    this.bagGroup.add(makeCylinder(-halfX, height, halfZ, -halfX, height, -halfZ));

    // 3. Webbing Carry Straps on Left & Right
    const strapMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      roughness: 0.8
    });
    const strapW = 3.5;
    const strapGeo = new THREE.BoxGeometry(strapW, height * 0.7, 0.4);
    const leftStrap = new THREE.Mesh(strapGeo, strapMat);
    leftStrap.position.set(-halfX - 0.2, height * 0.45, 0);
    leftStrap.rotation.y = Math.PI / 2;
    this.bagGroup.add(leftStrap);

    const rightStrap = new THREE.Mesh(strapGeo, strapMat);
    rightStrap.position.set(halfX + 0.2, height * 0.45, 0);
    rightStrap.rotation.y = Math.PI / 2;
    this.bagGroup.add(rightStrap);

    // 4. Max 47cm Height Limit Laser Line & Plane
    this.buildHeightLimitIndicator();

    // 5. Dimension Calipers & Visual Annotations
    this.buildDimensionCalipers();

    this.scene.add(this.bagGroup);
  }

  buildHeightLimitIndicator() {
    const { length, width, height } = this.bagSpec;
    const halfX = length / 2;
    const halfZ = width / 2;

    // Glowing laser dashed frame at top rim (47 cm)
    const points = [
      new THREE.Vector3(-halfX, height, -halfZ),
      new THREE.Vector3(halfX, height, -halfZ),
      new THREE.Vector3(halfX, height, halfZ),
      new THREE.Vector3(-halfX, height, halfZ),
      new THREE.Vector3(-halfX, height, -halfZ)
    ];
    const laserGeo = new THREE.BufferGeometry().setFromPoints(points);
    const laserMat = new THREE.LineDashedMaterial({
      color: 0xef4444,
      dashSize: 2.0,
      gapSize: 1.0,
      linewidth: 2
    });
    const laserLine = new THREE.Line(laserGeo, laserMat);
    laserLine.computeLineDistances();
    this.bagGroup.add(laserLine);

    // Translucent top ceiling plane (shows limit line)
    const ceilingGeo = new THREE.PlaneGeometry(length, width);
    const ceilingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.limitCeiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    this.limitCeiling.rotation.x = Math.PI / 2;
    this.limitCeiling.position.set(0, height, 0);
    this.bagGroup.add(this.limitCeiling);

    // Height laser fill plane that tracks stack height
    const fillPlaneGeo = new THREE.PlaneGeometry(length * 0.99, width * 0.99);
    this.fillPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.stackFillPlane = new THREE.Mesh(fillPlaneGeo, this.fillPlaneMat);
    this.stackFillPlane.rotation.x = Math.PI / 2;
    this.stackFillPlane.position.set(0, 0, 0);
    this.bagGroup.add(this.stackFillPlane);
  }

  buildDimensionCalipers() {
    this.caliperGroup = new THREE.Group();
    const { length, width, height } = this.bagSpec;
    const halfX = length / 2;
    const halfZ = width / 2;

    // Helper to make dimension line with arrows
    const lineMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.75 });

    // 1. Length Dimension (Front bottom: along X at +Z offset)
    const zOffset = halfZ + 4.0;
    const lenPoints = [
      new THREE.Vector3(-halfX, 0.5, zOffset),
      new THREE.Vector3(halfX, 0.5, zOffset)
    ];
    const lenGeo = new THREE.BufferGeometry().setFromPoints(lenPoints);
    const lenLine = new THREE.Line(lenGeo, lineMat);
    this.caliperGroup.add(lenLine);

    // Tick lines
    const tickLen = 2.0;
    const tickGeoL = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfX, 0.5, zOffset - tickLen),
      new THREE.Vector3(-halfX, 0.5, zOffset + tickLen)
    ]);
    const tickGeoR = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(halfX, 0.5, zOffset - tickLen),
      new THREE.Vector3(halfX, 0.5, zOffset + tickLen)
    ]);
    this.caliperGroup.add(new THREE.Line(tickGeoL, lineMat));
    this.caliperGroup.add(new THREE.Line(tickGeoR, lineMat));

    // 3D Badge Sprite for Length
    const lenBadgeTex = createTextBadgeTexture(`Bag Length: ${length} cm`, 'rgba(15, 23, 42, 0.85)', '#38bdf8', '#0284c7');
    const lenSpriteMat = new THREE.SpriteMaterial({ map: lenBadgeTex, transparent: true });
    const lenSprite = new THREE.Sprite(lenSpriteMat);
    lenSprite.scale.set(16, 4, 1);
    lenSprite.position.set(0, 2.8, zOffset);
    this.caliperGroup.add(lenSprite);

    // 2. Width Dimension (Right bottom: along Z at +X offset)
    const xOffset = halfX + 4.0;
    const widPoints = [
      new THREE.Vector3(xOffset, 0.5, -halfZ),
      new THREE.Vector3(xOffset, 0.5, halfZ)
    ];
    const widGeo = new THREE.BufferGeometry().setFromPoints(widPoints);
    const widLine = new THREE.Line(widGeo, lineMat);
    this.caliperGroup.add(widLine);

    const widBadgeTex = createTextBadgeTexture(`Bag Width: ${width} cm`, 'rgba(15, 23, 42, 0.85)', '#a855f7', '#7e22ce');
    const widSpriteMat = new THREE.SpriteMaterial({ map: widBadgeTex, transparent: true });
    const widSprite = new THREE.Sprite(widSpriteMat);
    widSprite.scale.set(16, 4, 1);
    widSprite.position.set(xOffset, 2.8, 0);
    this.caliperGroup.add(widSprite);

    // 3. Height Dimension (Corner ruler: at -halfX - 4, -halfZ - 4)
    const rulerX = -halfX - 4.5;
    const rulerZ = halfZ + 4.0;
    const hPoints = [
      new THREE.Vector3(rulerX, 0, rulerZ),
      new THREE.Vector3(rulerX, height, rulerZ)
    ];
    const hGeo = new THREE.BufferGeometry().setFromPoints(hPoints);
    const hLine = new THREE.Line(hGeo, new THREE.LineBasicMaterial({ color: 0xef4444 }));
    this.caliperGroup.add(hLine);

    // Height ticks every 10cm
    for (let y = 0; y <= height; y += 10) {
      const hTickGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rulerX - 1.2, y, rulerZ),
        new THREE.Vector3(rulerX + 1.2, y, rulerZ)
      ]);
      this.caliperGroup.add(new THREE.Line(hTickGeo, lineMat));
    }
    // Top limit tick (at exact 47cm)
    const topTickGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(rulerX - 2.5, height, rulerZ),
      new THREE.Vector3(rulerX + 2.5, height, rulerZ)
    ]);
    this.caliperGroup.add(new THREE.Line(topTickGeo, new THREE.LineBasicMaterial({ color: 0xef4444 })));

    // Height 3D Badge Sprite
    const hBadgeTex = createTextBadgeTexture(`Bag Height Limit: ${height} cm`, 'rgba(15, 23, 42, 0.9)', '#f43f5e', '#e11d48');
    const hSpriteMat = new THREE.SpriteMaterial({ map: hBadgeTex, transparent: true });
    this.heightBadgeSprite = new THREE.Sprite(hSpriteMat);
    this.heightBadgeSprite.scale.set(22, 5.5, 1);
    this.heightBadgeSprite.position.set(rulerX - 4.0, height / 2, rulerZ);
    this.caliperGroup.add(this.heightBadgeSprite);

    this.bagGroup.add(this.caliperGroup);
  }

  /**
   * Builds the 3D folded product stack
   */
  updateProductStack(product, count, orientationDeg = 0, compressionFactor = this.compressionFactor) {
    this.currentMode = 'single';
    this.currentProduct = product;
    this.currentCount = count;
    this.currentOrientation = orientationDeg;
    this.compressionFactor = compressionFactor !== undefined ? compressionFactor : 0;

    // Clear old product geometries (shared materials are kept in cache)
    this.productMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.productMeshes = [];

    if (!product || count <= 0) {
      if (this.stackFillPlane) this.stackFillPlane.visible = false;
      return;
    }

    const isRotated = orientationDeg === 90;
    const itemLen = isRotated ? product.width : product.length;
    const itemWid = isRotated ? product.length : product.width;
    // Apply squish / compression to item height
    const itemHeight = product.exactHeight * (1 - this.compressionFactor);
    const itemsPerLayer = product.itemsPerLayer || 1;
    const totalLayers = Math.ceil(count / itemsPerLayer);
    const totalHeight = totalLayers * itemHeight;

    // Update fill plane at top of current stack
    if (this.stackFillPlane) {
      this.stackFillPlane.visible = true;
      this.stackFillPlane.position.y = Math.min(totalHeight, this.bagSpec.height + 15);

      // Color code fill plane: Green if fits, Red if exceeds bag height
      if (totalHeight > this.bagSpec.height + 0.1) {
        this.fillPlaneMat.color.setHex(0xef4444); // Red overflow
        this.limitCeiling.material.opacity = 0.28;
      } else if (totalHeight >= this.bagSpec.height * 0.95) {
        this.fillPlaneMat.color.setHex(0xeab308); // Amber near full
        this.limitCeiling.material.opacity = 0.18;
      } else {
        this.fillPlaneMat.color.setHex(0x10b981); // Emerald green safe
        this.limitCeiling.material.opacity = 0.08;
      }
    }

    // Cached texture lookup
    const key = product.color;
    if (!this._fabricTexCache.has(key)) {
      this._fabricTexCache.set(key, createFabricTexture(product.color, 'linen'));
    }
    const fabricTex = this._fabricTexCache.get(key);

    // Cached material lookup
    if (!this._linenMatCache.has(key)) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(product.color),
        map: fabricTex,
        roughness: 0.65,
        metalness: 0.05
      });
      this._linenMatCache.set(key, mat);
    }
    const linenMat = this._linenMatCache.get(key);
    const overflowMat = this.overflowMat;

    let currentItemIndex = 0;

    // Build layer by layer
    for (let layer = 0; layer < totalLayers; layer++) {
      const itemsInThisLayer = Math.min(itemsPerLayer, count - currentItemIndex);

      // Base Y position for this layer + vertical explosion separation
      const explodeY = layer * this.explodeValue * 1.5;
      const layerBaseY = layer * itemHeight + explodeY;
      const centerY = layerBaseY + itemHeight / 2;

      // Slight natural organic jitter so stacks look realistically folded
      const jitterX = (Math.sin(layer * 3.7) * 0.08);
      const jitterZ = (Math.cos(layer * 2.3) * 0.08);

      if (itemsPerLayer === 1) {
        // Single item centered on layer
        currentItemIndex++;
        const mesh = this.createFoldedLinenMesh(
          itemLen,
          itemHeight,
          itemWid,
          linenMat,
          layer,
          currentItemIndex,
          centerY
        );
        mesh.position.set(jitterX, centerY, jitterZ);

        // Check if footprint exceeds bag footprint
        const isOverflow = (itemLen > this.bagSpec.length) || (itemWid > this.bagSpec.width) || (centerY + itemHeight / 2 > this.bagSpec.height);
        if (isOverflow && (itemLen > this.bagSpec.length || itemWid > this.bagSpec.width)) {
          mesh.material = overflowMat;
        }

        this.scene.add(mesh);
        this.productMeshes.push(mesh);
      } else if (itemsPerLayer === 2) {
        // 2 items side-by-side along X axis
        const halfStepX = itemLen / 2;

        for (let i = 0; i < itemsInThisLayer; i++) {
          currentItemIndex++;
          const posX = (i === 0 ? -halfStepX : halfStepX) + jitterX;
          const posZ = jitterZ;

          const mesh = this.createFoldedLinenMesh(
            itemLen * 0.985, // tiny gap between folded packages
            itemHeight,
            itemWid,
            linenMat,
            layer,
            currentItemIndex,
            centerY
          );
          mesh.position.set(posX, centerY, posZ);

          // Check if footprint overflows
          const totalLayerX = itemLen * 2;
          const isOverflowX = totalLayerX > this.bagSpec.length;
          const isOverflowY = itemWid > this.bagSpec.width;

          if (isOverflowX || isOverflowY) {
            mesh.material = overflowMat;
          }

          this.scene.add(mesh);
          this.productMeshes.push(mesh);
        }
      } else if (itemsPerLayer === 3) {
        // 3 items side-by-side along X axis (e.g. Hand Towel 22.6cm x 3 = 67.8cm <= 83cm)
        for (let i = 0; i < itemsInThisLayer; i++) {
          currentItemIndex++;
          const posX = (i - 1) * itemLen + jitterX;
          const posZ = jitterZ;

          const mesh = this.createFoldedLinenMesh(
            itemLen * 0.985, // tiny gap between folded packages
            itemHeight,
            itemWid,
            linenMat,
            layer,
            currentItemIndex,
            centerY
          );
          mesh.position.set(posX, centerY, posZ);

          // Check if footprint overflows
          const totalLayerX = itemLen * 3;
          const isOverflowX = totalLayerX > this.bagSpec.length * (1 + (this.compressionFactor || 0) * 0.3);
          const isOverflowY = itemWid > this.bagSpec.width * (1 + (this.compressionFactor || 0) * 0.3);

          if (isOverflowX || isOverflowY) {
            mesh.material = overflowMat;
          }

          this.scene.add(mesh);
          this.productMeshes.push(mesh);
        }
      }
    }
  }

  setCompression(factor) {
    this.compressionFactor = Math.max(0, Math.min(0.2, factor));
    if (this.currentProduct && this.currentCount > 0) {
      this.updateProductStack(this.currentProduct, this.currentCount, this.currentOrientation, this.compressionFactor);
    }
  }

  createFoldedLinenMesh(dx, dy, dz, material, layerIndex, itemNumber, currentY) {
    // dy can be thin (e.g. 0.31 cm), maintain safety margin
    const h = Math.max(dy * 0.94, 0.15);
    const geo = new THREE.BoxGeometry(dx, h, dz);

    // Reuse shared material without cloning
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Attach metadata for raycasting & hover tooltip
    mesh.userData = {
      isLinenItem: true,
      product: this.currentProduct,
      layerIndex: layerIndex + 1,
      itemNumber,
      itemHeight: dy,
      centerY: Number(currentY.toFixed(2)),
      topY: Number((currentY + dy / 2).toFixed(2)),
      length: dx,
      width: dz
    };

    return mesh;
  }

  /**
   * Renders a 3D Bin Packing result for a mixed laundry order
   */
  renderPackedBag(bagData) {
    this.currentPackedBag = bagData;
    this.currentMode = 'mixed-packer';

    // Clear old product geometries
    this.productMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.productMeshes = [];

    if (!bagData || !bagData.items || bagData.items.length === 0) {
      if (this.stackFillPlane) this.stackFillPlane.visible = false;
      return;
    }

    const items = bagData.items;
    const maxHeight = bagData.maxHeight || 0;

    // Update fill plane at top of current stack
    if (this.stackFillPlane) {
      this.stackFillPlane.visible = true;
      this.stackFillPlane.position.y = Math.min(maxHeight, this.bagSpec.height + 15);

      if (maxHeight > this.bagSpec.height + 0.1) {
        this.fillPlaneMat.color.setHex(0xef4444);
        this.limitCeiling.material.opacity = 0.28;
      } else if (maxHeight >= this.bagSpec.height * 0.95) {
        this.fillPlaneMat.color.setHex(0xeab308);
        this.limitCeiling.material.opacity = 0.18;
      } else {
        this.fillPlaneMat.color.setHex(0x10b981);
        this.limitCeiling.material.opacity = 0.08;
      }
    }

    // Render every packed cuboid
    items.forEach((item, index) => {
      const key = item.color;
      if (!this._fabricTexCache.has(key)) {
        this._fabricTexCache.set(key, createFabricTexture(item.color, 'linen'));
      }
      const fabricTex = this._fabricTexCache.get(key);

      if (!this._linenMatCache.has(key)) {
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(item.color),
          map: fabricTex,
          roughness: 0.65,
          metalness: 0.05
        });
        this._linenMatCache.set(key, mat);
      }
      const mat = this._linenMatCache.get(key);

      // Centered position inside bag coordinate frame
      const posX = item.x + item.dx / 2 - this.bagSpec.length / 2;
      const posZ = item.z + item.dz / 2 - this.bagSpec.width / 2;
      // Explode Y expands items based on their elevation in the stack
      const explodeY = (item.y / Math.max(1, maxHeight)) * this.explodeValue * 25;
      const posY = item.y + item.dy / 2 + explodeY;

      // Small natural margin between stacked packages
      const h = Math.max(item.dy * 0.995, 0.12);
      const geo = new THREE.BoxGeometry(item.dx * 0.998, h, item.dz * 0.998);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, posY, posZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
        isLinenItem: true,
        product: { name: item.name, color: item.color },
        itemNumber: index + 1,
        totalItems: items.length,
        itemHeight: item.dy,
        topY: Number((item.y + item.dy).toFixed(2)),
        centerY: Number(posY.toFixed(2)),
        supportRatio: item.supportRatio !== undefined ? item.supportRatio : 100,
        x: item.x,
        y: item.y,
        z: item.z,
        dx: item.dx,
        dy: item.dy,
        dz: item.dz,
        rot: item.rot
      };

      this.scene.add(mesh);
      this.productMeshes.push(mesh);
    });
  }

  setExplode(val) {
    this.explodeValue = Math.max(0, Math.min(1, val));
    if (this.currentMode === 'mixed-packer' && this.currentPackedBag) {
      this.renderPackedBag(this.currentPackedBag);
    } else if (this.currentProduct && this.currentCount > 0) {
      this.updateProductStack(this.currentProduct, this.currentCount, this.currentOrientation, this.compressionFactor);
    }
  }

  setBagOpacity(val) {
    this.bagOpacity = Math.max(0.05, Math.min(1, val));
    if (this.bagWallMaterial) {
      this.bagWallMaterial.opacity = this.bagOpacity;
    }
  }

  toggleDimensions(show) {
    this.showDimensions = show;
    if (this.caliperGroup) {
      this.caliperGroup.visible = show;
    }
  }

  setCameraView(presetName) {
    const duration = 800;
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let endPos = new THREE.Vector3();
    let endTarget = new THREE.Vector3(0, this.bagSpec.height / 2, 0);

    if (this.mode === 'rack') {
      const totalRacks = this.currentTotalRacks || 1;
      const rackSpacing = this.rackSpec.length + 40;
      const spanX = totalRacks * rackSpacing;
      const centerY = this.rackSpec.totalHeight / 2;
      endTarget.set(0, centerY, 0);

      const aspect = (this.container.clientWidth || 1000) / (this.container.clientHeight || 700);
      const dist = totalRacks > 1
        ? Math.max(170, (spanX / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * Math.min(aspect, 1.8))) * 1.15)
        : 170;

      const camY = Math.max(115, 80 + (totalRacks * 8));
      const camX = totalRacks > 1 ? spanX * 0.22 : 125;

      switch (presetName) {
        case 'front':
          endPos.set(0, centerY, dist);
          break;
        case 'side':
          endPos.set(dist * 0.75, centerY, 0);
          break;
        case 'top':
          endPos.set(0, dist * 1.25, 0.01);
          break;
        case 'inside':
          endPos.set(0, centerY, 40);
          break;
        case 'iso':
        default:
          endPos.set(camX, camY, dist);
          break;
      }
    } else {
      const dist = 140;

      switch (presetName) {
        case 'front':
          endPos.set(0, this.bagSpec.height / 2, dist);
          break;
        case 'side':
          endPos.set(dist, this.bagSpec.height / 2, 0);
          break;
        case 'top':
          endPos.set(0, dist * 1.2, 0.01);
          break;
        case 'inside':
          endPos.set(0, 5, 5);
          endTarget.set(0, this.bagSpec.height, 0);
          break;
        case 'iso':
        default:
          endPos.set(110, 85, 120);
          break;
      }
    }

    const startTime = performance.now();
    const animateCamera = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Smooth easeInOutCubic
      const t = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, endPos, t);
      this.controls.target.lerpVectors(startTarget, endTarget, t);
      this.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };
    requestAnimationFrame(animateCamera);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseleave', () => {
      if (this.hoveredObject && this.hoveredObjectOriginalMat) {
        if (this.hoveredObject.material !== this.hoveredObjectOriginalMat) {
          this.hoveredObject.material.dispose();
          this.hoveredObject.material = this.hoveredObjectOriginalMat;
        }
      }
      this.hoveredObject = null;
      this.hoveredObjectOriginalMat = null;
      this.hideTooltip();
    });
  }

  onMouseMove(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.checkRaycast(e.clientX, e.clientY);
  }

  checkRaycast(clientX, clientY) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Check both bag items and rack items
    const targets = [...this.productMeshes];
    if (this.rackLinenGroup) {
      targets.push(...this.rackLinenGroup.children);
    }
    
    const intersects = this.raycaster.intersectObjects(targets, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (this.hoveredObject !== hit) {
        // Restore previous hovered object
        if (this.hoveredObject && this.hoveredObjectOriginalMat) {
          if (this.hoveredObject.material !== this.hoveredObjectOriginalMat) {
            this.hoveredObject.material.dispose();
            this.hoveredObject.material = this.hoveredObjectOriginalMat;
          }
        }
        this.hoveredObject = hit;
        this.hoveredObjectOriginalMat = hit.material;
        // Temporary clone only for the single hovered object
        const highlightMat = hit.material.clone();
        highlightMat.emissive = new THREE.Color(0x38bdf8);
        hit.material = highlightMat;
      }

      this.showTooltip(hit.userData, clientX, clientY);
    } else {
      if (this.hoveredObject && this.hoveredObjectOriginalMat) {
        if (this.hoveredObject.material !== this.hoveredObjectOriginalMat) {
          this.hoveredObject.material.dispose();
          this.hoveredObject.material = this.hoveredObjectOriginalMat;
        }
      }
      this.hoveredObject = null;
      this.hoveredObjectOriginalMat = null;
      this.hideTooltip();
    }
  }

  showTooltip(data, clientX, clientY) {
    if (!this.tooltip || !data) return;

    if (data.isRackItem) {
      const clearance = this.rackSpec ? this.rackSpec.shelfClearance : 50.56;
      const isExceeded = data.stackHeight > clearance;
      const statusHtml = isExceeded
        ? `<span class="badge-danger">⚠️ Exceeds ${clearance.toFixed(1)}cm clearance</span>`
        : `<span class="badge-safe">✓ Stack: ${data.stackHeight.toFixed(1)} cm</span>`;

      const detailsHtml = `
        <div class="tooltip-row"><span>Units in Stack:</span><strong>${data.count} units</strong></div>
        <div class="tooltip-row"><span>Stack Height:</span><strong>${data.stackHeight.toFixed(2)} cm</strong></div>
        <div class="tooltip-row"><span>Fold Thickness:</span><strong>${data.product.exactHeight.toFixed(2)} cm</strong></div>
        <div class="tooltip-row"><span>Footprint (L×W):</span><strong>${data.product.length} × ${data.product.width} cm</strong></div>
      `;

      this.tooltip.innerHTML = `
        <div class="tooltip-header">
          <strong>${data.product.name} (Bay Stack)</strong>
          ${statusHtml}
        </div>
        <div class="tooltip-body">
          ${detailsHtml}
        </div>
      `;
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = `${clientX + 16}px`;
      this.tooltip.style.top = `${clientY + 16}px`;
      return;
    }

    const isExceeded = data.topY > this.bagSpec.height;
    const statusHtml = isExceeded
      ? `<span class="badge-danger">⚠️ Above 47cm rim (+${(data.topY - this.bagSpec.height).toFixed(2)} cm)</span>`
      : `<span class="badge-safe">✓ Inside Bag Limit</span>`;

    let detailsHtml = '';
    if (data.supportRatio !== undefined) {
      // 3D Bin Packed item
      const supportOk = data.supportRatio >= this.supportThreshold * 100;
      const supportColor = supportOk ? '#34d399' : data.supportRatio >= 50 ? '#fbbf24' : '#f87171';
      const supportIcon = supportOk ? '✓' : '⚠';
      detailsHtml = `
        <div class="tooltip-row"><span>Packed Item #:</span><strong>${data.itemNumber} of ${data.totalItems}</strong></div>
        <div class="tooltip-row"><span>Footprint (X×Z):</span><strong>${data.dx.toFixed(1)} × ${data.dz.toFixed(1)} cm</strong></div>
        <div class="tooltip-row"><span>Fold Thickness:</span><strong>${data.dy.toFixed(2)} cm</strong></div>
        <div class="tooltip-row"><span>Elevation (Y):</span><strong>${data.y.toFixed(2)} → ${data.topY.toFixed(2)} cm</strong></div>
        <div class="tooltip-row"><span>Orientation:</span><strong>${data.rot === 0 ? 'Normal (0°)' : 'Rotated (90°)'}</strong></div>
        <div class="tooltip-row"><span>Support:</span><strong style="color:${supportColor};">${supportIcon} ${data.supportRatio}% supported</strong></div>
      `;
    } else {
      // Single product stack
      detailsHtml = `
        <div class="tooltip-row"><span>Item #:</span><strong>${data.itemNumber} of ${this.currentCount}</strong></div>
        <div class="tooltip-row"><span>Layer #:</span><strong>${data.layerIndex}</strong></div>
        <div class="tooltip-row"><span>Layer Thickness:</span><strong>${data.itemHeight.toFixed(4)} cm</strong></div>
        <div class="tooltip-row"><span>Top of Item:</span><strong>${data.topY.toFixed(2)} cm / ${this.bagSpec.height} cm</strong></div>
      `;
    }

    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <strong>${data.product.name}</strong>
        ${statusHtml}
      </div>
      <div class="tooltip-body">
        ${detailsHtml}
      </div>
    `;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${clientX + 16}px`;
    this.tooltip.style.top = `${clientY + 16}px`;
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  exportSnapshot() {
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `red-bag-${this.currentProduct ? this.currentProduct.id : 'stack'}-analysis.png`;
    link.href = dataUrl;
    link.click();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'rack') {
      // Remove fog so racks are crystal clear
      this.scene.fog = null;

      if (this.bagGroup) this.bagGroup.visible = false;
      if (this.productMeshes) {
        this.productMeshes.forEach(m => m.visible = false);
      }
      if (this.shadowPlate) this.shadowPlate.visible = false;
      if (this.rackEnvGroup) this.rackEnvGroup.visible = true;

      const totalRacks = this.currentTotalRacks || 1;
      if (!this.rackGroup) this.buildRack(totalRacks);
      this.adjustLightingForRacks(totalRacks);

      this.rackGroup.visible = true;
      if (this.rackLinenGroup) this.rackLinenGroup.visible = true;

      // Allow full 360 degree orbit and unrestricted zoom
      this.controls.maxPolarAngle = Math.PI;
      this.controls.minDistance = 10;
      this.controls.maxDistance = 3500;

      const rackSpacing = this.rackSpec.length + 40;
      const spanX = totalRacks * rackSpacing;
      const aspect = (this.container.clientWidth || 1000) / (this.container.clientHeight || 700);
      const dist = totalRacks > 1
        ? Math.max(170, (spanX / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * Math.min(aspect, 1.8))) * 1.15)
        : 170;

      const camY = Math.max(115, 80 + (totalRacks * 8));
      const camX = totalRacks > 1 ? spanX * 0.22 : 125;

      this.controls.target.set(0, this.rackSpec.totalHeight / 2, 0);
      this.camera.position.set(camX, camY, dist);
      this.controls.update();
    } else {
      // Restore atmospheric fog for bag mode
      this.scene.fog = this.defaultFog;

      if (this.rackGroup) this.rackGroup.visible = false;
      if (this.rackLinenGroup) this.rackLinenGroup.visible = false;
      if (this.rackEnvGroup) this.rackEnvGroup.visible = false;
      if (this.shadowPlate) this.shadowPlate.visible = true;
      if (this.bagGroup) this.bagGroup.visible = true;
      if (this.productMeshes) {
        this.productMeshes.forEach(m => m.visible = true);
      }

      this.restoreBagLighting();

      // Reset camera and controls constraints for the bag
      this.controls.maxPolarAngle = Math.PI / 2 + 0.05;
      this.controls.minDistance = 20;
      this.controls.maxDistance = 400;
      this.controls.target.set(0, this.bagSpec.height / 2, 0);
      this.camera.position.set(110, 85, 120);
      this.controls.update();
    }
  }

  buildRack(numRacks = 1) {
    if (this.rackGroup) this.scene.remove(this.rackGroup);
    this.rackGroup = new THREE.Group();

    const count = Math.max(1, numRacks);
    const rackWidth = this.rackSpec.length;
    const rackSpacing = rackWidth + 40; // 40 units gap between racks

    for (let r = 0; r < count; r++) {
      const offsetX = (r - (count - 1) / 2) * rackSpacing;
      const singleRack = this._createSingleRackFrame();
      singleRack.position.x = offsetX;
      this.rackGroup.add(singleRack);
    }

    this.scene.add(this.rackGroup);
    
    // Hide bag elements if they exist
    if (this.bagGroup) this.bagGroup.visible = false;
    if (this.productMeshes) {
      this.productMeshes.forEach(m => m.visible = false);
    }
  }

  _createSingleRackFrame() {
    const singleRack = new THREE.Group();
    const { length, width, shelfClearance, deckThickness, shelfPitch, shelvesCount, totalHeight } = this.rackSpec;
    const halfX = length / 2; // 65.3 cm
    const halfZ = width / 2; // 20.275 cm
    const postThick = 2.4; // 2.4 cm square upright tubing

    // 1. Textures & PBR Materials
    const wireTex = createWireMeshTexture();
    wireTex.repeat.set(12, 18);

    const sideWireTex = createWireMeshTexture();
    sideWireTex.repeat.set(4, 18);

    const deckTex = createPerforatedDeckTexture();
    deckTex.repeat.set(3, 1);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.82
    });

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.85
    });

    const deckMat = new THREE.MeshStandardMaterial({
      map: deckTex,
      color: 0x94a3b8,
      roughness: 0.5,
      metalness: 0.75
    });

    const wireMat = new THREE.MeshStandardMaterial({
      map: wireTex,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0.9
    });

    const sideWireMat = new THREE.MeshStandardMaterial({
      map: sideWireTex,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0.9
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.2,
      metalness: 0.95
    });

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.75,
      metalness: 0.15
    });

    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.3,
      metalness: 0.88
    });

    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.35,
      metalness: 0.3
    });

    // 2. Corner Uprights (4 Main Tubular Posts)
    const postGeo = new THREE.BoxGeometry(postThick, totalHeight, postThick);
    const postPositions = [
      [-halfX, totalHeight / 2, -halfZ],
      [halfX, totalHeight / 2, -halfZ],
      [halfX, totalHeight / 2, halfZ],
      [-halfX, totalHeight / 2, halfZ]
    ];

    const capGeo = new THREE.BoxGeometry(postThick + 0.6, 1.0, postThick + 0.6);
    const flangeGeo = new THREE.BoxGeometry(postThick + 1.4, 0.6, postThick + 1.4);

    postPositions.forEach(pos => {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(...pos);
      post.castShadow = true;
      post.receiveShadow = true;
      singleRack.add(post);

      const cap = new THREE.Mesh(capGeo, chromeMat);
      cap.position.set(pos[0], totalHeight + 0.5, pos[2]);
      singleRack.add(cap);

      const flange = new THREE.Mesh(flangeGeo, chromeMat);
      flange.position.set(pos[0], 0.3, pos[2]);
      singleRack.add(flange);
    });

    // 3. Top Structural Cross-Bars
    const topLongGeo = new THREE.BoxGeometry(length, 2.0, 2.0);
    const topLatGeo = new THREE.BoxGeometry(2.0, 2.0, width - (postThick * 2));

    const topRear = new THREE.Mesh(topLongGeo, frameMat);
    topRear.position.set(0, totalHeight - 1.0, -halfZ);
    singleRack.add(topRear);

    const topFront = new THREE.Mesh(topLongGeo, frameMat);
    topFront.position.set(0, totalHeight - 1.0, halfZ);
    singleRack.add(topFront);

    const topLeft = new THREE.Mesh(topLatGeo, frameMat);
    topLeft.position.set(-halfX, totalHeight - 1.0, 0);
    singleRack.add(topLeft);

    const topRight = new THREE.Mesh(topLatGeo, frameMat);
    topRight.position.set(halfX, totalHeight - 1.0, 0);
    singleRack.add(topRight);

    // 4. Back Wire Mesh Panel & Spine
    const backMeshGeo = new THREE.PlaneGeometry(length - (postThick * 2), totalHeight - 4);
    const backMesh = new THREE.Mesh(backMeshGeo, wireMat);
    backMesh.position.set(0, totalHeight / 2, -halfZ + 0.4);
    singleRack.add(backMesh);

    const backSpineGeo = new THREE.BoxGeometry(1.6, totalHeight, 1.2);
    const backSpine = new THREE.Mesh(backSpineGeo, chassisMat);
    backSpine.position.set(0, totalHeight / 2, -halfZ);
    singleRack.add(backSpine);

    // 5. Side Enclosure Wire Mesh
    const sideMeshGeo = new THREE.PlaneGeometry(width - (postThick * 2), totalHeight - 4);
    
    const leftSideMesh = new THREE.Mesh(sideMeshGeo, sideWireMat);
    leftSideMesh.rotation.y = Math.PI / 2;
    leftSideMesh.position.set(-halfX + 0.4, totalHeight / 2, 0);
    singleRack.add(leftSideMesh);

    const rightSideMesh = new THREE.Mesh(sideMeshGeo, sideWireMat);
    rightSideMesh.rotation.y = -Math.PI / 2;
    rightSideMesh.position.set(halfX - 0.4, totalHeight / 2, 0);
    singleRack.add(rightSideMesh);

    // 6. Shelves (4 Tiers with Perimeter Lip, Trusses & Collar Clamps)
    const collarGeo = new THREE.BoxGeometry(postThick + 0.8, 2.6, postThick + 0.8);
    const deckGeo = new THREE.BoxGeometry(length, 0.7, width);
    const rearLipGeo = new THREE.BoxGeometry(length, 1.8, 1.4);
    const sideLipGeo = new THREE.BoxGeometry(1.4, 1.8, width);
    const frontLipGeo = new THREE.BoxGeometry(length, 1.0, 1.4);
    const trussGeo = new THREE.BoxGeometry(1.4, 1.6, width - 4.0);

    for (let i = 0; i < shelvesCount; i++) {
      const shelfY = (i * shelfPitch) + 1.5;

      postPositions.forEach(pos => {
        const collar = new THREE.Mesh(collarGeo, chromeMat);
        collar.position.set(pos[0], shelfY, pos[2]);
        singleRack.add(collar);
      });

      const deck = new THREE.Mesh(deckGeo, deckMat);
      deck.position.set(0, shelfY, 0);
      deck.receiveShadow = true;
      deck.castShadow = true;
      singleRack.add(deck);

      const rearLip = new THREE.Mesh(rearLipGeo, chassisMat);
      rearLip.position.set(0, shelfY + 0.4, -halfZ + 0.7);
      singleRack.add(rearLip);

      const leftLip = new THREE.Mesh(sideLipGeo, chassisMat);
      leftLip.position.set(-halfX + 0.7, shelfY + 0.4, 0);
      singleRack.add(leftLip);

      const rightLip = new THREE.Mesh(sideLipGeo, chassisMat);
      rightLip.position.set(halfX - 0.7, shelfY + 0.4, 0);
      singleRack.add(rightLip);

      const frontLip = new THREE.Mesh(frontLipGeo, chassisMat);
      frontLip.position.set(0, shelfY - 0.1, halfZ - 0.7);
      singleRack.add(frontLip);

      [-36, 0, 36].forEach(tx => {
        const truss = new THREE.Mesh(trussGeo, chassisMat);
        truss.position.set(tx, shelfY - 0.9, 0);
        truss.castShadow = true;
        singleRack.add(truss);
      });
    }

    // 7. Ergonomic Chrome Push Handles
    const handleBarGeo = new THREE.CylinderGeometry(1.1, 1.1, width - 4, 16);
    const handleLeft = new THREE.Mesh(handleBarGeo, chromeMat);
    handleLeft.rotation.x = Math.PI / 2;
    handleLeft.position.set(-halfX - 4.5, 102, 0);
    singleRack.add(handleLeft);

    const standoffGeo = new THREE.CylinderGeometry(0.8, 0.8, 4.5, 12);
    const standoffL1 = new THREE.Mesh(standoffGeo, chromeMat);
    standoffL1.rotation.z = Math.PI / 2;
    standoffL1.position.set(-halfX - 2.25, 102, -halfZ + 4);
    singleRack.add(standoffL1);

    const standoffL2 = new THREE.Mesh(standoffGeo, chromeMat);
    standoffL2.rotation.z = Math.PI / 2;
    standoffL2.position.set(-halfX - 2.25, 102, halfZ - 4);
    singleRack.add(standoffL2);

    const handleRight = new THREE.Mesh(handleBarGeo, chromeMat);
    handleRight.rotation.x = Math.PI / 2;
    handleRight.position.set(halfX + 4.5, 102, 0);
    singleRack.add(handleRight);

    const standoffR1 = new THREE.Mesh(standoffGeo, chromeMat);
    standoffR1.rotation.z = Math.PI / 2;
    standoffR1.position.set(halfX + 2.25, 102, -halfZ + 4);
    singleRack.add(standoffR1);

    const standoffR2 = new THREE.Mesh(standoffGeo, chromeMat);
    standoffR2.rotation.z = Math.PI / 2;
    standoffR2.position.set(halfX + 2.25, 102, halfZ - 4);
    singleRack.add(standoffR2);

    // 8. Industrial Swivel Casters
    const casterPositions = [
      [-halfX + 5.5, -halfZ + 5.5, false],
      [halfX - 5.5, -halfZ + 5.5, false],
      [halfX - 5.5, halfZ - 5.5, true],
      [-halfX + 5.5, halfZ - 5.5, true]
    ];

    const swivelPlateGeo = new THREE.BoxGeometry(5.4, 0.5, 5.4);
    const swivelCupGeo = new THREE.CylinderGeometry(1.8, 1.8, 1.0, 16);
    const forkArmGeo = new THREE.BoxGeometry(0.6, 3.8, 1.6);
    const axleGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.8, 12);
    axleGeo.rotateZ(Math.PI / 2);

    const tireGeo = new THREE.CylinderGeometry(3.6, 3.6, 2.0, 24);
    tireGeo.rotateZ(Math.PI / 2);

    const hubGeo = new THREE.CylinderGeometry(2.3, 2.3, 2.2, 20);
    hubGeo.rotateZ(Math.PI / 2);

    const brakePedalGeo = new THREE.BoxGeometry(1.8, 0.35, 2.8);

    casterPositions.forEach(([cx, cz, hasBrake]) => {
      const casterGroup = new THREE.Group();
      casterGroup.position.set(cx, 0, cz);

      const plate = new THREE.Mesh(swivelPlateGeo, chromeMat);
      plate.position.set(0, 7.8, 0);
      casterGroup.add(plate);

      const cup = new THREE.Mesh(swivelCupGeo, chromeMat);
      cup.position.set(0, 7.1, 0);
      casterGroup.add(cup);

      const forkLeft = new THREE.Mesh(forkArmGeo, chromeMat);
      forkLeft.position.set(-1.4, 4.7, 0);
      casterGroup.add(forkLeft);

      const forkRight = new THREE.Mesh(forkArmGeo, chromeMat);
      forkRight.position.set(1.4, 4.7, 0);
      casterGroup.add(forkRight);

      const axle = new THREE.Mesh(axleGeo, chromeMat);
      axle.position.set(0, 3.6, 0);
      casterGroup.add(axle);

      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.position.set(0, 3.6, 0);
      tire.castShadow = true;
      casterGroup.add(tire);

      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.set(0, 3.6, 0);
      casterGroup.add(hub);

      if (hasBrake) {
        const brake = new THREE.Mesh(brakePedalGeo, brakeMat);
        brake.rotation.x = -Math.PI / 6;
        brake.position.set(0, 5.2, 2.6);
        casterGroup.add(brake);
      }

      singleRack.add(casterGroup);
    });

    // 9. Safety Stack Limit Indicator & Tier Gauge
    const stackLimit = shelfClearance;
    const laserBaseY = 1.5 + (deckThickness / 2);
    const safetyLaserGeo = new THREE.CylinderGeometry(0.2, 0.2, stackLimit, 8);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65
    });
    const safetyLaser = new THREE.Mesh(safetyLaserGeo, laserMat);
    safetyLaser.position.set(-halfX + 2.0, laserBaseY + (stackLimit / 2), halfZ - 2.0);
    singleRack.add(safetyLaser);

    const limitRingGeo = new THREE.TorusGeometry(1.6, 0.2, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    const limitRing = new THREE.Mesh(limitRingGeo, ringMat);
    limitRing.rotation.x = Math.PI / 2;
    limitRing.position.set(-halfX + 2.0, laserBaseY + stackLimit, halfZ - 2.0);
    singleRack.add(limitRing);

    return singleRack;
  }

  renderRackContents(rackData) {
    this.setMode('rack');
    
    // Clear previous linen blocks
    if (this.rackLinenGroup) {
      this.rackGroup.remove(this.rackLinenGroup);
      this.rackLinenGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    this.rackLinenGroup = new THREE.Group();

    const totalRacks = rackData && rackData.racks && rackData.racks.length > 0 ? rackData.racks.length : 1;
    this.currentTotalRacks = totalRacks;

    // Ensure structural frames and lighting match number of required racks
    this.buildRack(totalRacks);
    this.adjustLightingForRacks(totalRacks);

    const rackWidth = this.rackSpec.length;
    const rackSpacing = rackWidth + 40; // 40 units gap between racks
    const { shelfPitch, deckThickness, totalHeight } = this.rackSpec;

    // Build/refresh the warehouse staging floor environment (contact shadows + bay markings)
    if (this.rackEnvGroup) {
      while (this.rackEnvGroup.children.length > 0) {
        const c = this.rackEnvGroup.children[0];
        if (c.geometry) c.geometry.dispose();
        this.rackEnvGroup.remove(c);
      }

      const contactTex = createContactShadowTexture();
      const contactShadowMat = new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
      });

      for (let r = 0; r < totalRacks; r++) {
        const offsetX = (r - (totalRacks - 1) / 2) * rackSpacing;

        // 1. Soft contact shadow under the 4 casters & bottom shelf
        const shadowGeo = new THREE.PlaneGeometry(152, 60);
        const shadowMesh = new THREE.Mesh(shadowGeo, contactShadowMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.set(offsetX, 0.01, 0);
        this.rackEnvGroup.add(shadowMesh);

        // 2. High-precision industrial yellow staging bay boundary on the floor
        const bayMarkerTex = createBayMarkerTexture(r + 1);
        const bayGeo = new THREE.PlaneGeometry(164, 72);
        const bayMat = new THREE.MeshBasicMaterial({
          map: bayMarkerTex,
          transparent: true,
          opacity: 0.85,
          depthWrite: false
        });
        const bayMesh = new THREE.Mesh(bayGeo, bayMat);
        bayMesh.rotation.x = -Math.PI / 2;
        bayMesh.position.set(offsetX, 0.02, 0);
        this.rackEnvGroup.add(bayMesh);
      }
    }

    if (!rackData || !rackData.racks || rackData.racks.length === 0) {
      this.rackGroup.add(this.rackLinenGroup);
      return;
    }

    // Frame camera smoothly to show all racks in field of view
    const spanX = totalRacks * rackSpacing;
    const aspect = (this.container.clientWidth || 1000) / (this.container.clientHeight || 700);
    const dist = totalRacks > 1
      ? Math.max(170, (spanX / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * Math.min(aspect, 1.8))) * 1.15)
      : 170;

    const camY = Math.max(115, 80 + (totalRacks * 8));
    const camX = totalRacks > 1 ? spanX * 0.22 : 125;

    this.camera.position.set(camX, camY, dist);
    this.controls.target.set(0, totalHeight / 2, 0);
    this.controls.update();

    rackData.racks.forEach(rack => {
      // Calculate X offset to center the entire array of racks
      const offsetX = (rack.rackIndex - (totalRacks - 1) / 2) * rackSpacing;

      rack.shelves.forEach(shelfData => {
        const shelfY = (shelfData.shelfIndex * shelfPitch) + 1.5 + (deckThickness / 2) - 0.05;
        
        shelfData.stacks.forEach(item => {
          const key = item.product.color;
          if (!this._fabricTexCache.has(key)) {
            this._fabricTexCache.set(key, createFabricTexture(item.product.color, 'linen'));
          }
          const fabricTex = this._fabricTexCache.get(key);
          
          if (!this._linenMatCache.has(key)) {
            const mat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(item.product.color),
              map: fabricTex,
              roughness: 0.65,
              metalness: 0.05
            });
            this._linenMatCache.set(key, mat);
          }
          const mat = this._linenMatCache.get(key);

          const geo = new THREE.BoxGeometry(item.dx * 0.98, item.stackHeight, item.dz * 0.98);
          const mesh = new THREE.Mesh(geo, mat);
          
          mesh.position.set(item.x + offsetX, shelfY + (item.stackHeight / 2), item.z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          mesh.userData = {
            isRackItem: true,
            product: item.product,
            count: item.count,
            stackHeight: item.stackHeight
          };

          this.rackLinenGroup.add(mesh);
        });
      });
    });

    this.rackGroup.add(this.rackLinenGroup);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
