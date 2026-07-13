"use client";

import React, { useState, useRef, useEffect } from "react";
import { useDbStore } from "@/store/dbStore";
import { UseCaseDiagram } from "@/types";
import { Plus, Trash2, Check, X, User, Activity, ArrowLeft, ArrowRight, Link, Unlink, GitBranch, Shuffle } from "lucide-react";

let nextId = 1;
function genId() { return `uml_${nextId++}`; }

interface UmlActor {
  id: string;
  name: string;
  side: "left" | "right";
}

interface UmlUsecase {
  id: string;
  name: string;
}

interface UmlLink {
  id: string;
  actorId: string;
  usecaseId: string;
}

interface UmlRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: "include" | "extend";
}

function buildDiagram(actors: UmlActor[], usecases: UmlUsecase[], links: UmlLink[], relations: UmlRelation[]): UseCaseDiagram {
  return {
    actors: actors.map(a => ({ id: a.id, name: a.name, side: a.side })),
    usecases: usecases.map(u => ({ id: u.id, name: u.name })),
    systems: [{ name: "System Boundary", usecaseIds: usecases.map(u => u.id) }],
    connections: [
      ...links.map(l => ({ id: l.id, from: l.actorId, to: l.usecaseId })),
      ...relations.map(r => ({ id: r.id, from: r.sourceId, to: r.targetId, label: `<<${r.type}>>` })),
    ],
  };
}

function InlineEdit({ value, onCommit, className = "" }: { value: string; onCommit: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onCommit(draft.trim());
    else setDraft(value);
  };
  if (editing) {
    return (
      <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={`bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs outline-none text-zinc-100 w-full ${className}`} />
    );
  }
  return (
    <span className={`cursor-pointer hover:text-blue-400 transition-colors ${className}`}
      onDoubleClick={() => { setDraft(value); setEditing(true); }}>
      {value}
    </span>
  );
}

