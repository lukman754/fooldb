'use client';

import React, { useState } from 'react';
import { useDbStore } from '@/store/dbStore';
import { Plus, Trash2, Code, Sparkles, RefreshCw } from 'lucide-react';
import { generateClassMethods } from '@/lib/ai/geminiClient';

export default function ClassEditor() {
  const schema = useDbStore((state) => state.schema);
  const classMethods = useDbStore((state) => state.classMethods);
  const addClassMethod = useDbStore((state) => state.addClassMethod);
  const removeClassMethod = useDbStore((state) => state.removeClassMethod);
  const setClassMethods = useDbStore((state) => state.setClassMethods);
  const apiKey = useDbStore((state) => state.apiKey);

  const [selectedTable, setSelectedTable] = useState<string>(
    schema.tables[0]?.name || ''
  );
  const [newMethod, setNewMethod] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const activeTable = schema.tables.find(t => t.name === selectedTable)
    ? selectedTable
    : schema.tables[0]?.name || '';

  const activeTableDef = schema.tables.find(t => t.name === activeTable);

  // Return empty list or defaults if none exist
  const currentMethods = classMethods[activeTable] || [
    `+ insert(input: Data): void`,
    `+ delete(id: int): boolean`,
    `+ findById(id: int): Object`
  ];

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMethod.trim() || !activeTable) return;
    addClassMethod(activeTable, newMethod.trim());
    setNewMethod('');
  };

  const handleSuggest = (sig: string) => {
    if (!activeTable) return;
    addClassMethod(activeTable, sig);
  };

  const handleAiGenerate = async () => {
    if (!activeTable) return;
    if (!apiKey) {
      alert("API Key is missing. Please click the Key icon in the header to set your Gemini API Key.");
      return;
    }
    setIsAiLoading(true);
    try {
      const activeCols = activeTableDef?.columns.map(c => ({ name: c.name, type: c.type })) || [];
      const methods = await generateClassMethods(activeTable, activeCols, apiKey);
      setClassMethods({
        ...classMethods,
        [activeTable]: methods
      });
    } catch (err: any) {
      alert(err.message || "Failed to generate methods.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950/40 border-r border-zinc-800">
      {/* Title */}
      <div className="p-4 border-b border-zinc-800 shrink-0 bg-zinc-950/20 flex items-center gap-2">
        <Code className="h-4 w-4 text-blue-500" />
        <div>
          <h2 className="text-sm font-medium text-zinc-200">UML Class Editor</h2>
          <p className="text-[10px] text-zinc-500 font-medium">Add operations/methods to classes</p>
        </div>
      </div>

      {/* Selector and Main Panel */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-mini">
        {/* Table/Class Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Select Class
          </label>
          <div className="flex gap-2">
            <select
              value={activeTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-mono font-medium text-zinc-200 focus:outline-none focus:border-blue-600 transition min-w-0"
            >
              {schema.tables.length === 0 ? (
                <option value="">No tables parsed</option>
              ) : (
                schema.tables.map((t) => (
                  <option key={t.name} value={t.name}>
                    class {t.name}
                  </option>
                ))
              )}
            </select>

            {schema.tables.length > 0 && activeTable && (
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={isAiLoading}
                title="Auto-generate methods using Gemini AI"
                className={`flex h-9 px-3 items-center gap-1.5 rounded border text-xs font-medium transition shrink-0 ${
                  isAiLoading
                    ? "border-blue-900/40 bg-blue-950/30 text-blue-400 cursor-not-allowed"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {isAiLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                )}
                <span>AI Generate</span>
              </button>
            )}
          </div>
        </div>

        {schema.tables.length > 0 && activeTable && (
          <>
            {/* Add Method Form */}
            <form onSubmit={handleAdd} className="space-y-2">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                Add Method / Operation
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="+ delete(id: int): boolean"
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono font-medium text-zinc-200 focus:outline-none focus:border-blue-600 placeholder:text-zinc-600"
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
              <p className="text-[9px] text-zinc-500 leading-normal font-medium">
                Example: <code className="font-mono text-zinc-400">+ getEmail(): String</code> or <code className="font-mono text-zinc-400">- update(id: int): void</code>
              </p>
            </form>

            <div className="h-px bg-zinc-800" />

            {/* Methods List */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
                Class Methods ({currentMethods.length})
              </label>
              
              <div className="space-y-1.5">
                {currentMethods.map((method, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-300"
                  >
                    <span>{method}</span>
                    <button
                      type="button"
                      onClick={() => removeClassMethod(activeTable, idx)}
                      className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-800 transition"
                      title="Remove method"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {currentMethods.length === 0 && (
                  <p className="text-xs text-zinc-500 italic text-center py-4 border border-dashed border-zinc-800 rounded">
                    No methods added yet. Use form above to add methods.
                  </p>
                )}
              </div>
            </div>

            <div className="h-px bg-zinc-800" />

            {/* Suggested templates */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
                Suggested Common Operations
              </label>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSuggest('+ create(input: Data): boolean')}
                  className="w-full text-left p-2 rounded bg-zinc-900/30 hover:bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-550 hover:text-zinc-200 transition"
                >
                  + create(input: Data): boolean
                </button>
                <button
                  type="button"
                  onClick={() => handleSuggest('+ getById(id: int): Object')}
                  className="w-full text-left p-2 rounded bg-zinc-900/30 hover:bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-550 hover:text-zinc-200 transition"
                >
                  + getById(id: int): Object
                </button>
                <button
                  type="button"
                  onClick={() => handleSuggest('+ update(id: int, data: Data): void')}
                  className="w-full text-left p-2 rounded bg-zinc-900/30 hover:bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-550 hover:text-zinc-200 transition"
                >
                  + update(id: int, data: Data): void
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
