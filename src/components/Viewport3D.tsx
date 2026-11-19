import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Box,
  Grid2X2,
  Layers,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import {
  buildGopuramGroup,
  disposeBuiltGopuram,
  type BuiltGopuram,
} from '../engine/gopuramGenerator';
import type {
  CameraPreset,
  GopuramFinish,
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
  exploded: boolean;
  showBuildVolume: boolean;
  onChangeFinishLook: (finish: GopuramFinish) => void;
  onResetCamera: () => void;
  onToggleExploded: () => void;
  onToggleAutoRotate: () => void;
  onToggleWireframe: () => void;
  onToggleBuildVolume: () => void;
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
    bedColor: number;
    gridMajor: number;
    gridMinor: number;
  }
> = {
  studio: {
    bg: 0xf3efe6,
    sky: 0xf8fafc,
    ground: 0xbda88f,
    hemiIntensity: 0.85,
    keyColor: 0xfff3de,
    keyIntensity: 2.15,
    rimColor: 0xd9e4f2,
    rimIntensity: 0.82,
    bedColor: 0x5d6268,
    gridMajor: 0x3b3f44,
    gridMinor: 0x4b5056,
  },
  golden: {
    bg: 0xf2e8d8,
    sky: 0xffe4bc,
    ground: 0x9b6e49,
    hemiIntensity: 0.68,
    keyColor: 0xffc885,
    keyIntensity: 2.55,
    rimColor: 0x89a8d6,
    rimIntensity: 0.9,
    bedColor: 0x575658,
    gridMajor: 0x383638,
    gridMinor: 0x49474a,
  },
  dusk: {
    bg: 0x222026,
    sky: 0x6f7ea8,
    ground: 0x3b2a22,
    hemiIntensity: 0.62,
    keyColor: 0xffb870,
    keyIntensity: 2.35,
    rimColor: 0x6ba2e6,
    rimIntensity: 1.15,
    bedColor: 0x33353b,
    gridMajor: 0x1e2024,
    gridMinor: 0x292b30,
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
    grad.addColorStop(0, 'rgba(18, 16, 14, 0.34)');
    grad.addColorStop(0.55, 'rgba(18, 16, 14, 0.12)');
    grad.addColorStop(1, 'rgba(18, 16, 14, 0)');
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
  exploded,
  showBuildVolume,
  onChangeFinishLook,
  onResetCamera,
  onToggleExploded,
  onToggleAutoRotate,
  onToggleWireframe,
  onToggleBuildVolume,
  onMetricsUpdate,
  onGroupReady,
}: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [liveMetrics, setLiveMetrics] = useState<PrintMetrics | null>(null);
  const lastPrintedFinishRef = useRef<GopuramFinish>('ivory');

  if (params.finish !== 'polychrome') {
    lastPrintedFinishRef.current = params.finish;
  }

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    hemi: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
    bedMat: THREE.MeshStandardMaterial;
    gridMesh: THREE.GridHelper;
    cageGroup: THREE.Group;
    built: BuiltGopuram | null;
    isSoftwareGl: boolean;
    autoRotate: boolean;
    explodedTarget: number;
    explodeCurrent: number;
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
    renderer.toneMappingExposure = 1.08;
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
    scene.fog = new THREE.FogExp2(initLight.bg, 0.025);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 120);
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
    const d = 4.5;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.018;
    scene.add(key);

    const rim = new THREE.DirectionalLight(initLight.rimColor, initLight.rimIntensity);
    rim.position.set(-6, 5, -6);
    scene.add(rim);

    // Gridded Dark-Slate 3D Printer Build Plate (identical to Gopuram Studio reel screenshots)
    const bedSize = 5.4;
    const bedGeo = new THREE.BoxGeometry(bedSize, 0.08, bedSize);
    const bedMat = new THREE.MeshStandardMaterial({
      color: initLight.bedColor,
      roughness: 0.9,
      metalness: 0.04,
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.position.y = -0.042;
    bedMesh.receiveShadow = true;
    scene.add(bedMesh);

    let gridMesh = new THREE.GridHelper(bedSize, 16, initLight.gridMajor, initLight.gridMinor);
    gridMesh.position.y = -0.001;
    scene.add(gridMesh);

    // Wireframe Build Volume Bounding Cage (matching .tmp_1.webp - .tmp_4.webp hairline vertical box)
    const cageGroup = new THREE.Group();
    const cageHeight = 5.2;
    const boxGeo = new THREE.BoxGeometry(bedSize, cageHeight, bedSize);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();
    const cageMat = new THREE.LineBasicMaterial({
      color: 0x8b8378,
      transparent: true,
      opacity: 0.28,
    });
    const cageLines = new THREE.LineSegments(edgesGeo, cageMat);
    cageLines.position.y = cageHeight / 2;
    cageGroup.add(cageLines);
    scene.add(cageGroup);

    const shadowTex = createRadialShadowTexture();
    const shadowPlaneGeo = new THREE.PlaneGeometry(5.0, 5.0);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.position.y = 0.001;
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
          // Smooth camera preset transition
          if (eng.targetCamPos && eng.targetLookAt) {
            const lambda = 7.5;
            camera.position.x = THREE.MathUtils.damp(camera.position.x, eng.targetCamPos.x, lambda, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, eng.targetCamPos.y, lambda, dt);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, eng.targetCamPos.z, lambda, dt);
            controls.target.x = THREE.MathUtils.damp(controls.target.x, eng.targetLookAt.x, lambda, dt);
            controls.target.y = THREE.MathUtils.damp(controls.target.y, eng.targetLookAt.y, lambda, dt);
            controls.target.z = THREE.MathUtils.damp(controls.target.z, eng.targetLookAt.z, lambda, dt);

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

          // Smooth Explode-View layer separation
          if (Math.abs(eng.explodeCurrent - eng.explodedTarget) > 0.002) {
            eng.explodeCurrent = THREE.MathUtils.damp(
              eng.explodeCurrent,
              eng.explodedTarget,
              9.0,
              dt
            );
            needsNextFrame = true;
          } else {
            eng.explodeCurrent = eng.explodedTarget;
          }

          if (eng.built) {
            const exp = eng.explodeCurrent;
            eng.built.group.traverse((obj) => {
              if (typeof obj.userData?.explodeLayer === 'number') {
                obj.position.y = obj.userData.explodeLayer * 0.22 * exp;
              }
            });

            if (eng.autoRotate && !eng.isSoftwareGl) {
              eng.built.group.rotation.y += dt * 0.28;
              needsNextFrame = true;
            }
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
      bedMat,
      gridMesh,
      cageGroup,
      built: null,
      isSoftwareGl,
      autoRotate: false,
      explodedTarget: 0,
      explodeCurrent: 0,
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
      bedGeo.dispose();
      bedMat.dispose();
      gridMesh.geometry.dispose();
      (gridMesh.material as THREE.Material).dispose();
      edgesGeo.dispose();
      cageMat.dispose();
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

    // Apply current explode progress immediately on rebuild
    built.group.traverse((obj) => {
      if (typeof obj.userData?.explodeLayer === 'number') {
        obj.position.y = obj.userData.explodeLayer * 0.22 * eng.explodeCurrent;
      }
    });

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    built.rawBounds.getSize(size);
    built.rawBounds.getCenter(center);

    eng.modelCenter.copy(center);
    eng.modelMaxDim = Math.max(size.x, size.y, size.z);
    eng.controls.target.set(center.x, center.y * 0.94, center.z);

    // Fit directional shadow frustum dynamically to model bounds for razor-sharp shadows
    const shadowHalf = Math.max(2.2, eng.modelMaxDim * 0.8);
    eng.key.shadow.camera.left = -shadowHalf;
    eng.key.shadow.camera.right = shadowHalf;
    eng.key.shadow.camera.top = shadowHalf;
    eng.key.shadow.camera.bottom = -shadowHalf;
    eng.key.shadow.camera.updateProjectionMatrix();

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
    eng.scene.fog = new THREE.FogExp2(cfg.bg, 0.025);
    eng.hemi.color.setHex(cfg.sky);
    eng.hemi.groundColor.setHex(cfg.ground);
    eng.hemi.intensity = cfg.hemiIntensity;
    eng.key.color.setHex(cfg.keyColor);
    eng.key.intensity = cfg.keyIntensity;
    eng.rim.color.setHex(cfg.rimColor);
    eng.rim.intensity = cfg.rimIntensity;
    eng.bedMat.color.setHex(cfg.bedColor);

    eng.scene.remove(eng.gridMesh);
    eng.gridMesh.geometry.dispose();
    (eng.gridMesh.material as THREE.Material).dispose();
    eng.gridMesh = new THREE.GridHelper(5.4, 16, cfg.gridMajor, cfg.gridMinor);
    eng.gridMesh.position.y = -0.001;
    eng.scene.add(eng.gridMesh);

    eng.requestRender();
  }, [lighting]);

  // Update Auto-Rotate, Explode Target & Build Volume Visibility
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.autoRotate = autoRotate;
    if (autoRotate && !eng.isSoftwareGl) {
      eng.requestRender();
    }
  }, [autoRotate]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.explodedTarget = exploded ? 1 : 0;
    if (eng.isSoftwareGl) {
      eng.explodeCurrent = eng.explodedTarget;
    }
    eng.requestRender();
  }, [exploded]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.cageGroup.visible = showBuildVolume;
    eng.requestRender();
  }, [showBuildVolume]);

  // Smooth Camera Preset Transitions
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    const c = eng.modelCenter;
    const fovRad = THREE.MathUtils.degToRad(eng.camera.fov);
    const dist = (eng.modelMaxDim / 2 / Math.tan(fovRad / 2)) * 1.56;

    const lookAt = new THREE.Vector3(c.x, c.y * 0.94, c.z);
    const camPos = new THREE.Vector3();

    if (cameraPreset === 'perspective') {
      camPos.set(c.x + dist * 0.56, c.y + dist * 0.34, c.z + dist * 0.8);
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
  const isPainted = params.finish === 'polychrome';

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D Gopuram Viewport"
      />

      {/* Top-Left Minimal Spec Readout (no backdrop-blur, clean unboxed text) */}
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
          <span>{params.archetype === 'relief' ? 'Wall Relief' : `${params.tiers} Tiers`}</span>
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

      {/* Top-Right Reel Look Switch (Hand-painted vs As printed) & Stage Tools */}
      <div className="absolute top-4 right-5 z-10 flex flex-wrap items-center justify-end gap-2">
        <div
          role="group"
          aria-label="Preview finish look"
          className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F3EC] border border-[#1E1916]/12 shadow-xs"
        >
          <button
            type="button"
            onClick={() => onChangeFinishLook('polychrome')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isPainted
                ? 'bg-[#3B171E] text-[#F7F3EC]'
                : 'text-[#1E1916]/70 hover:text-[#1E1916]'
            }`}
          >
            Hand-painted
          </button>
          <button
            type="button"
            onClick={() => onChangeFinishLook(lastPrintedFinishRef.current)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !isPainted
                ? 'bg-[#3B171E] text-[#F7F3EC]'
                : 'text-[#1E1916]/70 hover:text-[#1E1916]'
            }`}
          >
            As printed
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F3EC] border border-[#1E1916]/12 shadow-xs">
          <button
            type="button"
            onClick={onResetCamera}
            title="Reset 3/4 view"
            aria-label="Reset 3/4 view"
            className="p-1.5 rounded-md text-[#1E1916]/75 hover:bg-[#EFE9DF] hover:text-[#1E1916] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleExploded}
            title="Explode architectural layers"
            aria-label="Explode architectural layers"
            aria-pressed={exploded}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              exploded
                ? 'bg-[#B8432A] text-[#F7F3EC]'
                : 'text-[#1E1916]/75 hover:bg-[#EFE9DF] hover:text-[#1E1916]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleAutoRotate}
            title="Toggle turntable rotation"
            aria-label="Toggle turntable rotation"
            aria-pressed={autoRotate}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              autoRotate
                ? 'bg-[#3B171E] text-[#F7F3EC]'
                : 'text-[#1E1916]/75 hover:bg-[#EFE9DF] hover:text-[#1E1916]'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleWireframe}
            title="Toggle mesh wireframe"
            aria-label="Toggle mesh wireframe"
            aria-pressed={wireframe}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              wireframe
                ? 'bg-[#3B171E] text-[#F7F3EC]'
                : 'text-[#1E1916]/75 hover:bg-[#EFE9DF] hover:text-[#1E1916]'
            }`}
          >
            <Grid2X2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleBuildVolume}
            title="Toggle print volume cage"
            aria-label="Toggle print volume cage"
            aria-pressed={showBuildVolume}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              showBuildVolume
                ? 'bg-[#3B171E] text-[#F7F3EC]'
                : 'text-[#1E1916]/75 hover:bg-[#EFE9DF] hover:text-[#1E1916]'
            }`}
          >
            <Box className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
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
