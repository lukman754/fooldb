'use client';

import React from 'react';
import { useDbStore } from '@/store/dbStore';
import { Table } from '@/types';
import { Network, Table2, Layers2, Zap } from 'lucide-react';

export default function Footer() {
  const schema = useDbStore((state) => state.schema);
  const renderTime = useDbStore((state) => state.renderTime);

  const totalTables = schema.tables.length;
  const totalColumns = schema.tables.reduce((acc: number, t: Table) => acc + t.columns.length, 0);
  const totalRelationships = schema.relationships.length;

  return (
    <footer className="flex h-9 w-full items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6 text-xs text-zinc-500 z-20 select-none">
      {/* Left: Statistics */}
      <div className="flex items-center gap-6">
        <span className="flex items-center gap-1.5">
          <Table2 className="h-3.5 w-3.5 text-zinc-550" />
          <span>Tables: <strong className="text-zinc-300 font-semibold">{totalTables}</strong></span>
        </span>
        
        <span className="flex items-center gap-1.5">
          <Layers2 className="h-3.5 w-3.5 text-zinc-550" />
          <span>Columns: <strong className="text-zinc-300 font-semibold">{totalColumns}</strong></span>
        </span>

        <span className="flex items-center gap-1.5">
          <Network className="h-3.5 w-3.5 text-zinc-550" />
          <span>Relationships: <strong className="text-zinc-300 font-semibold">{totalRelationships}</strong></span>
        </span>
      </div>

      {/* Right: Render performance */}
      <div className="flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-blue-500/80" />
        <span>Layout render time: <strong className="text-zinc-300 font-mono font-medium">{renderTime}ms</strong></span>
      </div>
    </footer>
  );
}
