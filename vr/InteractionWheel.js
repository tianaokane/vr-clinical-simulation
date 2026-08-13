import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// A primitive 3D radial menu -- a ring of circular buttons around a hub,
// with canvas-texture text labels. This is the WebXR-facing counterpart
// to PatientInteractionController's flat HTML HUD: the HUD works fine on
// a desktop screen, but an immersive WebXR session has no reliable DOM
// overlay in most browsers, so category/action selection needs to be
// actual 3D geometry the trainee can point a controller ray (or, on
// desktop, the mouse) at. No animation/transition polish is implemented
// yet -- items just appear/disappear -- that's a deliberate, acknowledged
// simplification for this first pass, not an oversight.
//
// This component only knows how to lay out and hit-test circular
// buttons in a ring; it has no opinion about categories, actions, sites,
// or InteractionSystem. PatientInteractionController drives it (see
// showCategoryWheel/showActionWheel there) so both the flat HUD and the
// wheel end up calling the exact same InteractionSystem.select().

const RING_RADIUS = 0.2; // metres -- sized for a comfortable ~0.5-0.6m VR reach, not a full-FOV screen fill
const BUTTON_RADIUS = 0.04;
const HUB_RADIUS = 0.032;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

export class InteractionWheel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.renderOrder = 1000;
    this.scene.scene.add(this.group);

    this.buttons = []; // { mesh, label, item }
    this._onSelect = null;

    this._buildHub();
  }

  _buildHub() {
    const geometry = new THREE.CircleGeometry(HUB_RADIUS, 24);
    const material = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      side: THREE.DoubleSide
    });
    this.hubMesh = new THREE.Mesh(geometry, material);
    this.hubMesh.renderOrder = 998;
    this.group.add(this.hubMesh);

    this.hubLabelSprite = null; // set via setHubLabel()
  }

  setHubLabel(text) {
    if (this.hubLabelSprite) {
      this.group.remove(this.hubLabelSprite);
      this.hubLabelSprite.material.map?.dispose();
      this.hubLabelSprite.material.dispose();
      this.hubLabelSprite = null;
    }
    if (!text) return;
    this.hubLabelSprite = this._makeLabelSprite(text, { bg: 'rgba(30,30,30,0.85)', color: '#ffffff', fontSize: 22 });
    this.hubLabelSprite.position.set(0, 0, 0.002);
    this.hubLabelSprite.scale.set(0.16, 0.09, 1);
    this.group.add(this.hubLabelSprite);
  }

  _makeLabelSprite(text, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.bg ?? 'rgba(255,255,255,0.95)';
    roundRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 16);
    ctx.fill();
    ctx.fillStyle = opts.color ?? '#222222';
    ctx.font = `${opts.bold === false ? '' : 'bold '}${opts.fontSize ?? 26}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    wrapText(ctx, text, canvas.width / 2, canvas.height / 2, canvas.width - 24, (opts.fontSize ?? 26) + 4);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 999;
    sprite.scale.set(0.18, 0.08, 1);
    return sprite;
  }

  clear() {
    for (const btn of this.buttons) {
      this.group.remove(btn.mesh);
      btn.mesh.geometry.dispose();
      btn.mesh.material.dispose();
      this.group.remove(btn.label);
      btn.label.material.map?.dispose();
      btn.label.material.dispose();
    }
    this.buttons = [];
    this.setHubLabel(null);
  }

  // items: [{ id, label, disabled, dangerous }]. onSelect(item) fires on
  // a resolved hit against a non-disabled button (including the
  // synthetic back button, id '__back__', when opts.backLabel is set).
  setItems(items, onSelect, opts = {}) {
    this.clear();
    this._onSelect = onSelect;
    if (opts.hubLabel) this.setHubLabel(opts.hubLabel);

    const n = items.length;
    items.forEach((item, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * RING_RADIUS;
      const y = Math.sin(angle) * RING_RADIUS;
      this._addButton(item, x, y);
    });

    if (opts.backLabel) {
      this._addButton({ id: '__back__', label: opts.backLabel }, 0, -RING_RADIUS - 0.12, { small: true, color: 0x666666 });
    }
  }

  _addButton(item, x, y, style = {}) {
    const radius = style.small ? BUTTON_RADIUS * 0.85 : BUTTON_RADIUS;
    const geometry = new THREE.CircleGeometry(radius, 24);
    const color = style.color ?? (item.disabled ? 0xbbbbbb : (item.dangerous ? 0xc62828 : 0x4CAF50));
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: item.disabled ? 0.4 : 0.92,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0.001);
    mesh.renderOrder = 999;
    mesh.userData.itemId = item.id;
    mesh.userData.selectable = !item.disabled;
    this.group.add(mesh);

    const label = this._makeLabelSprite(item.label);
    label.position.set(x, y - radius - 0.045, 0.002);
    this.group.add(label);

    this.buttons.push({ mesh, label, item });
  }

  getSelectableMeshes() {
    return this.buttons.filter((b) => b.mesh.userData.selectable).map((b) => b.mesh);
  }

  // Called by PatientInteractionController with the mesh a raycast hit.
  // Returns true if the hit resolved to one of this wheel's buttons.
  resolveHit(mesh) {
    const btn = this.buttons.find((b) => b.mesh === mesh);
    if (!btn || !this._onSelect) return false;
    this._onSelect(btn.item);
    return true;
  }

  // Positions the wheel facing the given orientation at the given
  // position -- e.g. ~0.5m in front of the camera. No easing/animation;
  // it just appears there. Re-call this each time the wheel opens so it
  // "summons" to wherever the trainee is currently looking.
  showAt(position, quaternion) {
    this.group.position.copy(position);
    this.group.quaternion.copy(quaternion);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  get isVisible() {
    return this.group.visible;
  }

  dispose() {
    this.clear();
    this.hubMesh.geometry.dispose();
    this.hubMesh.material.dispose();
    this.scene.scene.remove(this.group);
  }
}
