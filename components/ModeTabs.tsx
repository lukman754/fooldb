'use client';
import { useDbStore, AppMode } from '@/store/dbStore';

export const NAV_TABS: { id: AppMode; label: string; shortLabel: string }[] = [
  { id: 'visual',         label: 'ERD / LRS Builder', shortLabel: 'Builder' },
  { id: 'erd',            label: 'Chen ERD',           shortLabel: 'Chen ERD' },
  { id: 'lrs',            label: 'LRS Schema',         shortLabel: 'LRS' },
  { id: 'transformation', label: 'ERD ➔ LRS',          shortLabel: 'ERD→LRS' },
  { id: 'class',          label: 'Class Diagram',      shortLabel: 'Class' },
  { id: 'uml',            label: 'UML Builder',        shortLabel: 'UML' },
  { id: 'usecase',        label: 'Use Case',           shortLabel: 'Use Case' },
];

export default function ModeTabs() {
  const mode = useDbStore((state) => state.mode);
  const setMode = useDbStore((state) => state.setMode);

  return (
    <div className="flex w-full overflow-x-auto scrollbar-minimal bg-zinc-950 border-t border-zinc-800 p-1 shrink-0 z-40">
      <div className="flex items-center gap-1 min-w-max px-1">
        {NAV_TABS.map((tab) => {
          const isActive = mode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
