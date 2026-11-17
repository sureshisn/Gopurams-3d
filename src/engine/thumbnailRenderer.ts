import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGopuramGroup, disposeBuiltGopuram } from './gopuramGenerator';
import type { GopuramParams } from './gopuramTypes';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

class SharedThumbnailRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private pmremEnv: THREE.Texture | null = null;
  private cache = new Map<string, string>();
  private size = 240;

  private ensureInit() {
    if (this.renderer) return;
    const isSoftware = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftware,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(this.size, this.size);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.pmremEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.pmremEnv;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xf6f8fc, 0xb89c7d, 0.72);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1dc, 2.25);
    key.position.set(5, 8, 6);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xd9e6f6, 0.85);
    rim.position.set(-5, 4, -5);
    scene.add(rim);

    // Subtle matte ground disc under thumbnail model
    const discGeo = new THREE.CircleGeometry(2.6, 36);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd2,
      roughness: 0.96,
      metalness: 0.0,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = -0.005;
    scene.add(disc);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  public getCached(key: string): string | undefined {
    return this.cache.get(key);
  }

  public renderThumbnail(params: GopuramParams): string {
    const cacheKey = `${params.seed}_${params.finish}_${params.archetype}_${params.tiers}`;
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    this.ensureInit();
    if (!this.renderer || !this.scene || !this.camera) return '';

    const built = buildGopuramGroup(params);
    this.scene.add(built.group);

    // Fit camera cleanly to gopuram bounds at classic 3/4 isometric-like angle
    const box = built.rawBounds;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y * 1.08, size.z);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.48;

    this.camera.position.set(
      center.x + dist * 0.56,
      center.y + dist * 0.34,
      center.z + dist * 0.78
    );
    this.camera.lookAt(center.x, center.y * 0.96, center.z);
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(built.group);
    disposeBuiltGopuram(built);

    // Keep cache bounded around 350 thumbnails
    if (this.cache.size > 350) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, dataUrl);
    return dataUrl;
  }
}

export const thumbnailRenderer = new SharedThumbnailRenderer();
