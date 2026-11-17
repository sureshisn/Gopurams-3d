import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  buildGopuramGroup,
  disposeBuiltGopuram,
  type BuiltGopuram,
} from '../engine/gopuramGenerator';
import type {
  CameraPreset,
  GopuramParams,
  LightingPreset,
  PrintMetrics,
} from '../engine/gopuramTypes';
import { formatGopuramTitle } from '../engine/prng';
import { detectSoftwareWebGL } from '../engine/thumbnailRenderer';

interface Viewport3DProps {
  params: GopuramParams;
  lighting: LightingPreset;
  cameraPreset: CameraPreset;
  cameraPresetTick: number;
  autoRotate: boolean;
  wireframe: boolean;
  onMetricsUpdate: (metrics: PrintMetrics) => void;
  onGroupReady: (group: THREE.Group | null) => void;
}

const LIGHTING_CONFIGS: Record<
  LightingPreset,
  {
    bg: number;
    sky: number;
    ground: number;
    hemiIntensity: number;
    keyColor: number;
    keyIntensity: number;
    rimColor: number;
    rimIntensity: number;
    plinthColor: number;
  }
> = {
  studio: {
    bg: 0xf4efe5,
    sky: 0xf7f9fc,
    ground: 0xc2b29b,
    hemiIntensity: 0.78,
    keyColor: 0xfff2dc,
    keyIntensity: 2.2,
    rimColor: 0xd9e4f2,
    rimIntensity: 0.85,
    plinthColor: 0xe6dfd2,
  },
  golden: {
    bg: 0xf2e8d8,
    sky: 0xffe4bc,
    ground: 0x9b6e49,
    hemiIntensity: 0.65,
    keyColor: 0xffc885,
    keyIntensity: 2.65,
    rimColor: 0x89a8d6,
    rimIntensity: 0.9,
    plinthColor: 0xe2d5c1,
  },
  dusk: {
    bg: 0x222026,
    sky: 0x6f7ea8,
    ground: 0x3b2a22,
    hemiIntensity: 0.6,
    keyColor: 0xffb870,
    keyIntensity: 2.4,
    rimColor: 0x6ba2e6,
    rimIntensity: 1.15,
    plinthColor: 0x312e36,
  },
};

function createRadialShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      10,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, 'rgba(24, 18, 14, 0.36)');
    grad.addColorStop(0.55, 'rgba(24, 18, 14, 0.14)');
    grad.addColorStop(1, 'rgba(24, 18, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Viewport3D({
  params,
  lighting,
  cameraPreset,
  cameraPresetTick,
  autoRotate,
  wireframe,
  onMetricsUpdate,
  onGroupReady,
}: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [liveMetrics, setLiveMetrics] = useState<PrintMetrics | null>(null);

  // Refs to hold Three.js objects without tearing down the canvas on state changes
  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    hemi: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
    plinthMat: THREE.MeshStandardMaterial;
    built: BuiltGopuram | null;
    isSoftwareGl: boolean;
    autoRotate: boolean;
    targetCamPos: THREE.Vector3 | null;
    targetLookAt: THREE.Vector3 | null;
    requestRender: () => void;
    modelCenter: THREE.Vector3;
    modelMaxDim: number;
  } | null>(null);

  const callbacksRef = useRef({ onMetricsUpdate, onGroupReady });
  callbacksRef.current = { onMetricsUpdate, onGroupReady };

  // Initialize Three.js Scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const initLight = LIGHTING_CONFIGS.studio;
    scene.background = new THREE.Color(initLight.bg);
    scene.fog = new THREE.FogExp2(initLight.bg, 0.032);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 120);
    camera.position.set(4.5, 3.2, 5.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.minDistance = 2.0;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 1.4, 0);

    // 3-Point Studio Lighting Rig
    const hemi = new THREE.HemisphereLight(
      initLight.sky,
      initLight.ground,
      initLight.hemiIntensity
    );
    hemi.position.set(0, 15, 0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(initLight.keyColor, initLight.keyIntensity);
    key.position.set(6, 11, 7);
    key.castShadow = !isSoftwareGl;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 28;
    const d = 5.5;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    const rim = new THREE.DirectionalLight(initLight.rimColor, initLight.rimIntensity);
    rim.position.set(-6, 5, -6);
    scene.add(rim);

    // Architectural drafting turntable plinth & contact shadow
    const plinthGeo = new THREE.CylinderGeometry(3.15, 3.25, 0.14, 64);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: initLight.plinthColor,
      roughness: 0.9,
      metalness: 0.02,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.072;
    plinth.receiveShadow = true;
    scene.add(plinth);

    // Subtle engraved millimeter scale ring on the turntable bed
    const ringGeo = new THREE.RingGeometry(2.65, 2.68, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8b7e6d,
      transparent: true,
      opacity: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.001;
    scene.add(ring);

    const shadowTex = createRadialShadowTexture();
    const shadowPlaneGeo = new THREE.PlaneGeometry(5.2, 5.2);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.position.y = 0.002;
    scene.add(shadowPlane);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const eng = engineRef.current;
        const dt = Math.min(0.1, clock.getDelta());
        let needsNextFrame = false;

        if (eng) {
          // Smooth camera preset transition with exponential damping
          if (eng.targetCamPos && eng.targetLookAt) {
            const lambda = 7.5;
            camera.position.x = THREE.MathUtils.damp(
              camera.position.x,
              eng.targetCamPos.x,
              lambda,
              dt
            );
            camera.position.y = THREE.MathUtils.damp(
              camera.position.y,
              eng.targetCamPos.y,
              lambda,
              dt
            );
            camera.position.z = THREE.MathUtils.damp(
              camera.position.z,
              eng.targetCamPos.z,
              lambda,
              dt
            );
            controls.target.x = THREE.MathUtils.damp(
              controls.target.x,
              eng.targetLookAt.x,
              lambda,
              dt
            );
            controls.target.y = THREE.MathUtils.damp(
              controls.target.y,
              eng.targetLookAt.y,
              lambda,
              dt
            );
            controls.target.z = THREE.MathUtils.damp(
              controls.target.z,
              eng.targetLookAt.z,
              lambda,
              dt
            );

            if (
              camera.position.distanceTo(eng.targetCamPos) < 0.02 &&
              controls.target.distanceTo(eng.targetLookAt) < 0.02
            ) {
              camera.position.copy(eng.targetCamPos);
              controls.target.copy(eng.targetLookAt);
              eng.targetCamPos = null;
              eng.targetLookAt = null;
            } else {
              needsNextFrame = true;
            }
          }

          if (eng.autoRotate && !eng.isSoftwareGl && eng.built) {
            eng.built.group.rotation.y += dt * 0.28;
            needsNextFrame = true;
          }
        }

        const controlsChanged = controls.update();
        if (controlsChanged && !eng?.isSoftwareGl) {
          needsNextFrame = true;
        }

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsNextFrame) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    const handleControlStart = () => {
      if (engineRef.current) {
        engineRef.current.targetCamPos = null;
        engineRef.current.targetLookAt = null;
      }
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('change', requestRender);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    engineRef.current = {
      renderer,
      scene,
      camera,
      controls,
      hemi,
      key,
      rim,
      plinthMat,
      built: null,
      isSoftwareGl,
      autoRotate: false,
      targetCamPos: null,
      targetLookAt: null,
      requestRender,
      modelCenter: new THREE.Vector3(0, 1.4, 0),
      modelMaxDim: 3.5,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      if (engineRef.current?.built) {
        scene.remove(engineRef.current.built.group);
        disposeBuiltGopuram(engineRef.current.built);
      }
      plinthGeo.dispose();
      plinthMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      shadowPlaneGeo.dispose();
      shadowPlaneMat.dispose();
      shadowTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      engineRef.current = null;
    };
  }, []);

  // Rebuild Gopuram mesh whenever parameters or wireframe change
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    if (eng.built) {
      eng.scene.remove(eng.built.group);
      disposeBuiltGopuram(eng.built);
      eng.built = null;
    }

    const built = buildGopuramGroup(params, wireframe);
    eng.built = built;
    eng.scene.add(built.group);

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    built.rawBounds.getSize(size);
    built.rawBounds.getCenter(center);

    eng.modelCenter.copy(center);
    eng.modelMaxDim = Math.max(size.x, size.y, size.z);
    eng.controls.target.set(center.x, center.y * 0.94, center.z);

    setLiveMetrics(built.metrics);
    callbacksRef.current.onMetricsUpdate(built.metrics);
    callbacksRef.current.onGroupReady(built.group);

    eng.requestRender();
  }, [params, wireframe]);

  // Update Lighting Preset
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const cfg = LIGHTING_CONFIGS[lighting];
    eng.scene.background = new THREE.Color(cfg.bg);
    eng.scene.fog = new THREE.FogExp2(cfg.bg, 0.032);
    eng.hemi.color.setHex(cfg.sky);
    eng.hemi.groundColor.setHex(cfg.ground);
    eng.hemi.intensity = cfg.hemiIntensity;
    eng.key.color.setHex(cfg.keyColor);
    eng.key.intensity = cfg.keyIntensity;
    eng.rim.color.setHex(cfg.rimColor);
    eng.rim.intensity = cfg.rimIntensity;
    eng.plinthMat.color.setHex(cfg.plinthColor);
    eng.requestRender();
  }, [lighting]);

  // Update Auto-Rotate
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.autoRotate = autoRotate;
    if (autoRotate && !eng.isSoftwareGl) {
      eng.requestRender();
    }
  }, [autoRotate]);

  // Smooth Camera Preset Transitions
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    const c = eng.modelCenter;
    const fovRad = THREE.MathUtils.degToRad(eng.camera.fov);
    const dist = (eng.modelMaxDim / 2 / Math.tan(fovRad / 2)) * 1.55;

    const lookAt = new THREE.Vector3(c.x, c.y * 0.94, c.z);
    let camPos = new THREE.Vector3();

    if (cameraPreset === 'perspective') {
      camPos.set(c.x + dist * 0.58, c.y + dist * 0.34, c.z + dist * 0.8);
    } else if (cameraPreset === 'front') {
      camPos.set(c.x, c.y * 0.96, c.z + dist * 1.04);
    } else if (cameraPreset === 'side') {
      camPos.set(c.x + dist * 1.04, c.y * 0.96, c.z);
    } else {
      camPos.set(c.x, c.y + dist * 1.25, c.z + 0.05);
    }

    if (eng.isSoftwareGl || cameraPresetTick === 0) {
      eng.camera.position.copy(camPos);
      eng.controls.target.copy(lookAt);
      eng.targetCamPos = null;
      eng.targetLookAt = null;
    } else {
      eng.targetCamPos = camPos;
      eng.targetLookAt = lookAt;
    }
    eng.requestRender();
  }, [cameraPreset, cameraPresetTick]);

  const isDarkScene = lighting === 'dusk';

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Isolated WebGL mount container */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D Gopuram Viewport"
      />

      {/* Top-Left Minimal Spec Readout (no backdrop-blur, unboxed metadata) */}
      <div
        className={`pointer-events-none absolute top-4 left-5 z-10 max-w-md px-3.5 py-2.5 rounded-lg border ${
          isDarkScene
            ? 'bg-[#222026]/90 border-white/10 text-[#F7F3EC]'
            : 'bg-[#F7F3EC]/92 border-[#1E1916]/10 text-[#1E1916]'
        }`}
      >
        <h1 className="font-display text-lg font-semibold leading-tight tracking-tight">
          {formatGopuramTitle(params)}
        </h1>
        <div
          className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-mono-tabular ${
            isDarkScene ? 'text-[#F7F3EC]/70' : 'text-[#1E1916]/65'
          }`}
        >
          <span>Seed #{params.seed}</span>
          <span aria-hidden="true">·</span>
          <span>{params.tiers} Tiers</span>
          {liveMetrics && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {liveMetrics.widthMm} × {liveMetrics.depthMm} × {liveMetrics.heightMm} mm
              </span>
              <span aria-hidden="true">·</span>
              <span>{liveMetrics.estimatedGrams} g PLA</span>
            </>
          )}
        </div>
      </div>

      {/* WebGL Context Loss Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#F7F3EC] p-6 text-center">
          <div className="max-w-sm">
            <h2 className="font-display text-xl font-semibold text-[#3B171E]">
              3D Viewport Paused
            </h2>
            <p className="mt-2 text-sm text-[#1E1916]/70">
              Graphics context was suspended by the browser. Click anywhere or resize the window to restore rendering.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
