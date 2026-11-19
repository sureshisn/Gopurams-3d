import { CheckCircle2, Download } from 'lucide-react';

export type ActiveTab = 'studio' | 'gallery' | 'architecture';

interface TopBarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  onOpenPrintCheck: () => void;
  onExportSTL: () => void;
  canExport: boolean;
}

export function TopBar({
  activeTab,
  onChangeTab,
  onOpenPrintCheck,
  onExportSTL,
  canExport,
}: TopBarProps) {
  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'studio', label: 'Design' },
    { id: 'gallery', label: 'Explore 1000+' },
    { id: 'architecture', label: 'Architecture' },
  ];

  return (
    <header className="relative z-30 flex items-center justify-between gap-6 px-6 py-3.5 bg-[#F7F3EC] border-b border-[#1E1916]/10">
      {/* Zone 1: Single text wordmark */}
      <button
        type="button"
        onClick={() => onChangeTab('studio')}
        className="font-display text-lg font-semibold tracking-tight text-[#3B171E] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#B8432A] rounded"
      >
        Gopuram Studio
      </button>

      {/* Zone 2: Concise single-line navigation links */}
      <nav
        aria-label="Primary navigation"
        className="flex items-center gap-6 overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`relative py-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#B8432A] rounded ${
                isActive
                  ? 'text-[#3B171E]'
                  : 'text-[#1E1916]/65 hover:text-[#1E1916]'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-[#B8432A] rounded-full"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Print Check & Primary Export STL Action */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenPrintCheck}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1E1916] bg-[#EFE9DF] hover:bg-[#E5DDD0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#B8432A]"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-[#2C6E49]" aria-hidden="true" />
          Print Check
        </button>
        <button
          type="button"
          onClick={onExportSTL}
          disabled={!canExport}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#F7F3EC] bg-[#3B171E] hover:bg-[#52212A] disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8432A]"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Export STL
        </button>
      </div>
    </header>
  );
}
