'use client';

import React, { useState } from 'react';
import { useDbStore } from '@/store/dbStore';
import { Database, HelpCircle, ArrowRight, CheckCircle2, Link, Key, Grid } from 'lucide-react';

export default function TransformationGuide() {
  const schema = useDbStore((state) => state.schema);
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: '1. Entities ➔ Relations',
      icon: Database,
      desc: 'Chen ERD entity rectangles are transformed into LRS relation tables.',
      render: () => (
        <div className="space-y-4">
          <p className="text-zinc-400 text-xs leading-relaxed">
            Each entity rectangle in the Chen ERD maps to a separate table block in LRS. For your current schema:
          </p>
          <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-mini">
            {schema.tables.map((table) => (
              <div key={table.name} className="flex items-center gap-2 p-2 rounded bg-zinc-900/60 border border-zinc-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-xs font-mono font-medium text-zinc-200">{table.name}</span>
                <ArrowRight className="h-3 w-3 text-zinc-650" />
                <span className="text-[11px] text-zinc-450 font-medium">Table relation with {table.columns.length} columns</span>
                {table.isJunctionTable && (
                  <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-medium shrink-0 ml-auto">
                    Junction
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: '2. Attributes ➔ Columns',
      icon: Key,
      desc: 'Orbiting attribute ellipses map directly to table column fields. Primary Key ovals map to PK columns.',
      render: () => (
        <div className="space-y-4">
          <p className="text-zinc-400 text-xs leading-relaxed">
            In LRS, attributes are stacked vertically inside the table boxes. Underlined primary keys are marked with a blue PK badge:
          </p>
          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-mini">
            {schema.tables.map((table) => {
              const pks = table.columns.filter(c => c.isPrimaryKey);
              return (
                <div key={table.name} className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <div className="text-xs font-medium text-zinc-300 font-mono">{table.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pks.map(pk => (
                      <span key={pk.name} className="inline-flex items-center gap-1 text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-200 px-2 py-0.5 rounded font-medium font-mono">
                        <Key className="h-2.5 w-2.5 text-blue-500" />
                        {pk.name} (PK)
                      </span>
                    ))}
                    {table.columns.filter(c => !c.isPrimaryKey && c.isUnique).map(uq => (
                      <span key={uq.name} className="inline-flex items-center gap-1 text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-350 px-2 py-0.5 rounded font-medium font-mono">
                        {uq.name} (UQ)
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )
    },
    {
      title: '3. FKs ➔ Relation Connectors',
      icon: Link,
      desc: 'Chen relationship diamonds map to physical Foreign Key attributes linking tables together.',
      render: () => (
        <div className="space-y-4">
          <p className="text-zinc-400 text-xs leading-relaxed">
            Foreign keys link child tables back to parent tables. 1:N relations result in FK columns on the many side, while N:M relations require a Junction table:
          </p>
          <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-mini">
            {schema.relationships.length > 0 ? (
              schema.relationships.map((rel) => (
                <div key={rel.id} className="p-2 rounded bg-zinc-900/60 border border-zinc-800 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-medium">
                    <span>Relationship: {rel.type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                    <span className="text-zinc-450">{rel.sourceTable}</span>
                    <ArrowRight className="h-3 w-3 text-zinc-650" />
                    <span className="text-blue-500 font-medium">{rel.targetTable}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    Link: <span className="font-medium text-zinc-400">{rel.targetTable}.({rel.targetColumns.join(',')})</span> references <span className="font-medium text-zinc-400">{rel.sourceTable}.({rel.sourceColumns.join(',')})</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-zinc-500 italic p-4 text-center border border-dashed border-zinc-800 rounded">
                No foreign keys found in the schema. Add a FOREIGN KEY constraint to link tables!
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      title: '4. Physical LRS Design',
      icon: Grid,
      desc: 'All mappings are resolved. View the final structured schema layout on the right canvas.',
      render: () => (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-950/20 border border-blue-900/40 text-xs text-zinc-200 leading-relaxed space-y-2">
            <h4 className="font-medium text-blue-450 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              Transformation completed!
            </h4>
            <p>
              The diagram on the right has been transformed into a Logical Record Structure (LRS) schema. The table layout lists all columns, primary keys, and foreign keys cleanly.
            </p>
            <p className="text-[11px] text-zinc-400 font-medium">
              You can now click <strong>Export LRS</strong> in the header to download the .drawio XML, or switch back to the **ERD** tab to view Chen&apos;s ovals.
            </p>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950/40 border-r border-zinc-800">
      {/* Title */}
      <div className="p-4 border-b border-zinc-800 shrink-0 bg-zinc-950/20 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-blue-500" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">ERD to LRS transformation guide</h2>
          <p className="text-[10px] text-zinc-500 font-medium">Interactive walkthrough of relational schema design</p>
        </div>
      </div>

      {/* Step Tabs */}
      <div className="flex border-b border-zinc-800 shrink-0 bg-zinc-950/10">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = idx === activeStep;
          return (
            <button
              key={idx}
              onClick={() => setActiveStep(idx)}
              className={`flex-1 py-3 px-1 text-center flex flex-col items-center gap-1 border-b-2 transition-all ${
                isActive 
                  ? 'border-blue-600 bg-blue-950/10 text-blue-400 font-medium' 
                  : 'border-transparent text-zinc-450 hover:text-zinc-200 hover:bg-zinc-900/20'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-blue-500' : 'text-zinc-500'}`} />
              <span className="text-[9px] tracking-tight truncate max-w-full font-medium">{s.title.split('. ')[1]}</span>
            </button>
          );
        })}
      </div>

      {/* Step Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-mini">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200 mb-1">{steps[activeStep].title}</h3>
          <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">{steps[activeStep].desc}</p>
        </div>

        <div className="h-px bg-zinc-800" />

        {steps[activeStep].render()}
      </div>

      {/* Footer Nav */}
      <div className="p-3 border-t border-zinc-800 shrink-0 bg-zinc-900/30 flex items-center justify-between">
        <button
          onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
          disabled={activeStep === 0}
          className="px-3 py-1.5 rounded text-[11px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-450 hover:text-zinc-250 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition"
        >
          Previous
        </button>
        <span className="text-[10px] font-mono text-zinc-550 font-medium">
          Step {activeStep + 1} of {steps.length}
        </span>
        <button
          onClick={() => setActiveStep(prev => Math.min(steps.length - 1, prev + 1))}
          disabled={activeStep === steps.length - 1}
          className="px-3 py-1.5 rounded text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}
