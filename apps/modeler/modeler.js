import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const ui = {
  canvas: $('#sceneCanvas'),
  viewport: $('#viewport'),
  fatal: $('#fatalError'),
  fatalMessage: $('#fatalMessage'),
  outliner: $('#outliner'),
  outlinerEmpty: $('#outlinerEmpty'),
  objectCount: $('#objectCount'),
  emptyInspector: $('#emptyInspector'),
  inspector: $('#inspectorContent'),
  selectionKind: $('#selectionKind'),
  selectionStatus: $('#selectionStatus'),
  status: $('#statusMessage'),
  rendererStatus: $('#rendererStatus'),
  name: $('#nameInput'),
  visible: $('#visibleInput'),
  color: $('#colorInput'),
  colorValue: $('#colorValue'),
  roughness: $('#roughnessInput'),
  roughnessValue: $('#roughnessValue'),
  metalness: $('#metalnessInput'),
  metalnessValue: $('#metalnessValue'),
  wireframe: $('#wireframeInput'),
  materialSection: $('#materialSection'),
  materialHint: $('#materialHint'),
  duplicate: $('#duplicateButton'),
  remove: $('#deleteButton'),
  focus: $('#focusButton'),
  grid: $('#gridButton'),
  space: $('#spaceButton'),
  fresh: $('#newButton'),
  importButton: $('#importButton'),
  exportButton: $('#exportButton'),
  fileInput: $('#fileInput'),
  dropHint: $('#dropHint'),
  toast: $('#toast'),
  toastIcon: $('#toastIcon'),
  toastTitle: $('#toastTitle'),
  toastMessage: $('#toastMessage')
};

const primitiveDefinitions = {
  box: {
    label: 'Cubo', icon: '▣', lift: 0.5,
    geometry: () => new THREE.BoxGeometry(1, 1, 1)
  },
  sphere: {
    label: 'Esfera', icon: '●', lift: 0.65,
    geometry: () => new THREE.SphereGeometry(0.65, 32, 20)
  },
  cylinder: {
    label: 'Cilindro', icon: '▥', lift: 0.65,
    geometry: () => new THREE.CylinderGeometry(0.52, 0.52, 1.3, 32)
  },
  cone: {
    label: 'Cono', icon: '▲', lift: 0.65,
    geometry: () => new THREE.ConeGeometry(0.62, 1.3, 32)
  },
  torus: {
    label: 'Toro', icon: '◉', lift: 0.6,
    geometry: () => new THREE.TorusGeometry(0.58, 0.19, 18, 48)
  }
};

const palette = [0x52bde9, 0x7d8ff0, 0x65cc91, 0xef8a66, 0xbd7de5, 0xe6bc5e];
const spawnOffsets = [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [1.6, 1.6], [-1.6, 1.6]];
const transformInputs = $$('[data-transform]');

let scene;
let camera;
let renderer;
let orbitControls;
let transformControls;
let transformHelper;
let gridHelper;
let axesHelper;
let selectionHelper;
let modelRoot;
let selectedObject = null;
let pointerStart = null;
let primitiveColorIndex = 0;
let busy = false;
let toastTimer = 0;
let dragDepth = 0;

if (supportsWebGL2()) {
  try {
    initScene();
    bindInterface();
    renderOutliner();
    syncInspector();
  } catch (error) {
    showFatal(error);
  }
} else {
  showFatal(new Error('Este navegador o dispositivo no ofrece WebGL 2, necesario para Three.js r184.'));
}

function supportsWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f141c);
  scene.fog = new THREE.Fog(0x0f141c, 24, 62);

  camera = new THREE.PerspectiveCamera(48, 1, 0.05, 500);
  camera.position.set(5.8, 4.3, 7.1);

  renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const hemisphere = new THREE.HemisphereLight(0xeaf6ff, 0x273142, 2.3);
  scene.add(hemisphere);
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  keyLight.position.set(5, 8, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x7da7ff, 1.25);
  rimLight.position.set(-5, 3, -4);
  scene.add(rimLight);

  gridHelper = new THREE.GridHelper(40, 40, 0x446178, 0x263747);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.7;
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(2.25);
  axesHelper.position.y = 0.006;
  scene.add(axesHelper);

  modelRoot = new THREE.Group();
  modelRoot.name = 'Objetos';
  scene.add(modelRoot);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(0, 0.65, 0);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.075;
  orbitControls.minDistance = 0.5;
  orbitControls.maxDistance = 120;
  orbitControls.zoomToCursor = true;
  orbitControls.update();

  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setSize(0.82);
  transformHelper = transformControls.getHelper();
  scene.add(transformHelper);
  transformControls.addEventListener('dragging-changed', event => {
    orbitControls.enabled = !event.value;
    if (!event.value) {
      syncInspector();
      setStatus(selectedObject ? `${selectedObject.name} transformado.` : 'Transformación terminada.');
    }
  });
  transformControls.addEventListener('objectChange', () => {
    updateSelectionHelper();
    syncTransformInputs();
  });

  selectionHelper = new THREE.BoxHelper(modelRoot, 0x65c9ef);
  selectionHelper.visible = false;
  selectionHelper.material.depthTest = false;
  selectionHelper.material.transparent = true;
  selectionHelper.material.opacity = 0.9;
  selectionHelper.renderOrder = 1000;
  scene.add(selectionHelper);

  const resizeObserver = new ResizeObserver(resizeViewport);
  resizeObserver.observe(ui.viewport);
  resizeViewport();
  renderer.setAnimationLoop(() => {
    orbitControls.update();
    if (selectedObject) updateSelectionHelper();
    renderer.render(scene, camera);
  });

  window.addEventListener('beforeunload', () => {
    resizeObserver.disconnect();
    renderer.setAnimationLoop(null);
    renderer.dispose();
  }, { once: true });
}

function bindInterface() {
  $$('[data-add]').forEach(button => button.addEventListener('click', () => addPrimitive(button.dataset.add)));
  $$('[data-mode]').forEach(button => button.addEventListener('click', () => setTransformMode(button.dataset.mode)));
  ui.space.addEventListener('click', toggleTransformSpace);
  ui.duplicate.addEventListener('click', duplicateSelected);
  ui.remove.addEventListener('click', deleteSelected);
  ui.focus.addEventListener('click', focusSelection);
  ui.grid.addEventListener('click', toggleGrid);
  ui.fresh.addEventListener('click', newScene);
  ui.importButton.addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', event => {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) importGLB(file);
  });
  ui.exportButton.addEventListener('click', exportGLB);

  ui.name.addEventListener('input', () => {
    if (!selectedObject) return;
    selectedObject.name = ui.name.value.trimStart().slice(0, 80);
    renderOutliner();
    syncSelectionLabels();
  });
  ui.name.addEventListener('blur', () => {
    if (!selectedObject) return;
    if (!selectedObject.name.trim()) selectedObject.name = uniqueName('Objeto');
    ui.name.value = selectedObject.name;
    renderOutliner();
    syncSelectionLabels();
  });
  ui.visible.addEventListener('change', () => {
    if (!selectedObject) return;
    selectedObject.visible = ui.visible.checked;
    updateSelectionHelper();
    renderOutliner();
    setStatus(`${selectedObject.name}: ${selectedObject.visible ? 'visible' : 'oculto'}.`);
  });

  transformInputs.forEach(input => input.addEventListener('change', () => applyTransformInput(input)));
  ui.color.addEventListener('input', applyMaterialInputs);
  ui.roughness.addEventListener('input', applyMaterialInputs);
  ui.metalness.addEventListener('input', applyMaterialInputs);
  ui.wireframe.addEventListener('change', applyMaterialInputs);

  ui.canvas.addEventListener('pointerdown', event => {
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      onGizmo: Boolean(transformControls.axis)
    };
  });
  ui.canvas.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart.button !== 0 || event.button !== 0) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const shouldPick = distance < 5 && !pointerStart.onGizmo && !transformControls.dragging;
    pointerStart = null;
    if (shouldPick) pickObject(event);
  });
  ui.canvas.addEventListener('contextmenu', event => event.preventDefault());

  ui.viewport.addEventListener('dragenter', event => {
    event.preventDefault();
    dragDepth += 1;
    ui.dropHint.classList.add('open');
  });
  ui.viewport.addEventListener('dragover', event => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  ui.viewport.addEventListener('dragleave', event => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) ui.dropHint.classList.remove('open');
  });
  ui.viewport.addEventListener('drop', event => {
    event.preventDefault();
    dragDepth = 0;
    ui.dropHint.classList.remove('open');
    const file = [...(event.dataTransfer?.files || [])].find(item => item.name.toLowerCase().endsWith('.glb'));
    if (file) importGLB(file);
    else showToast('Formato no compatible', 'Arrastra un archivo GLB binario.', true);
  });

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', event => {
    if (event.key === 'Shift' && transformControls) clearTransformSnap();
  });
}

