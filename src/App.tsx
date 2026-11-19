import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import { Gallery1000 } from './components/Gallery1000';
import { PrintCheckDialog } from './components/PrintCheckDialog';
import { StudioDock } from './components/StudioDock';
import { TopBar, type ActiveTab } from './components/TopBar';
import { Viewport3D } from './components/Viewport3D';
import { buildGopuramGroup, disposeBuiltGopuram } from './engine/gopuramGenerator';
import type {
  CameraPreset,
  GopuramFinish,
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
      archetype: 'complex',
      style: 'pandya',
      finish: 'polychrome',
      tiers: 8,
      portalStyle: 'arched',
      kalasamCount: 7,
      hasCourtyard: true,
      hasMandapam: true,
      hasFlankingShrines: true,
    })
  );
  const [metrics, setMetrics] = useState<PrintMetrics | null>(null);
  const [lighting, setLighting] = useState<LightingPreset>('studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
  const [cameraPresetTick, setCameraPresetTick] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [showBuildVolume, setShowBuildVolume] = useState(true);
  const [printCheckOpen, setPrintCheckOpen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [batchSeed, setBatchSeed] = useState(100001);

  const activeGroupRef = useRef<THREE.Group | null>(null);

  const handleGroupReady = useCallback((group: THREE.Group | null) => {
    activeGroupRef.current = group;
  }, []);

  const handleChangeParams = useCallback((patch: Partial<GopuramParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleChangeFinishLook = useCallback((finish: GopuramFinish) => {
    setParams((prev) => ({ ...prev, finish }));
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

  const handleResetCamera = useCallback(() => {
    setCameraPreset('perspective');
    setCameraPresetTick((t) => t + 1);
  }, []);

  const handleSelectFromGallery = useCallback((selected: GopuramParams) => {
    setParams(selected);
    setActiveTab('studio');
  }, []);

  const handleRegenerateBatch = useCallback(() => {
    setBatchSeed((prev) => prev + 100003);
  }, []);

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
        onOpenPrintCheck={() => setPrintCheckOpen(true)}
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
            exploded={exploded}
            showBuildVolume={showBuildVolume}
            onChangeFinishLook={handleChangeFinishLook}
            onResetCamera={handleResetCamera}
            onToggleExploded={() => setExploded((x) => !x)}
            onToggleAutoRotate={() => setAutoRotate((r) => !r)}
            onToggleWireframe={() => setWireframe((w) => !w)}
            onToggleBuildVolume={() => setShowBuildVolume((v) => !v)}
            onMetricsUpdate={setMetrics}
            onGroupReady={handleGroupReady}
          />
          <StudioDock
            params={params}
            metrics={metrics}
            lighting={lighting}
            cameraPreset={cameraPreset}
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((c) => !c)}
            onChangeParams={handleChangeParams}
            onRandomizeSeed={handleRandomizeSeed}
            onApplySeedString={handleApplySeedString}
            onOpen1000Gallery={() => setActiveTab('gallery')}
            onOpenPrintCheck={() => setPrintCheckOpen(true)}
            onChangeLighting={setLighting}
            onSelectCamera={handleSelectCamera}
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

      <PrintCheckDialog
        open={printCheckOpen}
        params={params}
        metrics={metrics}
        onClose={() => setPrintCheckOpen(false)}
        onExportSTL={handleExportSTL}
      />
    </div>
  );
}
