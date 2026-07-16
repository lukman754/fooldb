"use client";

import React from "react";
import { useDbStore } from "@/store/dbStore";
import { ActivityFormData, ActivityFormNode } from "@/types";
import { Plus, Trash2, ArrowRight, GitMerge, X } from "lucide-react";

export default function ActivityBuilder() {
  const selectedUsecaseId = useDbStore((state) => state.selectedUsecaseId);
  const setSelectedUsecaseId = useDbStore((state) => state.setSelectedUsecaseId);
  const usecases = useDbStore((state) => state.umlUsecases);
  const umlActors = useDbStore((state) => state.umlActors);
  const activityFormDatas = useDbStore((state) => state.activityFormDatas);
  const setActivityFormData = useDbStore((state) => state.setActivityFormData);

  const safeId = selectedUsecaseId || "_global";
  const defaultName = selectedUsecaseId ? (usecases.find((u) => u.id === selectedUsecaseId)?.name || "Activity") : "Global Activity";
  const formData = activityFormDatas[safeId] || {
    name: defaultName,
    swimlanes: umlActors.map(a => ({ id: a.id, name: a.name })),
    nodes: [],
  };

  const updateData = (newData: Partial<ActivityFormData>) => {
    setActivityFormData(selectedUsecaseId, { ...formData, ...newData });
  };

  const addSwimlane = () => {
    const id = `swimlane_${Date.now()}`;
    updateData({ swimlanes: [...formData.swimlanes, { id, name: "New Swimlane" }] });
  };

  const updateSwimlane = (id: string, name: string) => {
    updateData({
      swimlanes: formData.swimlanes.map((s) => (s.id === id ? { ...s, name } : s)),
    });
  };

  const removeSwimlane = (id: string) => {
    updateData({
      swimlanes: formData.swimlanes.filter((s) => s.id !== id),
      nodes: formData.nodes.map(n => n.swimlaneId === id ? { ...n, swimlaneId: "" } : n)
    });
  };

  const addNode = () => {
    const id = `node_${Date.now()}`;
    updateData({
      nodes: [
        ...formData.nodes,
        {
          id,
          type: "action",
          label: "New Action",
          swimlaneId: formData.swimlanes[0]?.id || "",
          nextIds: [],
          branches: [],
        },
      ],
    });
  };

  const updateNode = (id: string, changes: Partial<ActivityFormNode>) => {
    updateData({
      nodes: formData.nodes.map((n) => (n.id === id ? { ...n, ...changes } : n)),
    });
  };

  const removeNode = (id: string) => {
    updateData({
      nodes: formData.nodes
        .filter((n) => n.id !== id)
        .map((n) => ({
          ...n,
          nextIds: n.nextIds.filter((nid) => nid !== id),
          branches: n.branches.filter((b) => b.targetId !== id),
        })),
    });
  };

  const addBranch = (nodeId: string) => {
    updateData({
      nodes: formData.nodes.map((n) => {
        if (n.id === nodeId) {
          return { ...n, branches: [...n.branches, { condition: "Yes", targetId: "" }] };
        }
        return n;
      }),
    });
  };

  const updateBranch = (nodeId: string, index: number, condition: string, targetId: string) => {
    updateData({
      nodes: formData.nodes.map((n) => {
        if (n.id === nodeId) {
          const newBranches = [...n.branches];
          newBranches[index] = { condition, targetId };
          return { ...n, branches: newBranches };
        }
        return n;
      }),
    });
  };

  const removeBranch = (nodeId: string, index: number) => {
    updateData({
      nodes: formData.nodes.map((n) => {
        if (n.id === nodeId) {
          const newBranches = [...n.branches];
          newBranches.splice(index, 1);
          return { ...n, branches: newBranches };
        }
        return n;
      }),
    });
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-200">
      <div className="flex h-10 items-center justify-between border-b border-zinc-800 bg-zinc-950/20 px-3 text-[11px] shrink-0">
        <span className="font-medium text-zinc-400">Activity Diagram for:</span>
        <select
          value={selectedUsecaseId || ""}
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

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
        
        {/* Swimlanes */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-300">Swimlanes (Actors/Systems)</h3>
            <button
              onClick={addSwimlane}
              className="flex items-center gap-1 text-[10px] bg-blue-600/20 text-blue-400 px-2 py-1 rounded hover:bg-blue-600/30 transition-colors font-medium"
            >
              <Plus className="w-3 h-3" /> Add Swimlane
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.swimlanes.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1">
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => updateSwimlane(s.id, e.target.value)}
                  className="bg-transparent border-none outline-none text-xs w-28 text-zinc-200"
                  placeholder="Name"
                />
                <button onClick={() => removeSwimlane(s.id)} className="text-zinc-500 hover:text-red-400">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {formData.swimlanes.length === 0 && (
              <div className="text-[10px] text-zinc-500 italic">No swimlanes added. Add one to start.</div>
            )}
          </div>
        </section>

        {/* Nodes */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-300">Activity Steps (Nodes)</h3>
            <button
              onClick={addNode}
              className="flex items-center gap-1 text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-600/30 transition-colors font-medium"
            >
              <Plus className="w-3 h-3" /> Add Node
            </button>
          </div>
          
          <div className="space-y-3">
            {formData.nodes.map((node, index) => (
              <div key={node.id} className="bg-zinc-800 border border-zinc-700 rounded-md p-3 relative group">
                <button onClick={() => removeNode(node.id)} className="absolute top-2 right-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-4 h-4" />
                </button>
                
                <div className="flex items-center gap-3 mb-2 flex-wrap pr-6">
                  <div className="text-[10px] font-mono text-zinc-500 w-6">#{index + 1}</div>
                  
                  <select
                    value={node.type}
                    onChange={(e) => updateNode(node.id, { type: e.target.value as ActivityFormNode['type'] })}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-600"
                  >
                    <option value="start">Start</option>
                    <option value="action">Action</option>
                    <option value="decision">Decision</option>
                    <option value="fork">Fork</option>
                    <option value="join">Join</option>
                    <option value="end">End</option>
                  </select>

                  {(node.type === "action" || node.type === "decision") && (
                    <input
                      type="text"
                      value={node.label}
                      onChange={(e) => updateNode(node.id, { label: e.target.value })}
                      placeholder={node.type === "decision" ? "Question?" : "Action name"}
                      className="flex-1 min-w-[120px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-600"
                    />
                  )}

                  <select
                    value={node.swimlaneId}
                    onChange={(e) => updateNode(node.id, { swimlaneId: e.target.value })}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-600"
                  >
                    <option value="">-- No Swimlane --</option>
                    {formData.swimlanes.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Next Steps Configuration */}
                {node.type !== "end" && (
                  <div className="pl-9 mt-3 border-t border-zinc-700/50 pt-2">
                    {node.type === "decision" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-400 font-medium">Branches:</span>
                          <button onClick={() => addBranch(node.id)} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Add Branch
                          </button>
                        </div>
                        {node.branches.map((branch, bIdx) => (
                          <div key={bIdx} className="flex items-center gap-2">
                            <GitMerge className="w-3 h-3 text-zinc-500" />
                            <input
                              type="text"
                              value={branch.condition}
                              onChange={(e) => updateBranch(node.id, bIdx, e.target.value, branch.targetId)}
                              className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs outline-none"
                              placeholder="If..."
                            />
                            <ArrowRight className="w-3 h-3 text-zinc-500" />
                            <select
                              value={branch.targetId}
                              onChange={(e) => updateBranch(node.id, bIdx, branch.condition, e.target.value)}
                              className="flex-1 max-w-[180px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs outline-none"
                            >
                              <option value="">-- Target --</option>
                              {formData.nodes.filter(n => n.id !== node.id).map(n => (
                                <option key={n.id} value={n.id}>{n.label || n.type} (#{formData.nodes.findIndex(x => x.id === n.id) + 1})</option>
                              ))}
                            </select>
                            <button onClick={() => removeBranch(node.id, bIdx)} className="text-zinc-500 hover:text-red-400">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : node.type === "fork" ? (
                      <div className="space-y-2">
                        <div className="text-[10px] text-zinc-400 font-medium">Parallel Next Steps:</div>
                        <div className="flex flex-wrap gap-2">
                          {node.nextIds.map((nid, idx) => (
                            <div key={idx} className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1">
                              <span className="text-xs text-zinc-300">
                                {formData.nodes.find(n => n.id === nid)?.label || formData.nodes.find(n => n.id === nid)?.type}
                              </span>
                              <button
                                onClick={() => updateNode(node.id, { nextIds: node.nextIds.filter(id => id !== nid) })}
                                className="text-zinc-500 hover:text-red-400 ml-1"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value && !node.nextIds.includes(e.target.value)) {
                                updateNode(node.id, { nextIds: [...node.nextIds, e.target.value] });
                              }
                            }}
                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs outline-none w-24"
                          >
                            <option value="">+ Add...</option>
                            {formData.nodes.filter(n => n.id !== node.id && !node.nextIds.includes(n.id)).map(n => (
                              <option key={n.id} value={n.id}>{n.label || n.type}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 font-medium">Next Step:</span>
                        <select
                          value={node.nextIds[0] || ""}
                          onChange={(e) => updateNode(node.id, { nextIds: e.target.value ? [e.target.value] : [] })}
                          className="w-[180px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs outline-none"
                        >
                          <option value="">-- Target --</option>
                          {formData.nodes.filter(n => n.id !== node.id).map(n => (
                            <option key={n.id} value={n.id}>{n.label || n.type} (#{formData.nodes.findIndex(x => x.id === n.id) + 1})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {formData.nodes.length === 0 && (
              <div className="text-xs text-zinc-500 italic text-center py-6">
                No activity steps yet. Add a Start node to begin.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
