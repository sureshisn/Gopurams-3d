import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import { Gallery1000 } from './components/Gallery1000';
import { StudioDock } from './components/StudioDock';
import { TopBar, type ActiveTab } from './components/TopBar';
import { Viewport3D } from './components/Viewport3D';
import { buildGopuramGroup, disposeBuiltGopuram } from './engine/gopuramGenerator';
import type {
  CameraPreset,
  GopuramParams,
  LightingPreset,
  PrintMetrics,
} from './engine/gopuramTypes';
import { generateGopuramParamsFromSeed, hashSeed } from './engine/prng';
import { exportGroupToBinarySTL } from './engine/stlExporter';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [params, setParams] = useState<GopuramParams>(() =>
    generateGopuramParamsFromSeed(4821, {
      archetype: 'gopuram',
      style: 'pandya',
      finish: 'ivory',
      tiers: 7,
      portalStyle: 'arched',
      kalasamCount: 5,
      hasCourtyard: false,
      hasMandapam: false,
    })
  );
  const [metrics, setMetrics] = useState<PrintMetrics | null>(null);
  const [lighting, setLighting] = useState<LightingPreset>('studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
  const [cameraPresetTick, setCameraPresetTick] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [batchSeed, setBatchSeed] = useState(100001);

  const activeGroupRef = useRef<THREE.Group | null>(null);

  const handleGroupReady = useCallback((group: THREE.Group | null) => {
    activeGroupRef.current = group;
  }, []);

  const handleChangeParams = useCallback((patch: Partial<GopuramParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleRandomizeSeed = useCallback(() => {
    const nextSeed = Math.floor(1000 + Math.random() * 899000);
    setParams(generateGopuramParamsFromSeed(nextSeed));
  }, []);

  const handleApplySeedString = useCallback((val: string) => {
    const numeric = hashSeed(val);
    setParams(generateGopuramParamsFromSeed(numeric));
  }, []);

  const handleExportSTL = useCallback(() => {
    const filename = `gopuram-${params.style}-${params.seed}-${params.targetHeightMm}mm.stl`;
    if (activeTab === 'studio' && activeGroupRef.current) {
      exportGroupToBinarySTL(activeGroupRef.current, params.targetHeightMm, filename);
      return;
    }
    const built = buildGopuramGroup(params);
    exportGroupToBinarySTL(built.group, params.targetHeightMm, filename);
    disposeBuiltGopuram(built);
  }, [activeTab, params]);

  const handleSelectCamera = useCallback((cam: CameraPreset) => {
    setCameraPreset(cam);
    setCameraPresetTick((t) => t + 1);
  }, []);

  const handleSelectFromGallery = useCallback((selected: GopuramParams) => {
    setParams(selected);
    setActiveTab('studio');
  }, []);

  const handleRegenerateBatch = useCallback(() => {
    setBatchSeed((prev) => prev + 100003);
  }, []);

  // Keyboard shortcut 'H' to toggle bottom control dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F7F3EC] text-[#1E1916]">
      <TopBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onExportSTL={handleExportSTL}
        canExport={true}
      />

      {activeTab === 'studio' && (
        <div className="relative flex-1 min-h-0">
          <Viewport3D
            params={params}
            lighting={lighting}
            cameraPreset={cameraPreset}
            cameraPresetTick={cameraPresetTick}
            autoRotate={autoRotate}
            wireframe={wireframe}
            onMetricsUpdate={setMetrics}
            onGroupReady={handleGroupReady}
          />
          <StudioDock
            params={params}
            metrics={metrics}
            lighting={lighting}
            cameraPreset={cameraPreset}
            autoRotate={autoRotate}
            wireframe={wireframe}
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((c) => !c)}
            onChangeParams={handleChangeParams}
            onRandomizeSeed={handleRandomizeSeed}
            onApplySeedString={handleApplySeedString}
            onOpen1000Gallery={() => setActiveTab('gallery')}
            onChangeLighting={setLighting}
            onSelectCamera={handleSelectCamera}
            onToggleAutoRotate={() => setAutoRotate((r) => !r)}
            onToggleWireframe={() => setWireframe((w) => !w)}
          />
        </div>
      )}

      {activeTab === 'gallery' && (
        <div className="flex-1 overflow-y-auto">
          <Gallery1000
            baseBatchSeed={batchSeed}
            onRegenerateBatch={handleRegenerateBatch}
            onSelectGopuram={handleSelectFromGallery}
          />
        </div>
      )}

      {activeTab === 'architecture' && (
        <div className="flex-1 overflow-y-auto">
          <ArchitectureGuide onLoadPreset={handleSelectFromGallery} />
        </div>
      )}
    </div>
  );
}