function resizeViewport() {
  if (!renderer) return;
  const width = Math.max(1, ui.viewport.clientWidth);
  const height = Math.max(1, ui.viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function addPrimitive(kind) {
  if (busy || !primitiveDefinitions[kind]) return;
  const definition = primitiveDefinitions[kind];
  const material = new THREE.MeshStandardMaterial({
    color: palette[primitiveColorIndex++ % palette.length],
    roughness: 0.68,
    metalness: 0.08
  });
  const mesh = new THREE.Mesh(definition.geometry(), material);
  const offset = spawnOffsets[modelRoot.children.length % spawnOffsets.length];
  mesh.position.set(offset[0], definition.lift, offset[1]);
  mesh.name = uniqueName(definition.label);
  mesh.userData.khalerPrimitive = kind;
  mesh.userData.khalerIcon = definition.icon;
  modelRoot.add(mesh);
  selectObject(mesh);
  renderOutliner();
  setStatus(`${mesh.name} añadido.`);
  showToast('Primitiva añadida', `${mesh.name} está lista para transformar.`);
}

function selectObject(object) {
  selectedObject = object && object.parent === modelRoot ? object : null;
  if (selectedObject) transformControls.attach(selectedObject);
  else transformControls.detach();
  updateSelectionHelper();
  renderOutliner();
  syncInspector();
}

function pickObject(event) {
  const rect = ui.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(modelRoot.children, true);
  const hit = hits.find(result => isObjectVisible(result.object));
  if (!hit) {
    selectObject(null);
    setStatus('Selección desactivada.');
    return;
  }
  let object = hit.object;
  while (object.parent && object.parent !== modelRoot) object = object.parent;
  selectObject(object.parent === modelRoot ? object : null);
  if (selectedObject) setStatus(`${selectedObject.name} seleccionado.`);
}

function isObjectVisible(object) {
  let current = object;
  while (current && current !== modelRoot) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function renderOutliner() {
  ui.outliner.replaceChildren();
  const objects = [...modelRoot.children];
  ui.objectCount.textContent = `${objects.length} objeto${objects.length === 1 ? '' : 's'}`;
  ui.outlinerEmpty.hidden = objects.length > 0;
  objects.forEach(object => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outliner-item';
    if (object === selectedObject) button.classList.add('selected');
    if (!object.visible) button.classList.add('hidden-object');
    button.dataset.uuid = object.uuid;
    button.title = object.name || 'Objeto sin nombre';

    const icon = document.createElement('span');
    icon.className = 'object-icon';
    icon.textContent = object.userData.khalerIcon || (object.isMesh ? '◇' : '▱');
    const name = document.createElement('span');
    name.className = 'object-name';
    name.textContent = object.name || 'Objeto sin nombre';
    const visibility = document.createElement('span');
    visibility.className = 'object-visibility';
    visibility.textContent = object.visible ? '◉' : '○';
    visibility.title = object.visible ? 'Visible' : 'Oculto';

    button.append(icon, name, visibility);
    button.addEventListener('click', () => {
      selectObject(object);
      setStatus(`${object.name} seleccionado.`);
    });
    ui.outliner.append(button);
  });
}

function syncInspector() {
  const hasSelection = Boolean(selectedObject);
  ui.emptyInspector.hidden = hasSelection;
  ui.inspector.hidden = !hasSelection;
  ui.duplicate.disabled = !hasSelection || busy;
  ui.remove.disabled = !hasSelection || busy;
  ui.focus.disabled = !hasSelection;
  if (!hasSelection) {
    ui.selectionKind.textContent = 'Sin selección';
    ui.selectionStatus.textContent = 'Nada seleccionado';
    return;
  }

  ui.name.value = selectedObject.name || '';
  ui.visible.checked = selectedObject.visible;
  syncTransformInputs();
  syncMaterialInputs();
  syncSelectionLabels();
}

function syncSelectionLabels() {
  if (!selectedObject) return;
  const kind = selectedObject.userData.khalerPrimitive
    ? primitiveDefinitions[selectedObject.userData.khalerPrimitive]?.label || 'Malla'
    : selectedObject.isMesh ? 'Malla' : 'Modelo GLB';
  ui.selectionKind.textContent = kind;
  ui.selectionStatus.textContent = selectedObject.name || kind;
}

function syncTransformInputs() {
  if (!selectedObject) return;
  transformInputs.forEach(input => {
    if (document.activeElement === input) return;
    const property = input.dataset.transform;
    const axis = input.dataset.axis;
    let value = selectedObject[property][axis];
    if (property === 'rotation') value = THREE.MathUtils.radToDeg(value);
    input.value = formatNumber(value);
  });
}

function applyTransformInput(input) {
  if (!selectedObject) return;
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    syncTransformInputs();
    return;
  }
  const property = input.dataset.transform;
  const axis = input.dataset.axis;
  selectedObject[property][axis] = property === 'rotation' ? THREE.MathUtils.degToRad(value) : value;
  selectedObject.updateMatrixWorld(true);
  updateSelectionHelper();
  syncTransformInputs();
  setStatus(`${selectedObject.name}: ${property === 'rotation' ? 'rotación' : property === 'position' ? 'posición' : 'escala'} actualizada.`);
}

function syncMaterialInputs() {
  const materials = collectMaterials(selectedObject);
  const colorMaterials = materials.filter(material => material.color?.isColor);
  const roughMaterials = materials.filter(material => 'roughness' in material);
  const metalMaterials = materials.filter(material => 'metalness' in material);
  ui.materialSection.classList.toggle('unavailable', materials.length === 0);
  ui.materialHint.textContent = materials.length > 1 ? `${materials.length} materiales` : materials.length ? '' : 'no disponible';

  const firstColor = colorMaterials[0]?.color;
  const hex = firstColor ? `#${firstColor.getHexString()}` : '#ffffff';
  ui.color.value = hex;
  ui.colorValue.value = hex.toUpperCase();
  ui.color.disabled = colorMaterials.length === 0;
  ui.roughness.disabled = roughMaterials.length === 0;
  ui.metalness.disabled = metalMaterials.length === 0;
  ui.wireframe.disabled = materials.length === 0;
  ui.roughness.value = roughMaterials[0]?.roughness ?? 0.68;
  ui.metalness.value = metalMaterials[0]?.metalness ?? 0.08;
  ui.wireframe.checked = Boolean(materials[0]?.wireframe);
  ui.roughnessValue.value = Number(ui.roughness.value).toFixed(2);
  ui.metalnessValue.value = Number(ui.metalness.value).toFixed(2);
}

function applyMaterialInputs() {
  if (!selectedObject) return;
  const materials = collectMaterials(selectedObject);
  for (const material of materials) {
    if (material.color?.isColor) material.color.set(ui.color.value);
    if ('roughness' in material) material.roughness = Number(ui.roughness.value);
    if ('metalness' in material) material.metalness = Number(ui.metalness.value);
    if ('wireframe' in material) material.wireframe = ui.wireframe.checked;
    material.needsUpdate = true;
  }
  ui.colorValue.value = ui.color.value.toUpperCase();
  ui.roughnessValue.value = Number(ui.roughness.value).toFixed(2);
  ui.metalnessValue.value = Number(ui.metalness.value).toFixed(2);
  setStatus(`${selectedObject.name}: material actualizado.`);
}

function collectMaterials(root) {
  if (!root) return [];
  const materials = new Set();
  root.traverse(object => {
    if (!object.isMesh || !object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => materials.add(material));
  });
  return [...materials];
}

function setTransformMode(mode) {
  if (!['translate', 'rotate', 'scale'].includes(mode)) return;
  transformControls.setMode(mode);
  $$('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  setStatus(({ translate: 'Herramienta Mover.', rotate: 'Herramienta Rotar.', scale: 'Herramienta Escalar.' })[mode]);
}

function toggleTransformSpace() {
  const next = transformControls.space === 'world' ? 'local' : 'world';
  transformControls.setSpace(next);
  ui.space.textContent = next === 'world' ? 'Global' : 'Local';
  ui.space.title = `Espacio ${next === 'world' ? 'global' : 'local'} (Q)`;
  setStatus(`Transformaciones en espacio ${next === 'world' ? 'global' : 'local'}.`);
}

function setTransformSnap() {
  transformControls.setTranslationSnap(0.25);
  transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
  transformControls.setScaleSnap(0.1);
}

function clearTransformSnap() {
  transformControls.setTranslationSnap(null);
  transformControls.setRotationSnap(null);
  transformControls.setScaleSnap(null);
}

function duplicateSelected() {
  if (!selectedObject || busy) return;
  const duplicate = cloneSkinned(selectedObject);
  duplicate.traverse(object => {
    if (!object.isMesh) return;
    if (object.geometry) object.geometry = object.geometry.clone();
    if (Array.isArray(object.material)) object.material = object.material.map(cloneMaterialDeep);
    else if (object.material) object.material = cloneMaterialDeep(object.material);
  });
  duplicate.name = uniqueName(`${selectedObject.name || 'Objeto'} copia`);
  duplicate.position.x += 0.55;
  duplicate.position.z += 0.55;
  duplicate.userData = { ...selectedObject.userData };
  modelRoot.add(duplicate);
  selectObject(duplicate);
  renderOutliner();
  setStatus(`${duplicate.name} creado.`);
  showToast('Objeto duplicado', duplicate.name);
}

function cloneMaterialDeep(material) {
  const clone = material.clone();
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value?.isTexture) {
      clone[key] = value.clone();
      clone[key].needsUpdate = true;
    }
  }
  return clone;
}

