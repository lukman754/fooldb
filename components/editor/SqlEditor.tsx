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
  const setCode = useDbStore((state) => state.setCode);
  const triggerParse = useDbStore((state) => state.triggerParse);

  // Determine active code and language based on the workflow mode
  let activeCode = sqlCode;
  let activeLanguage = 'sql';

  if (mode === 'usecase') {
    activeCode = usecaseCode;
    activeLanguage = 'markdown';
  } else if (mode === 'activity') {
    activeCode = activityCode;
    activeLanguage = 'markdown';
  } else if (mode === 'sequence') {
    activeCode = sequenceCode;
    activeLanguage = 'markdown';
  }

  const [value, setValue] = useState(activeCode);

  // Sync value when the active code or mode changes
  useEffect(() => {
    setValue(activeCode);
  }, [activeCode, mode]);

  // Debounce parsing when typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setCode(mode, value);
      triggerParse(mode, value);
    }, 300);

    return () => clearTimeout(timer);
  }, [value, mode, setCode, triggerParse]);

  return (
    <div className="h-full w-full border-r border-zinc-800 bg-zinc-900">
      <Editor
        height="100%"
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