export default function UmlBuilder() {
  const actors = useDbStore((state) => state.umlActors);
  const setActors = useDbStore((state) => state.setUmlActors);
  const usecases = useDbStore((state) => state.umlUsecases);
  const setUsecases = useDbStore((state) => state.setUmlUsecases);
  const links = useDbStore((state) => state.umlLinks);
  const setLinks = useDbStore((state) => state.setUmlLinks);
  const relations = useDbStore((state) => state.umlRelations);
  const setRelations = useDbStore((state) => state.setUmlRelations);

  const [showAddActor, setShowAddActor] = useState(false);
  const [showAddUsecase, setShowAddUsecase] = useState(false);
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [newActorName, setNewActorName] = useState("");
  const [newUsecaseName, setNewUsecaseName] = useState("");
  const [newRelSource, setNewRelSource] = useState("");
  const [newRelTarget, setNewRelTarget] = useState("");
  const [newRelType, setNewRelType] = useState<"include" | "extend">("include");
  const [openLinkActor, setOpenLinkActor] = useState<string | null>(null);
  const addActorRef = useRef<HTMLInputElement>(null);
  const addUcRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useDbStore.setState({ usecaseDiagram: buildDiagram(actors, usecases, links, relations) });
  }, [actors, usecases, links, relations]);

  useEffect(() => { if (showAddActor) addActorRef.current?.focus(); }, [showAddActor]);
  useEffect(() => { if (showAddUsecase) addUcRef.current?.focus(); }, [showAddUsecase]);

  // ── Actor actions ──
  const handleAddActor = () => {
    const n = newActorName.trim();
    if (!n || actors.some(a => a.name.toLowerCase() === n.toLowerCase())) return;
    setActors(prev => [...prev, { id: genId(), name: n, side: "left" }]);
    setNewActorName(""); setShowAddActor(false);
  };
  const handleRemoveActor = (id: string) => {
    setActors(prev => prev.filter(a => a.id !== id));
    setLinks(prev => prev.filter(l => l.actorId !== id));
  };
  const handleRenameActor = (id: string, name: string) => setActors(prev => prev.map(a => a.id === id ? { ...a, name } : a));
  const handleToggleSide = (id: string) => setActors(prev => prev.map(a => a.id === id ? { ...a, side: a.side === "left" ? "right" : "left" } : a));

  // ── Usecase actions ──
  const handleAddUsecase = () => {
    const n = newUsecaseName.trim();
    if (!n || usecases.some(u => u.name.toLowerCase() === n.toLowerCase())) return;
    setUsecases(prev => [...prev, { id: genId(), name: n }]);
    setNewUsecaseName(""); setShowAddUsecase(false);
  };
  const handleRemoveUsecase = (id: string) => {
    setUsecases(prev => prev.filter(u => u.id !== id));
    setLinks(prev => prev.filter(l => l.usecaseId !== id));
    setRelations(prev => prev.filter(r => r.sourceId !== id && r.targetId !== id));
  };
  const handleRenameUsecase = (id: string, name: string) => setUsecases(prev => prev.map(u => u.id === id ? { ...u, name } : u));

  // ── Link actions ──
  const handleToggleLink = (actorId: string, usecaseId: string) => {
    const exists = links.find(l => l.actorId === actorId && l.usecaseId === usecaseId);
    if (exists) setLinks(prev => prev.filter(l => l !== exists));
    else setLinks(prev => [...prev, { id: genId(), actorId, usecaseId }]);
  };

  // ── Relation actions ──
  const handleAddRelation = () => {
    if (!newRelSource || !newRelTarget || newRelSource === newRelTarget) return;
    const exists = relations.some(r => r.sourceId === newRelSource && r.targetId === newRelTarget);
    if (exists) return;
    setRelations(prev => [...prev, { id: genId(), sourceId: newRelSource, targetId: newRelTarget, type: newRelType }]);
    setNewRelSource(""); setNewRelTarget(""); setNewRelType("include"); setShowAddRelation(false);
  };
  const handleRemoveRelation = (id: string) => setRelations(prev => prev.filter(r => r.id !== id));

  const usecaseMap = new Map(usecases.map(u => [u.id, u]));

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5 bg-zinc-950 shrink-0 flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300 whitespace-nowrap">UML Builder</span>
          <span className="text-[10px] text-zinc-550 whitespace-nowrap">
            {actors.length} actors &middot; {usecases.length} UCs &middot; {relations.length} rels
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setShowAddActor(true)}
            className="flex items-center gap-1.5 rounded bg-indigo-600 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-indigo-500 transition-colors whitespace-nowrap">
            <User className="h-3 w-3" /> Actor
          </button>
          <button onClick={() => setShowAddUsecase(true)}
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-emerald-500 transition-colors whitespace-nowrap">
            <Activity className="h-3 w-3" /> Use Case
          </button>
          <button onClick={() => setShowAddRelation(true)}
            className="flex items-center gap-1.5 rounded bg-amber-600 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-amber-500 transition-colors whitespace-nowrap">
            <GitBranch className="h-3 w-3" /> Include/Extend
          </button>
        </div>
      </div>

      {/* ── Add Actor Input ── */}
      {showAddActor && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 bg-indigo-950/20 shrink-0">
          <User className="h-4 w-4 text-indigo-400 shrink-0" />
          <input ref={addActorRef} value={newActorName} onChange={(e) => setNewActorName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddActor(); if (e.key === "Escape") { setShowAddActor(false); setNewActorName(""); } }}
            placeholder="Actor name" className="flex-1 bg-transparent text-xs text-zinc-100 border-b border-indigo-500 outline-none py-0.5 placeholder-zinc-600" />
          <button onClick={handleAddActor} className="text-indigo-400 hover:text-indigo-300"><Check className="h-4 w-4" /></button>
          <button onClick={() => { setShowAddActor(false); setNewActorName(""); }} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Add Usecase Input ── */}
      {showAddUsecase && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 bg-emerald-950/20 shrink-0">
          <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
          <input ref={addUcRef} value={newUsecaseName} onChange={(e) => setNewUsecaseName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddUsecase(); if (e.key === "Escape") { setShowAddUsecase(false); setNewUsecaseName(""); } }}
            placeholder="Use case name" className="flex-1 bg-transparent text-xs text-zinc-100 border-b border-emerald-500 outline-none py-0.5 placeholder-zinc-600" />
          <button onClick={handleAddUsecase} className="text-emerald-400 hover:text-emerald-300"><Check className="h-4 w-4" /></button>
          <button onClick={() => { setShowAddUsecase(false); setNewUsecaseName(""); }} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Add Relation Input ── */}
      {showAddRelation && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 bg-amber-950/20 shrink-0 flex-wrap">
          <GitBranch className="h-4 w-4 text-amber-400 shrink-0" />
          <select value={newRelSource} onChange={(e) => setNewRelSource(e.target.value)}
            className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 border border-zinc-700 outline-none">
            <option value="">Source UC</option>
            {usecases.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={newRelType} onChange={(e) => setNewRelType(e.target.value as "include" | "extend")}
            className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 border border-zinc-700 outline-none">
            <option value="include">&lt;&lt;include&gt;&gt;</option>
            <option value="extend">&lt;&lt;extend&gt;&gt;</option>
          </select>
          <select value={newRelTarget} onChange={(e) => setNewRelTarget(e.target.value)}
            className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 border border-zinc-700 outline-none">
            <option value="">Target UC</option>
            {usecases.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button onClick={handleAddRelation} className="text-amber-400 hover:text-amber-300"><Check className="h-4 w-4" /></button>
          <button onClick={() => { setShowAddRelation(false); setNewRelSource(""); setNewRelTarget(""); }} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-mini">
        {/* ── Actors ── */}
        {actors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
            <User className="h-8 w-8 text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-400">No actors yet</p>
            <button onClick={() => setShowAddActor(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500">
              <Plus className="h-3 w-3 inline mr-1" />Add Actor
            </button>
          </div>
        ) : (
          actors.map(actor => {
            const actorLinks = links.filter(l => l.actorId === actor.id);
            const linkedUcIds = new Set(actorLinks.map(l => l.usecaseId));
            const unlinkedUsecases = usecases.filter(u => !linkedUcIds.has(u.id));
            return (
              <div key={actor.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                {/* Actor header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
                  <User className="h-4 w-4 text-indigo-400 shrink-0" />
                  <InlineEdit value={actor.name} onCommit={(v) => handleRenameActor(actor.id, v)}
                    className="text-sm font-semibold text-zinc-200" />
                  <button onClick={() => handleToggleSide(actor.id)}
                    className={`ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition ${actor.side === "left" ? "bg-blue-950/40 text-blue-400 border border-blue-800/40" : "bg-amber-950/40 text-amber-400 border border-amber-800/40"}`}
                    title="Toggle actor side">
                    {actor.side === "left" ? <><ArrowLeft className="h-3 w-3" /> Left</> : <><ArrowRight className="h-3 w-3" /> Right</>}
                  </button>
                  <span className="text-[10px] text-zinc-600 ml-auto">{actorLinks.length} UC{actorLinks.length !== 1 ? "s" : ""}</span>
                  <button onClick={() => handleRemoveActor(actor.id)} className="text-zinc-600 hover:text-red-400 transition-colors" title="Delete actor">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Linked use cases */}
                <div className="px-3 py-2 space-y-1">
                  {actorLinks.length === 0 && (
                    <p className="text-[10px] text-zinc-600 italic px-1">No use cases linked</p>
                  )}
                  {actorLinks.map(link => {
                    const uc = usecaseMap.get(link.usecaseId);
                    if (!uc) return null;
                    return (
                      <div key={link.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors group">
                        <Link className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="text-xs text-zinc-300 flex-1">{uc.name}</span>
                        <button onClick={() => handleToggleLink(actor.id, uc.id)}
                          className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Unlink">
                          <Unlink className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  {/* Link dropdown */}
                  <div className="relative">
                    <button onClick={() => setOpenLinkActor(openLinkActor === actor.id ? null : actor.id)}
                      className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 rounded transition-colors w-full">
                      <Plus className="h-3 w-3" /> Link Use Case
                    </button>
                    {openLinkActor === actor.id && (
                      <div className="mt-1 rounded border border-zinc-700 bg-zinc-900 p-1 max-h-40 overflow-y-auto z-10 scrollbar-mini">
                        {unlinkedUsecases.length === 0 ? (
                          <p className="px-2 py-1 text-[10px] text-zinc-600 italic">All use cases linked</p>
                        ) : unlinkedUsecases.map(uc => (
                          <button key={uc.id} onClick={() => { handleToggleLink(actor.id, uc.id); }}
                            className="w-full text-left px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 rounded transition-colors">
                            + {uc.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* ── Use Cases (global list) ── */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
            <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-sm font-semibold text-zinc-200">Use Cases</span>
            <span className="text-[10px] text-zinc-600 ml-auto">{usecases.length} total</span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {usecases.length === 0 ? (
              <p className="text-[10px] text-zinc-600 italic px-1">No use cases yet</p>
            ) : usecases.map(uc => {
              const linkCount = links.filter(l => l.usecaseId === uc.id).length;
              return (
                <div key={uc.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors group">
                  <Activity className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <InlineEdit value={uc.name} onCommit={(v) => handleRenameUsecase(uc.id, v)}
                    className="text-xs text-zinc-300 flex-1" />
                  <span className="text-[9px] text-zinc-600">{linkCount} link{linkCount !== 1 ? "s" : ""}</span>
                  <button onClick={() => handleRemoveUsecase(uc.id)} className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Delete use case">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Include/Extend Relations ── */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
            <GitBranch className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-zinc-200">Include / Extend</span>
            <span className="text-[10px] text-zinc-600 ml-auto">{relations.length} relation{relations.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {relations.length === 0 ? (
              <p className="text-[10px] text-zinc-600 italic px-1">No include/extend relations yet</p>
            ) : relations.map(rel => {
              const src = usecaseMap.get(rel.sourceId);
              const tgt = usecaseMap.get(rel.targetId);
              if (!src || !tgt) return null;
              return (
                <div key={rel.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors group">
                  <Shuffle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs text-zinc-300">
                    {src.name} <span className="text-amber-500 font-mono text-[10px]">&lt;&lt;{rel.type}&gt;&gt;</span> {tgt.name}
                  </span>
                  <button onClick={() => handleRemoveRelation(rel.id)} className="ml-auto text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Delete relation">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}