function deleteSelected() {
  if (!selectedObject || busy) return;
  const object = selectedObject;
  const name = object.name || 'Objeto';
  selectObject(null);
  object.removeFromParent();
  disposeObject(object);
  renderOutliner();
  setStatus(`${name} eliminado.`);
  showToast('Objeto eliminado', name);
}

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    list.forEach(material => {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    });
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

function focusSelection() {
  if (!selectedObject) return;
  const box = new THREE.Box3().setFromObject(selectedObject);
  if (box.isEmpty()) {
    showToast('No se puede enfocar', 'El objeto no contiene geometría visible.', true);
    return;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 0.25);
  const direction = camera.position.clone().sub(orbitControls.target).normalize();
  const distance = Math.max(maxSize * 2.4, 2.2);
  orbitControls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = Math.max(distance * 100, 500);
  camera.updateProjectionMatrix();
  orbitControls.update();
  setStatus(`Cámara centrada en ${selectedObject.name}.`);
}

function toggleGrid() {
  const visible = !gridHelper.visible;
  gridHelper.visible = visible;
  axesHelper.visible = visible;
  ui.grid.setAttribute('aria-pressed', String(visible));
  setStatus(`Cuadrícula ${visible ? 'visible' : 'oculta'}.`);
}

function newScene() {
  if (busy || modelRoot.children.length === 0) return;
  if (!window.confirm('¿Vaciar la escena? Los objetos que no hayas exportado se perderán.')) return;
  selectObject(null);
  const objects = [...modelRoot.children];
  objects.forEach(object => {
    object.removeFromParent();
    disposeObject(object);
  });
  renderOutliner();
  setStatus('Escena vacía.');
  showToast('Escena nueva', 'Ya puedes comenzar otro modelo.');
}

