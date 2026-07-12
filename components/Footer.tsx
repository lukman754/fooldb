'use client';

import React from 'react';
import { useDbStore } from '@/store/dbStore';
import { Table } from '@/types';
import { Network, Table2, Layers2, Zap, ZoomIn, ZoomOut, Maximize2, RotateCcw, RefreshCw } from 'lucide-react';

export default function Footer() {
  const schema = useDbStore((state) => state.schema);
  const renderTime = useDbStore((state) => state.renderTime);
  const mode = useDbStore((state) => state.mode);
  const triggerParse = useDbStore((state) => state.triggerParse);

  const zoom = useDbStore((state) => state.zoom);
  const setZoom = useDbStore((state) => state.setZoom);
  const resetZoom = useDbStore((state) => state.resetZoom);
  const triggerFit = useDbStore((state) => state.triggerFit);

  const totalTables = schema.tables.length;
  const totalColumns = schema.tables.reduce((acc: number, t: Table) => acc + t.columns.length, 0);
  const totalRelationships = schema.relationships.length;

  const handleZoomIn = () => setZoom((z: number) => Math.min(3, z + 0.1));
  const handleZoomOut = () => setZoom((z: number) => Math.max(0.1, z - 0.1));
  const handleReset = () => resetZoom();

  return (
    <footer className="flex h-8 w-full items-center justify-between border-t border-zinc-800 bg-zinc-950 px-3 md:px-4 text-xs text-zinc-500 z-20 select-none shrink-0">
      
      {/* Left: Schema statistics */}
      <div className="flex items-center gap-3 md:gap-5">
        <span className="flex items-center gap-1.5">
          <Table2 className="h-3 w-3 text-zinc-600 shrink-0" />
          <span>
            <span className="hidden sm:inline">Tables: </span>
            <strong className="text-zinc-300 font-medium">{totalTables}</strong>
          </span>
        </span>

        <span className="flex items-center gap-1.5">
          <Layers2 className="h-3 w-3 text-zinc-600 shrink-0" />
          <span className="hidden md:inline">Cols: </span>
          <strong className="text-zinc-300 font-medium">{totalColumns}</strong>
        </span>

        <span className="flex items-center gap-1.5">
          <Network className="h-3 w-3 text-zinc-600 shrink-0" />
          <span className="hidden md:inline">Rels: </span>
          <strong className="text-zinc-300 font-medium">{totalRelationships}</strong>
        </span>

        <span className="hidden sm:flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-blue-500/70 shrink-0" />
          <strong className="text-zinc-500 font-mono font-medium">{renderTime}ms</strong>
        </span>
      </div>

      {/* Right: Zoom + View controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomOut}
          className="flex h-6 w-6 items-center justify-center rounded border border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="h-3 w-3" />
        </button>

        <span className="min-w-[36px] text-center text-[10px] font-mono text-zinc-400">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={handleZoomIn}
          className="flex h-6 w-6 items-center justify-center rounded border border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="h-3 w-3" />
        </button>

        <div className="w-px h-3.5 bg-zinc-800 mx-0.5" />

        <button
          onClick={() => triggerFit()}
          className="flex h-6 px-1.5 items-center gap-1 rounded border border-transparent text-[10px] font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="Fit to Screen"
        >
          <Maximize2 className="h-3 w-3" />
          <span className="hidden sm:inline">Fit</span>
        </button>

        <button
          onClick={handleReset}
          className="flex h-6 px-1.5 items-center gap-1 rounded border border-transparent text-[10px] font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="Reset Zoom"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        <button
          onClick={() => triggerParse(mode)}
          className="flex h-6 px-1.5 items-center gap-1 rounded border border-transparent text-[10px] font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="Refresh Diagram"
        >
          <RefreshCw className="h-3 w-3" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </footer>
  );
}
