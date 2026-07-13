'use client';

import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useDbStore } from '@/store/dbStore';

export default function SqlEditor() {
  const mode = useDbStore((state) => state.mode);
  const sqlCode = useDbStore((state) => state.sqlCode);
  const usecaseCode = useDbStore((state) => state.usecaseCode);
  const activityCode = useDbStore((state) => state.activityCode);
  const sequenceCode = useDbStore((state) => state.sequenceCode);
  const visualSchemaActive = useDbStore((state) => state.visualSchemaActive);
  const setCode = useDbStore((state) => state.setCode);
  const triggerParse = useDbStore((state) => state.triggerParse);

  // Mapped code states per use case
  const activityCodes = useDbStore((state) => state.activityCodes);
  const sequenceCodes = useDbStore((state) => state.sequenceCodes);
  const selectedUsecaseId = useDbStore((state) => state.selectedUsecaseId);
  const setSelectedUsecaseId = useDbStore((state) => state.setSelectedUsecaseId);
  const usecases = useDbStore((state) => state.umlUsecases);

  // Determine active code and language based on the workflow mode
  let activeCode = sqlCode;
  let activeLanguage = 'sql';

  if (mode === 'usecase') {
    activeCode = usecaseCode;
    activeLanguage = 'markdown';
  } else if (mode === 'activity') {
    activeCode = selectedUsecaseId ? (activityCodes[selectedUsecaseId] || '') : activityCode;
    activeLanguage = 'markdown';
  } else if (mode === 'sequence') {
    activeCode = selectedUsecaseId ? (sequenceCodes[selectedUsecaseId] || '') : sequenceCode;
    activeLanguage = 'markdown';
  }

  const isVisualBuilderSql = visualSchemaActive && (mode === 'erd' || mode === 'lrs' || mode === 'transformation');
  const hasUsecaseHeader = (mode === 'activity' || mode === 'sequence');

  const [value, setValue] = useState(activeCode);

  // Sync value when the active code, mode, or selected use case changes
  useEffect(() => {
    setValue(activeCode);
  }, [activeCode, mode, selectedUsecaseId]);

  // Debounce parsing when typing
  useEffect(() => {
    if (isVisualBuilderSql) return;
    const timer = setTimeout(() => {
      setCode(mode, value);
      triggerParse(mode, value);
    }, 300);

    return () => clearTimeout(timer);
  }, [value, mode, setCode, triggerParse, isVisualBuilderSql, selectedUsecaseId]);

  return (
    <div className="h-full w-full border-r border-zinc-800 bg-zinc-900">
      {isVisualBuilderSql && (
        <div className="flex h-8 items-center border-b border-blue-900/50 bg-blue-950/20 px-3 text-[10px] font-medium text-blue-300">
          SQL generated from Visual Builder (read-only)
        </div>
      )}
      {hasUsecaseHeader && (
        <div className="flex h-10 items-center justify-between border-b border-zinc-800 bg-zinc-950/20 px-3 text-[11px]">
          <span className="font-medium text-zinc-400">
            {mode === 'activity' ? 'Activity Diagram' : 'Sequence Diagram'} for:
          </span>
          <select
            value={selectedUsecaseId || ''}
            onChange={(e) => setSelectedUsecaseId(e.target.value || null)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-100 outline-none focus:border-blue-600 transition max-w-[180px] font-medium"
          >
            <option value="" className="bg-zinc-900 text-zinc-100">-- Global Diagram --</option>
            {usecases.map((uc) => (
              <option key={uc.id} value={uc.id} className="bg-zinc-900 text-zinc-100">
                {uc.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Editor
        height={
          isVisualBuilderSql 
            ? "calc(100% - 32px)" 
            : hasUsecaseHeader 
              ? "calc(100% - 40px)" 
              : "100%"
        }
        language={activeLanguage}
        theme="vs-dark"
        value={value}
        onChange={(val) => setValue(val || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'on',
          theme: 'vs-dark',
          padding: { top: 16, bottom: 16 },
          fontFamily: "'Fira Code', 'Courier New', Courier, monospace",
          fontLigatures: true,
          readOnly: isVisualBuilderSql,
        }}
        loading={
          <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-400">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-800 border-t-blue-600" />
              <p className="text-sm font-medium">Loading editor...</p>
            </div>
          </div>
        }
      />
    </div>
  );
}