async function importGLB(file) {
  if (busy) return;
  if (!file.name.toLowerCase().endsWith('.glb')) {
    showToast('Formato no compatible', 'Selecciona un archivo con extensión .glb.', true);
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    showToast('Archivo demasiado grande', 'El límite de este editor básico es 100 MB.', true);
    return;
  }

  setBusy(true, `Importando ${file.name}…`);
  const url = URL.createObjectURL(file);
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url, event => {
      if (event.total) setStatus(`Importando ${file.name}: ${Math.round(event.loaded / event.total * 100)} %`);
    });
    const root = gltf.scene;
    root.name = uniqueName(file.name.replace(/\.glb$/i, '') || 'Modelo GLB');
    root.userData = { ...root.userData, khalerIcon: '▱', khalerSource: file.name };
    root.animations = gltf.animations || [];
    modelRoot.add(root);
    selectObject(root);
    renderOutliner();
    focusSelection();
    setStatus(`${file.name} importado correctamente.`);
    showToast('GLB importado', `${root.name} · ${formatBytes(file.size)}`);
  } catch (error) {
    console.error(error);
    const detail = /DRACO/i.test(String(error))
      ? 'Este GLB usa compresión Draco, no incluida en el editor básico.'
      : 'No se pudo leer el archivo. Comprueba que sea un GLB 2.0 válido y sin compresión externa.';
    setStatus(`Error al importar ${file.name}.`);
    showToast('No se pudo importar', detail, true);
  } finally {
    URL.revokeObjectURL(url);
    setBusy(false);
  }
}

async function exportGLB() {
  if (busy) return;
  if (modelRoot.children.length === 0) {
    showToast('Escena vacía', 'Añade o importa al menos un objeto antes de exportar.', true);
    return;
  }

  setBusy(true, 'Preparando el archivo GLB…');
  try {
    const exportScene = new THREE.Scene();
    exportScene.name = 'Khaler Model';
    const animations = [];
    for (const object of modelRoot.children) {
      const clone = cloneSkinned(object);
      exportScene.add(clone);
      if (object.animations?.length) animations.push(...object.animations);
    }
    const exporter = new GLTFExporter();
    const buffer = await exporter.parseAsync(exportScene, {
      binary: true,
      trs: true,
      onlyVisible: true,
      maxTextureSize: 2048,
      animations
    });
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.hidden = true;
    link.href = url;
    link.download = `khaler-model-${dateStamp()}.glb`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setStatus(`${link.download} exportado.`);
    showToast('GLB exportado', `${link.download} · ${formatBytes(blob.size)}`);
  } catch (error) {
    console.error(error);
    setStatus('No se pudo exportar la escena.');
    showToast('Error de exportación', 'Algún material o textura no es compatible con glTF 2.0.', true);
  } finally {
    setBusy(false);
  }
}

function setBusy(value, message = '') {
  busy = value;
  ui.importButton.disabled = value;
  ui.exportButton.disabled = value;
  ui.fresh.disabled = value;
  ui.duplicate.disabled = value || !selectedObject;
  ui.remove.disabled = value || !selectedObject;
  if (message) setStatus(message);
}

function updateSelectionHelper() {
  if (!selectionHelper) return;
  if (!selectedObject || !selectedObject.visible) {
    selectionHelper.visible = false;
    return;
  }
  const box = new THREE.Box3().setFromObject(selectedObject);
  selectionHelper.visible = !box.isEmpty();
  if (selectionHelper.visible) selectionHelper.setFromObject(selectedObject);
}

function handleKeyDown(event) {
  const target = event.target;
  const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
  if (editing || busy) return;

  if (event.key === 'Shift') {
    setTransformSnap();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    duplicateSelected();
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'w': setTransformMode('translate'); break;
    case 'e': setTransformMode('rotate'); break;
    case 'r': setTransformMode('scale'); break;
    case 'q': toggleTransformSpace(); break;
    case 'f': focusSelection(); break;
    case 'delete':
    case 'backspace':
      if (selectedObject) {
        event.preventDefault();
        deleteSelected();
      }
      break;
    case 'escape':
      if (transformControls.dragging) transformControls.reset();
      else selectObject(null);
      break;
  }
}

function uniqueName(base) {
  const cleanBase = String(base || 'Objeto').trim() || 'Objeto';
  const names = new Set(modelRoot.children.map(object => object.name));
  if (!names.has(cleanBase)) return cleanBase;
  let suffix = 2;
  while (names.has(`${cleanBase} ${suffix}`)) suffix += 1;
  return `${cleanBase} ${suffix}`;
}

function formatNumber(value) {
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
  return String(Number(normalized.toFixed(3)));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateStamp() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function setStatus(message) {
  ui.status.textContent = message;
}

function showToast(title, message, error = false) {
  ui.toastTitle.textContent = title;
  ui.toastMessage.textContent = message;
  ui.toastIcon.textContent = error ? '!' : '✓';
  ui.toast.classList.toggle('error', error);
  ui.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), 3200);
}

function showFatal(error) {
  console.error(error);
  ui.fatal.hidden = false;
  ui.fatalMessage.textContent = error?.message || 'No se pudo crear el contexto WebGL 2.';
  ui.rendererStatus.textContent = 'WebGL 2 no disponible';
  ui.status.textContent = 'La vista 3D no está disponible en este dispositivo.';
  $$('button').forEach(button => { button.disabled = true; });
}
