'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useDbStore } from '@/store/dbStore';
import { getRelationshipLabel } from '@/lib/xml/drawioGenerator';
import { Column } from '@/types';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, RefreshCw, Filter, Sparkles, Sliders } from 'lucide-react';

export default function DrawioPreview() {
  const mode = useDbStore((state) => state.mode);
  
  // Diagram states
  const layout = useDbStore((state) => state.layout); // used for ERD & LRS
  const usecaseDiagram = useDbStore((state) => state.usecaseDiagram);
  const activityDiagram = useDbStore((state) => state.activityDiagram);
  const sequenceDiagram = useDbStore((state) => state.sequenceDiagram);
  
  const schema = useDbStore((state) => state.schema);
  const excludedTables = useDbStore((state) => state.excludedTables);
  const toggleTableExclusion = useDbStore((state) => state.toggleTableExclusion);
  const clearExcludedTables = useDbStore((state) => state.clearExcludedTables);
  const [showTableFilter, setShowTableFilter] = useState(false);
  
  const error = useDbStore((state) => state.error);
  const triggerParse = useDbStore((state) => state.triggerParse);
  const isAiLoading = useDbStore((state) => state.isAiLoading);
  const triggerAiLabeling = useDbStore((state) => state.triggerAiLabeling);
  
  const zoom = useDbStore((state) => state.zoom);
  const setZoom = useDbStore((state) => state.setZoom);
  const resetZoom = useDbStore((state) => state.resetZoom);

  // Zooming & Panning refs and states
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging and positioning states for attributes
  const [draggingAttr, setDraggingAttr] = useState<{ tableName: string; colName: string } | null>(null);
  const [selectedAttr, setSelectedAttr] = useState<{ tableName: string; colName: string } | null>(null);
  
  const attrPositions = useDbStore((state) => state.attrPositions);
  const setAttrPosition = useDbStore((state) => state.setAttrPosition);
  const resetAttrPosition = useDbStore((state) => state.resetAttrPosition);
  const resetTableAttrPositions = useDbStore((state) => state.resetTableAttrPositions);
  const resetAllAttrPositions = useDbStore((state) => state.resetAllAttrPositions);
  const relNotation = useDbStore((state) => state.relNotation);
  const setRelNotation = useDbStore((state) => state.setRelNotation);

  // Reset view coordinates on mode changes
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    resetZoom();
  }, [mode, resetZoom]);

  // Determine dynamic canvas size based on active diagram data
  let canvasWidth = 800;
  let canvasHeight = 600;
  let hasDiagramData = false;

  if (mode === 'erd' || mode === 'lrs' || mode === 'transformation') {
    if (layout) {
      canvasWidth = layout.width;
      canvasHeight = layout.height;
      hasDiagramData = true;
    }
  } else if (mode === 'usecase') {
    if (usecaseDiagram) {
      canvasWidth = 720;
      canvasHeight = Math.max(400, usecaseDiagram.usecases.length * 90 + 120);
      hasDiagramData = true;
    }
  } else if (mode === 'activity') {
    if (activityDiagram) {
      canvasWidth = activityDiagram.width;
      canvasHeight = activityDiagram.height;
      hasDiagramData = true;
    }
  } else if (mode === 'sequence') {
    if (sequenceDiagram) {
      canvasWidth = 100 + sequenceDiagram.participants.length * 220 + 80;
      canvasHeight = Math.max(300, sequenceDiagram.messages.length * 60 + 180);
      hasDiagramData = true;
    }
  }

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click drag pans
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    setSelectedAttr(null); // Clear active attribute selection on canvas background click
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingAttr) {
      if (!containerRef.current || !layout) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;

      const node = layout.nodes.find((n) => n.table.name === draggingAttr.tableName);
      if (node) {
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const radius = Math.max(50, Math.min(350, Math.sqrt(dx * dx + dy * dy)));
        const angle = Math.atan2(dy, dx);

        setAttrPosition(`${draggingAttr.tableName}-${draggingAttr.colName}`, { angle, radius });
      }
      return;
    }

    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingAttr(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.08;
    const delta = e.deltaY < 0 ? 1 : -1;
    setZoom((prevZoom) => {
      const nextZoom = prevZoom + delta * zoomIntensity * prevZoom;
      return Math.max(0.1, Math.min(3, nextZoom));
    });
  };

  // Zoom control buttons
  const handleZoomIn = () => setZoom((z) => z + 0.1);
  const handleZoomOut = () => setZoom((z) => z - 0.1);
  const handleReset = () => {
    setPan({ x: 0, y: 0 });
    resetZoom();
  };

  const handleFit = () => {
    if (!containerRef.current || !hasDiagramData) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Add extra padding margins
    const padding = 60;
    const scaleX = (containerWidth - padding) / canvasWidth;
    const scaleY = (containerHeight - padding) / canvasHeight;
    const fitScale = Math.max(0.1, Math.min(1.5, Math.min(scaleX, scaleY)));

    setZoom(fitScale);
    setPan({
      x: (containerWidth - canvasWidth * fitScale) / 2,
      y: (containerHeight - canvasHeight * fitScale) / 2,
    });
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-zinc-950 select-none">
      {/* 1. Header Toolbar */}
      <div className="flex h-11 w-full items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-400">
            Preview mode: <span className="text-blue-500 font-semibold">{mode}</span>
          </span>
          {(mode === 'erd' || mode === 'lrs' || mode === 'transformation') && (
            <>
              <button
                onClick={() => setShowTableFilter(!showTableFilter)}
                className={`flex h-7 px-2.5 items-center justify-center gap-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wide transition ${
                  showTableFilter
                    ? 'border-blue-600/30 bg-blue-950/20 text-blue-400'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
                title="Toggle Tables Filter Checklist"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Filter tables ({schema.tables.length - excludedTables.length}/{schema.tables.length})</span>
              </button>

              {/* Relationship Notation Toggle */}
              <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden">
                <button
                  onClick={() => setRelNotation('crowsfoot')}
                  title="Crow's Foot notation"
                  className={`h-7 px-2 text-[10px] font-bold transition ${
                    relNotation === 'crowsfoot'
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                   crow’s foot
                </button>
                <div className="w-px h-4 bg-zinc-700" />
                <button
                  onClick={() => setRelNotation('label')}
                  title="1:N / M:N label notation"
                  className={`h-7 px-2 text-[10px] font-bold transition ${
                    relNotation === 'label'
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  1:N / M:N
                </button>
              </div>

              <button
                onClick={() => {
                  triggerAiLabeling().catch((err) => alert(err.message));
                }}
                disabled={isAiLoading}
                className={`flex h-7 px-2.5 items-center justify-center gap-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wide transition ${
                  isAiLoading
                    ? 'border-blue-600/30 bg-blue-950/20 text-blue-400 cursor-not-allowed'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
                title="Auto-label database relationships using Gemini AI"
              >
                {isAiLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                )}
                <span>{isAiLoading ? 'AI Analyzing...' : 'AI auto-label'}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            onClick={handleZoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          
          <span className="min-w-[48px] text-center text-xs font-mono font-medium text-zinc-400">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Fit and Reload */}
          <button
            onClick={handleFit}
            className="flex h-8 px-2.5 items-center justify-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            title="Fit to Screen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Fit</span>
          </button>

          <button
            onClick={handleReset}
            className="flex h-8 px-2.5 items-center justify-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            title="Reset View"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>100%</span>
          </button>

          <button
            onClick={() => triggerParse(mode)}
            className="flex h-8 px-2.5 items-center justify-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            title="Reload Diagram"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Main Render Canvas Area */}
      <div
        ref={containerRef}
        className={`flex-1 w-full h-full outline-none overflow-hidden relative ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {error && (
          <div className="absolute inset-x-4 top-4 bg-red-950/70 border border-red-900 text-red-200 p-4 rounded-lg z-20 flex flex-col gap-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">Compilation Error</h4>
            <p className="text-xs font-medium leading-relaxed">{error}</p>
          </div>
        )}

        {showTableFilter && (mode === 'erd' || mode === 'lrs' || mode === 'transformation') && (
          <div className="absolute left-6 top-6 bottom-6 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-4 flex flex-col gap-3.5 z-10 select-none max-h-[85%]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Filter className="h-4 w-4 text-blue-500" />
                <h4 className="text-xs font-semibold text-zinc-200">Filter database tables</h4>
              </div>
              {excludedTables.length > 0 && (
                <button
                  onClick={clearExcludedTables}
                  className="text-[10px] font-semibold text-blue-500 hover:text-blue-450 hover:underline"
                >
                  Check all
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[calc(100%-40px)]">
              {schema.tables.map((t) => {
                const isChecked = !excludedTables.includes(t.name.toLowerCase());
                return (
                  <label
                    key={t.name}
                    className={`flex items-center justify-between p-2 rounded border transition cursor-pointer ${
                      isChecked
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:text-zinc-100'
                        : 'bg-zinc-950/20 border-zinc-900/50 text-zinc-500 hover:text-zinc-400'
                    }`}
                  >
                    <span className="text-xs font-mono font-medium truncate max-w-[180px]">{t.name}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTableExclusion(t.name)}
                      className="h-3.5 w-3.5 rounded border-zinc-800 text-blue-600 focus:ring-blue-500 bg-zinc-900"
                    />
                  </label>
                );
              })}
            </div>
            
            <div className="text-[10px] text-zinc-500 mt-auto border-t border-zinc-800 pt-2 flex items-center justify-between">
              <span>Checked: {schema.tables.length - excludedTables.length} / {schema.tables.length}</span>
              <button
                onClick={() => setShowTableFilter(false)}
                className="text-blue-500 hover:underline font-semibold"
              >
                Close panel
              </button>
            </div>
          </div>
        )}

        {selectedAttr && (
          <div
            className="absolute right-6 top-20 w-72 bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-4 flex flex-col gap-3.5 z-10 select-none"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Sliders className="h-4 w-4 text-blue-500" />
                <h4 className="text-xs font-semibold text-zinc-200">Attribute Orbit & Radius</h4>
              </div>
              <button
                onClick={() => setSelectedAttr(null)}
                className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-350 hover:underline"
              >
                Close
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-zinc-500 font-mono">Table</div>
              <div className="text-xs font-semibold text-zinc-200 truncate">{selectedAttr.tableName}</div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-zinc-500 font-mono">Attribute</div>
              <div className="text-xs font-semibold text-blue-450 truncate">{selectedAttr.colName}</div>
            </div>

            {/* Sliders */}
            {(() => {
              const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
              const node = layout?.nodes.find((n) => n.table.name === selectedAttr.tableName);
              if (!node) return null;
              const N = node.table.columns.length;
              const idx = node.table.columns.findIndex((c) => c.name === selectedAttr.colName);
              const defaultAngle = (2 * Math.PI * idx) / N;
              const defaultRadius = 85 + N * 5;

              const pos = attrPositions[key] || { angle: defaultAngle, radius: defaultRadius };

              // Convert angle from radians to degrees [0, 360]
              let deg = Math.round((pos.angle * 180) / Math.PI);
              if (deg < 0) deg += 360;

              const radiusVal = Math.round(pos.radius);

              return (
                <div className="space-y-4 pt-2 border-t border-zinc-800">
                  {/* Orbit Angle Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-medium">
                      <span className="text-zinc-400">Orbit Angle</span>
                      <span className="text-blue-500 font-mono">{deg}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={deg}
                      onChange={(e) => {
                        const newDeg = parseInt(e.target.value, 10);
                        const rad = (newDeg * Math.PI) / 180;
                        setAttrPosition(key, { ...pos, angle: rad });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Radius Distance Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-medium">
                      <span className="text-zinc-400">Orbit Radius</span>
                      <span className="text-blue-500 font-mono">{radiusVal}px</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="350"
                      value={radiusVal}
                      onChange={(e) => {
                        const newRad = parseInt(e.target.value, 10);
                        setAttrPosition(key, { ...pos, radius: newRad });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          resetAttrPosition(key);
                        }}
                        className="flex-1 py-1.5 text-center text-[10px] font-semibold text-zinc-400 bg-zinc-950 border border-zinc-800 rounded hover:bg-zinc-850 hover:text-zinc-200 transition"
                      >
                        Reset Attribute
                      </button>
                      <button
                        onClick={() => {
                          resetTableAttrPositions(
                            selectedAttr.tableName,
                            node.table.columns.map((c) => c.name)
                          );
                        }}
                        className="flex-1 py-1.5 text-center text-[10px] font-semibold text-zinc-400 bg-zinc-950 border border-zinc-800 rounded hover:bg-zinc-850 hover:text-zinc-200 transition"
                      >
                        Reset Table
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Reset all attribute positions in the diagram?')) {
                          resetAllAttrPositions();
                        }
                      }}
                      className="w-full py-1.5 text-center text-[10px] font-semibold text-red-400 bg-red-950/20 border border-red-900/30 rounded hover:bg-red-950/40 hover:text-red-300 transition"
                    >
                      Reset All Attributes
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {hasDiagramData ? (
          <svg
            id="fooldb-svg"
            width={canvasWidth}
            height={canvasHeight}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
            className="absolute shadow-2xl"
          >
            {/* SVG Markers / Arrowdefs */}
            <defs>
              {/* Crow's Foot End Markers */}
              <marker id="one-marker" markerWidth="8" markerHeight="8" refX="0" refY="4" orient="auto" markerUnits="strokeWidth">
                <circle cx="4" cy="4" r="2.5" fill="none" stroke="#6366f1" strokeWidth="1.5" />
              </marker>
              <marker id="many-marker" markerWidth="14" markerHeight="12" refX="14" refY="6" orient="auto" markerUnits="strokeWidth">
                <path d="M 2 2 L 14 6 L 2 10" fill="none" stroke="#6366f1" strokeWidth="1.5" />
              </marker>
              <marker id="one-one-marker" markerWidth="12" markerHeight="12" refX="12" refY="6" orient="auto" markerUnits="strokeWidth">
                <path d="M 5 2 L 5 10 M 9 2 L 9 10" fill="none" stroke="#6366f1" strokeWidth="1.5" />
              </marker>
              
              {/* UML Activity Arrow */}
              <marker id="activity-arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 1.5 L 10 5 L 0 8.5 Z" fill="#6366f1" />
              </marker>
              <marker id="sequence-arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 1.5 L 10 5 L 0 8.5 Z" fill="#6366f1" />
              </marker>
            </defs>

            {/* A. RENDER MODE: CHEN ERD */}
            {mode === 'erd' && layout && (
              <>
                {/* LAYER 1: Relationship lines ONLY — drawn below entities */}
                {layout.edges.map((edge) => {
                  let pathD = '';
                  edge.points.forEach((pt, i) => {
                    pathD += `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y} `;
                  });
                  return (
                    <path
                      key={`line_${edge.id}`}
                      d={pathD}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={1.5}
                    />
                  );
                })}

                {/* LAYER 2: Entity boxes + orbiting attributes */}
                {layout.nodes.map((node) => {
                  const table = node.table;
                  const cx = node.x + node.width / 2;
                  const cy = node.y + node.height / 2;
                  const N = table.columns.length;

                  const attrs = table.columns.map((col, idx) => {
                    const key = `${table.name}-${col.name}`;
                    const defaultAngle = (2 * Math.PI * idx) / N;
                    const defaultRadius = 85 + N * 5;
                    const pos = attrPositions[key] || { angle: defaultAngle, radius: defaultRadius };
                    const w_attr = Math.max(60, col.name.length * 8 + 16);
                    const h_attr = 30;
                    return {
                      col, key, width: w_attr, height: h_attr,
                      angle: pos.angle, radius: pos.radius,
                      x: cx + pos.radius * Math.cos(pos.angle),
                      y: cy + pos.radius * Math.sin(pos.angle)
                    };
                  });

                  resolveCollisions(attrs, cx, cy);

                  const selectedAttrInTable = selectedAttr && selectedAttr.tableName === table.name
                    ? attrs.find(a => a.col.name === selectedAttr.colName)
                    : null;

                  return (
                    <g key={node.id}>
                      {/* Dashboard helper circle for orbit radius if selected */}
                      {selectedAttrInTable && (
                        <circle cx={cx} cy={cy} r={selectedAttrInTable.radius}
                          fill="none" stroke="#2563eb" strokeWidth={1}
                          strokeDasharray="4,4" opacity={0.4} />
                      )}

                      {/* Connection lines from center to orbiting ellipses */}
                      {attrs.map((item) => (
                        <line
                          key={`line_${item.col.name}`}
                          x1={cx} y1={cy} x2={item.x} y2={item.y}
                          stroke={
                            selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name
                              ? '#2563eb' : '#52525b'
                          }
                          strokeWidth={
                            selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name
                              ? 1.5 : 1
                          }
                          strokeDasharray={
                            selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name
                              ? '2,2' : 'none'
                          }
                        />
                      ))}

                      {/* Attributes ellipses */}
                      {attrs.map((item) => {
                        const isSelected =
                          selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name;
                        return (
                          <g
                            key={`attr_g_${item.col.name}`}
                            className="cursor-move group select-none origin-center"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setDraggingAttr({ tableName: table.name, colName: item.col.name });
                              setSelectedAttr({ tableName: table.name, colName: item.col.name });
                            }}
                            onClick={(e) => { e.stopPropagation(); }}
                          >
                            <ellipse
                              cx={item.x} cy={item.y}
                              rx={item.width / 2} ry={item.height / 2}
                              fill={item.col.isPrimaryKey ? '#18181b' : '#09090b'}
                              stroke={isSelected ? '#fbbf24' : item.col.isPrimaryKey ? '#2563eb' : '#52525b'}
                              strokeWidth={isSelected ? 2.5 : 1.5}
                              className="transition duration-150 group-hover:stroke-blue-400"
                            />
                            <text
                              x={item.x} y={item.y + 3.5} textAnchor="middle"
                              fill={item.col.isPrimaryKey ? '#fa5454' : '#a1a1aa'}
                              textDecoration={item.col.isPrimaryKey ? 'underline' : 'none'}
                              className={`text-[10px] ${item.col.isPrimaryKey ? 'italic font-medium' : 'font-normal'}`}
                            >
                              {item.col.name}
                            </text>
                          </g>
                        );
                      })}

                      {/* Table Box */}
                      <g transform={`translate(${cx - 60}, ${cy - 22.5})`} className="cursor-pointer">
                        <rect width={120} height={45} rx={6} fill="#18181b"
                          stroke={table.isJunctionTable ? '#2563eb' : '#52525b'}
                          strokeWidth={table.isJunctionTable ? 2 : 1.5} />
                        <text x={60} y={27.5} textAnchor="middle" fill="#fafafa" className="text-xs font-medium tracking-wide">{table.name}</text>
                        {table.isJunctionTable && (
                          <g transform="translate(35, -16)">
                            <rect width={50} height={12} rx={3} fill="#2563eb" />
                            <text x={25} y={8.5} textAnchor="middle" fill="#ffffff" className="text-[7px] font-medium uppercase tracking-wider">Junction</text>
                          </g>
                        )}
                      </g>
                    </g>
                  );
                })}

                {/* LAYER 3: Relationship overlays — crow's foot / 1:N labels + diamond labels
                    Diamonds stay ON their line; collisions slide them along the path */}
                {(() => {
                  // Helper: compute total polyline length and point at parameter t (0..1)
                  const polylineLength = (pts: {x: number; y: number}[]) => {
                    let total = 0;
                    for (let i = 1; i < pts.length; i++) {
                      const dx = pts[i].x - pts[i - 1].x;
                      const dy = pts[i].y - pts[i - 1].y;
                      total += Math.sqrt(dx * dx + dy * dy);
                    }
                    return total;
                  };

                  const pointAtT = (pts: {x: number; y: number}[], t: number) => {
                    const totalLen = polylineLength(pts);
                    let target = Math.max(0, Math.min(1, t)) * totalLen;
                    for (let i = 1; i < pts.length; i++) {
                      const dx = pts[i].x - pts[i - 1].x;
                      const dy = pts[i].y - pts[i - 1].y;
                      const segLen = Math.sqrt(dx * dx + dy * dy);
                      if (target <= segLen || i === pts.length - 1) {
                        const frac = segLen > 0 ? target / segLen : 0;
                        return { x: pts[i - 1].x + dx * frac, y: pts[i - 1].y + dy * frac };
                      }
                      target -= segLen;
                    }
                    return pts[pts.length - 1];
                  };

                  // 1. Build diamond info with t parameter (start at 0.5 = midpoint)
                  const diamonds = layout.edges.map((edge) => {
                    const rel = edge.relationship;
                    return { edge, rel, t: 0.5, x: 0, y: 0, width: 120, height: 45 };
                  });

                  // Compute initial positions
                  diamonds.forEach(d => {
                    const pt = pointAtT(d.edge.points, d.t);
                    d.x = pt.x; d.y = pt.y;
                  });

                  // 2. Resolve collisions by sliding t along each diamond's own path
                  for (let iter = 0; iter < 30; iter++) {
                    let moved = false;
                    for (let i = 0; i < diamonds.length; i++) {
                      for (let j = i + 1; j < diamonds.length; j++) {
                        const a = diamonds[i];
                        const b = diamonds[j];
                        const dx = Math.abs(a.x - b.x);
                        const dy = Math.abs(a.y - b.y);
                        const minX = (a.width + b.width) / 2 + 4;
                        const minY = (a.height + b.height) / 2 + 4;
                        if (dx < minX && dy < minY) {
                          moved = true;
                          a.t = Math.max(0.15, Math.min(0.85, a.t - 0.04));
                          b.t = Math.max(0.15, Math.min(0.85, b.t + 0.04));
                          const ptA = pointAtT(a.edge.points, a.t);
                          const ptB = pointAtT(b.edge.points, b.t);
                          a.x = ptA.x; a.y = ptA.y;
                          b.x = ptB.x; b.y = ptB.y;
                        }
                      }
                    }
                    if (!moved) break;
                  }

                  // Helper: unit vector
                  const unitVec = (a: {x: number; y: number}, b: {x: number; y: number}) => {
                    const dx = b.x - a.x; const dy = b.y - a.y;
                    const l = Math.sqrt(dx * dx + dy * dy) || 1;
                    return { x: dx / l, y: dy / l };
                  };

                  const INDENT = 38;

                  const renderOneTick = (pt: {x: number; y: number}, toward: {x: number; y: number}) => {
                    const u = unitVec(pt, toward);
                    const px = -u.y; const py = u.x;
                    const bx = pt.x + u.x * INDENT; const by = pt.y + u.y * INDENT;
                    return (
                      <line x1={bx + px * 8} y1={by + py * 8} x2={bx - px * 8} y2={by - py * 8}
                        stroke="#6366f1" strokeWidth={2} strokeLinecap="round" />
                    );
                  };

                  const renderCrowsFoot = (pt: {x: number; y: number}, toward: {x: number; y: number}) => {
                    const u = unitVec(pt, toward);
                    const px = -u.y; const py = u.x;
                    const near = { x: pt.x + u.x * 18, y: pt.y + u.y * 18 };
                    const far = { x: pt.x + u.x * INDENT, y: pt.y + u.y * INDENT };
                    return (
                      <g>
                        <line x1={pt.x + u.x * 8} y1={pt.y + u.y * 8} x2={far.x + px * 9} y2={far.y + py * 9} stroke="#6366f1" strokeWidth={1.5} strokeLinecap="round" />
                        <line x1={pt.x + u.x * 8} y1={pt.y + u.y * 8} x2={far.x} y2={far.y} stroke="#6366f1" strokeWidth={1.5} strokeLinecap="round" />
                        <line x1={pt.x + u.x * 8} y1={pt.y + u.y * 8} x2={far.x - px * 9} y2={far.y - py * 9} stroke="#6366f1" strokeWidth={1.5} strokeLinecap="round" />
                        <line x1={near.x + px * 7} y1={near.y + py * 7} x2={near.x - px * 7} y2={near.y - py * 7} stroke="#6366f1" strokeWidth={2} strokeLinecap="round" />
                      </g>
                    );
                  };

                  const renderLabelPill = (pt: {x: number; y: number}, toward: {x: number; y: number}, text: string) => {
                    const u = unitVec(pt, toward);
                    const px = -u.y; const py = u.x;
                    const lx = pt.x + u.x * (INDENT + 6) + px * 14;
                    const ly = pt.y + u.y * (INDENT + 6) + py * 14;
                    return (
                      <g>
                        <rect x={lx - 7} y={ly - 7} width={14} height={14} rx={4}
                          fill="#09090b" stroke="#6366f1" strokeWidth={1} />
                        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                          fill="#a5b4fc" className="pointer-events-none"
                          style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700 }}
                        >{text}</text>
                      </g>
                    );
                  };

                  // 3. Render
                  return diamonds.map((d) => {
                    const { edge, rel, x: dmX, y: dmY } = d;
                    const label = rel.verb ? rel.verb : getRelationshipLabel(rel.sourceTable, rel.targetTable);
                    const cleanLabel = label.replace(/<div>/g, '\n').replace(/<\/div>/g, '');
                    const lines = cleanLabel.split('\n');
                    const diamondPoints = `${dmX},${dmY - 22.5} ${dmX + 60},${dmY} ${dmX},${dmY + 22.5} ${dmX - 60},${dmY}`;

                    const srcPt = edge.points[0];
                    const srcPt2 = edge.points[1] ?? srcPt;
                    const tgtPt = edge.points[edge.points.length - 1];
                    const tgtPt2 = edge.points[edge.points.length - 2] ?? tgtPt;

                    const tgtLabel = rel.type === 'M:N' ? 'N' : rel.type === '1:N' ? 'N' : '1';

                    return (
                      <g key={`overlay_${edge.id}`}>
                        {/* Crow's foot / label markers */}
                        {relNotation === 'crowsfoot' ? (
                          <>
                            {renderOneTick(srcPt, srcPt2)}
                            {rel.type === '1:1'
                              ? renderOneTick(tgtPt, tgtPt2)
                              : renderCrowsFoot(tgtPt, tgtPt2)}
                          </>
                        ) : (
                          <>
                            {renderLabelPill(srcPt, srcPt2, '1')}
                            {renderLabelPill(tgtPt, tgtPt2, tgtLabel)}
                          </>
                        )}

                        {/* Diamond label — on the line */}
                        <g className="cursor-pointer">
                          <polygon points={diamondPoints} fill="#18181b" stroke="#2563eb" strokeWidth={1.5} />
                          {lines.length > 1 ? (
                            <text x={dmX} y={dmY - 3} textAnchor="middle" fill="#2563eb" className="text-[8px] font-medium pointer-events-none">
                              <tspan x={dmX} dy="0">{lines[0]}</tspan>
                              <tspan x={dmX} dy="8">{lines[1].replace(/^\/\s*/, '/ ')}</tspan>
                            </text>
                          ) : (
                            <text x={dmX} y={dmY + 3} textAnchor="middle" fill="#2563eb" className="text-[9px] font-medium pointer-events-none">{lines[0]}</text>
                          )}
                        </g>
                      </g>
                    );
                  });
                })()}
              </>
            )}

            {/* B. RENDER MODE: LRS SCHEMA */}
            {(mode === 'lrs' || mode === 'transformation') && layout && (
              <>
                {/* 1. Draw Connectors (Orthogonal lines) */}
                {layout.edges.map((edge) => {
                  const rel = edge.relationship;
                  let pathD = '';
                  edge.points.forEach((pt, i) => {
                    pathD += `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y} `;
                  });

                  return (
                    <g key={edge.id}>
                      <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={1.5} markerStart="url(#one-marker)" markerEnd={rel.type === '1:1' ? 'url(#one-one-marker)' : 'url(#many-marker)'} />
                    </g>
                  );
                })}

                {/* 2. Draw Table Rows Blocks */}
                {layout.nodes.map((node) => {
                  const table = node.table;
                  const cx = node.x + node.width / 2;
                  const cy = node.y + node.height / 2;
                  const tWidth = 240;
                  const tHeight = 42 + table.columns.length * 26 + 8;
                  const tx = cx - 120;
                  const ty = cy - tHeight / 2;

                  return (
                    <g key={node.id}>
                      {/* Outer Card */}
                      <rect x={tx} y={ty} width={tWidth} height={tHeight} rx={8} fill="#18181b" stroke="#52525b" strokeWidth={1.5} />
                      {/* Header */}
                      <path d={`M ${tx} ${ty+8} A 8 8 0 0 1 ${tx+8} ${ty} L ${tx+tWidth-8} ${ty} A 8 8 0 0 1 ${tx+tWidth} ${ty+8} L ${tx+tWidth} ${ty+42} L ${tx} ${ty+42} Z`} fill="#09090b" />
                      <text x={cx} y={ty + 26} textAnchor="middle" fill="#fafafa" className="text-xs font-semibold font-mono tracking-tight">{table.name}</text>
                      
                      {/* Column Rows */}
                      {table.columns.map((col, idx) => {
                        const ry = ty + 42 + idx * 26;
                        const isFk = table.foreignKeys.some(fk => 
                          fk.columns.map(c => c.toLowerCase()).includes(col.name.toLowerCase())
                        );

                        return (
                          <g key={col.name}>
                            <rect x={tx} y={ry} width={tWidth} height={26} fill={idx % 2 === 0 ? 'rgba(39,39,42,0.15)' : 'transparent'} />
                            <text x={tx + 12} y={ry + 17} fill={col.isPrimaryKey ? '#fafafa' : '#a1a1aa'} className={`text-xs ${col.isPrimaryKey ? 'italic font-medium font-mono' : 'font-mono font-normal'}`}>
                              {col.name} <tspan fill="#52525b" className="text-[9px]">({col.type})</tspan>
                            </text>
                            
                            {/* Badges indicators */}
                            <g transform={`translate(${tx + tWidth - 55}, ${ry + 6.5})`}>
                              {col.isPrimaryKey && (
                                <g transform="translate(0,0)">
                                  <rect width={16} height={12} rx={2} fill="#2563eb" />
                                  <text x={8} y={9} textAnchor="middle" fill="#ffffff" className="text-[7px] font-medium">PK</text>
                                </g>
                              )}
                              {isFk && (
                                <g transform={`translate(${col.isPrimaryKey ? 18 : 0},0)`}>
                                  <rect width={16} height={12} rx={2} fill="#27272a" stroke="#3f3f46" strokeWidth={0.5} />
                                  <text x={8} y={9} textAnchor="middle" fill="#a1a1aa" className="text-[7px] font-medium">FK</text>
                                </g>
                              )}
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </>
            )}

            {/* C. RENDER MODE: USE CASE DIAGRAM */}
            {mode === 'usecase' && usecaseDiagram && (
              <>
                {/* 1. Draw System Boundaries */}
                {usecaseDiagram.systems.length > 0 ? (
                  usecaseDiagram.systems.map((sys, sIdx) => {
                    const sy = systemYBoundary(sIdx, usecaseDiagram.usecases.length);
                    return (
                      <g key={sIdx}>
                        <rect x={260} y={sy} width={340} height={Math.max(320, usecaseDiagram.usecases.length * 90 + 80)} rx={8} fill="none" stroke="#52525b" strokeWidth={2} strokeDasharray="5,5" />
                        <text x={260 + 170} y={sy + 25} textAnchor="middle" fill="#a1a1aa" className="text-xs font-medium">{sys.name}</text>
                      </g>
                    );
                  })
                ) : (
                  <g>
                    <rect x={260} y={60} width={340} height={Math.max(320, usecaseDiagram.usecases.length * 90 + 80)} rx={8} fill="none" stroke="#52525b" strokeWidth={2} strokeDasharray="5,5" />
                    <text x={260 + 170} y={60 + 25} textAnchor="middle" fill="#a1a1aa" className="text-xs font-medium">System boundary</text>
                  </g>
                )}

                {/* 2. Draw Connections */}
                {usecaseDiagram.connections.map((conn) => {
                  let sx = 0, sy = 0, tx = 0, ty = 0;
                  
                  const actIdx = usecaseDiagram.actors.findIndex(a => a.id === conn.from);
                  if (actIdx !== -1) {
                    sx = 80 + 15;
                    sy = 60 + 40 + actIdx * Math.max(120, Math.max(320, usecaseDiagram.usecases.length * 90 + 80) / (usecaseDiagram.actors.length || 1)) + 30;
                  } else {
                    const ucIdx = usecaseDiagram.usecases.findIndex(u => u.id === conn.from);
                    if (ucIdx !== -1) {
                      sx = 260 + (340 - 160) / 2 + 80;
                      sy = 60 + 50 + ucIdx * 85 + 30;
                    }
                  }

                  const ucIdx = usecaseDiagram.usecases.findIndex(u => u.id === conn.to);
                  if (ucIdx !== -1) {
                    tx = 260 + (340 - 160) / 2 + 80;
                    ty = 60 + 50 + ucIdx * 85 + 30;
                  } else {
                    const actIdx = usecaseDiagram.actors.findIndex(a => a.id === conn.to);
                    if (actIdx !== -1) {
                      tx = 80 + 15;
                      ty = 60 + 40 + actIdx * Math.max(120, Math.max(320, usecaseDiagram.usecases.length * 90 + 80) / (usecaseDiagram.actors.length || 1)) + 30;
                    }
                  }

                  return (
                    <line key={conn.id} x1={sx} y1={sy} x2={tx} y2={ty} stroke="#52525b" strokeWidth={1.5} />
                  );
                })}

                {/* 3. Draw Actors */}
                {usecaseDiagram.actors.map((act, idx) => {
                  const spacing = Math.max(120, Math.max(320, usecaseDiagram.usecases.length * 90 + 80) / (usecaseDiagram.actors.length || 1));
                  const ay = 60 + 40 + idx * spacing;
                  
                  return (
                    <g key={act.id}>
                      <circle cx={80 + 15} cy={ay + 10} r={10} fill="#18181b" stroke="#2563eb" strokeWidth={2} />
                      <line x1={80 + 15} y1={ay + 20} x2={80 + 15} y2={ay + 45} stroke="#2563eb" strokeWidth={2} />
                      <line x1={80} y1={ay + 28} x2={80 + 30} y2={ay + 28} stroke="#2563eb" strokeWidth={2} />
                      <line x1={80 + 15} y1={ay + 45} x2={80 + 5} y2={ay + 60} stroke="#2563eb" strokeWidth={2} />
                      <line x1={80 + 15} y1={ay + 45} x2={80 + 25} y2={ay + 60} stroke="#2563eb" strokeWidth={2} />
                      <text x={80 + 15} y={ay + 75} textAnchor="middle" fill="#fafafa" className="text-[10px] font-medium select-none">{act.name}</text>
                    </g>
                  );
                })}

                {/* 4. Draw Use Cases */}
                {usecaseDiagram.usecases.map((uc, idx) => {
                  let sysIdx = 0;
                  let sy = 60;
                  const systemHeight = Math.max(320, usecaseDiagram.usecases.length * 90 + 80);
                  for (let sIdx = 0; sIdx < usecaseDiagram.systems.length; sIdx++) {
                    if (usecaseDiagram.systems[sIdx].usecaseIds.includes(uc.id)) {
                      sysIdx = sIdx;
                      sy = 60 + sysIdx * (systemHeight + 50);
                      break;
                    }
                  }
                  const localIdx = usecaseDiagram.systems.length > 0 
                    ? usecaseDiagram.systems[sysIdx].usecaseIds.indexOf(uc.id)
                    : idx;

                  const ux = 260 + (340 - 160) / 2;
                  const uy = sy + 50 + (localIdx >= 0 ? localIdx : 0) * 85;

                  return (
                    <g key={uc.id}>
                      <ellipse cx={ux + 80} cy={uy + 30} rx={80} ry={30} fill="#18181b" stroke="#52525b" strokeWidth={1.5} />
                      <text x={ux + 80} y={uy + 33.5} textAnchor="middle" fill="#fafafa" className="text-[11px] font-medium select-none">{uc.name}</text>
                    </g>
                  );
                })}
              </>
            )}

            {/* D. RENDER MODE: ACTIVITY DIAGRAM */}
            {mode === 'activity' && activityDiagram && (
              <>
                {/* 1. Draw flow lines */}
                {activityDiagram.edges.map((edge) => {
                  let pathD = '';
                  edge.points.forEach((pt, idx) => {
                    pathD += `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y} `;
                  });

                  let labelX = 0, labelY = 0;
                  if (edge.points.length >= 2) {
                    const midIdx = Math.floor(edge.points.length / 2);
                    labelX = edge.points[midIdx].x;
                    labelY = edge.points[midIdx].y - 8;
                  }

                  return (
                    <g key={edge.id}>
                      <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={1.5} markerEnd="url(#activity-arrow)" />
                      {edge.label && (
                        <text x={labelX} y={labelY} textAnchor="middle" fill="#2563eb" className="text-[9px] font-medium">{edge.label}</text>
                      )}
                    </g>
                  );
                })}

                {/* 2. Draw nodes */}
                {activityDiagram.nodes.map((node) => {
                  if (node.type === 'start') {
                    return (
                      <circle key={node.id} cx={node.x + 15} cy={node.y + 15} r={15} fill="#16a34a" stroke="#15803d" strokeWidth={2} />
                    );
                  }
                  if (node.type === 'end') {
                    return (
                      <g key={node.id}>
                        <circle cx={node.x + 15} cy={node.y + 15} r={15} fill="none" stroke="#dc2626" strokeWidth={2} />
                        <circle cx={node.x + 15} cy={node.y + 15} r={8} fill="#dc2626" />
                      </g>
                    );
                  }
                  if (node.type === 'decision') {
                    const cx = node.x + 40;
                    const cy = node.y + 40;
                    const pts = `${cx},${cy-40} ${cx+40},${cy} ${cx},${cy+40} ${cx-40},${cy}`;
                    return (
                      <g key={node.id}>
                        <polygon points={pts} fill="#09090b" stroke="#2563eb" strokeWidth={1.5} />
                        <text x={cx} y={cy + 3.5} textAnchor="middle" fill="#fafafa" className="text-[10px] font-medium select-none">{node.label}</text>
                      </g>
                    );
                  }

                  return (
                    <g key={node.id}>
                      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={6} fill="#18181b" stroke="#52525b" strokeWidth={1.5} />
                      <text x={node.x + node.width / 2} y={node.y + node.height / 2 + 4} textAnchor="middle" fill="#fafafa" className="text-[11px] font-medium select-none">{node.label}</text>
                    </g>
                  );
                })}
              </>
            )}

            {/* E. RENDER MODE: SEQUENCE DIAGRAM */}
            {mode === 'sequence' && sequenceDiagram && (
              <>
                {/* 1. Draw lifelines */}
                {sequenceDiagram.participants.map((part, idx) => {
                  const px = 100 + idx * 220;
                  const cx = px + 50;
                  const sy = 60;
                  const lifelineHeight = Math.max(300, sequenceDiagram.messages.length * 60 + 100);

                  return (
                    <g key={part.id}>
                      <line x1={cx} y1={sy + 40} x2={cx} y2={sy + lifelineHeight} stroke="#52525b" strokeWidth={1.5} strokeDasharray="6,6" />
                      <rect x={px} y={sy} width={100} height={40} rx={6} fill="#18181b" stroke="#52525b" strokeWidth={1.5} />
                      <text x={cx} y={sy + 24} textAnchor="middle" fill="#fafafa" className="text-xs font-medium font-mono select-none">{part.name}</text>
                    </g>
                  );
                })}

                {/* 2. Draw messages arrows */}
                {sequenceDiagram.messages.map((msg, idx) => {
                  const fromIdx = sequenceDiagram.participants.findIndex(p => p.id === msg.from);
                  const toIdx = sequenceDiagram.participants.findIndex(p => p.id === msg.to);

                  if (fromIdx !== -1 && toIdx !== -1) {
                    const fromCenterX = 100 + fromIdx * 220 + 50;
                    const toCenterX = 100 + toIdx * 220 + 50;
                    const messageY = 60 + 80 + idx * 60;

                    return (
                      <g key={msg.id}>
                        <line x1={fromCenterX} y1={messageY} x2={toCenterX} y2={messageY} stroke="#2563eb" strokeWidth={1.5} markerEnd="url(#sequence-arrow)" />
                        <text x={(fromCenterX + toCenterX) / 2} y={messageY - 6} textAnchor="middle" fill="#a1a1aa" className="text-[10px] font-medium select-none">{msg.label}</text>
                      </g>
                    );
                  }
                  return null;
                })}
              </>
            )}
          </svg>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-450">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-zinc-550" />
              <p className="text-sm font-medium">Generating diagram preview...</p>
            </div>
          </div>
        )}

        {/* Floating Zoom Canvas Control widget */}
        {hasDiagramData && (
          <div className="absolute bottom-6 right-6 bg-zinc-900 border border-zinc-800 shadow-md rounded-lg p-1.5 flex items-center gap-1.5 z-10 transition duration-150 select-none">
            <button
              onClick={handleZoomOut}
              className="flex h-7 w-7 items-center justify-center rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition hover:bg-zinc-800"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            
            <span className="min-w-[40px] text-center text-[10px] font-mono font-medium text-zinc-400">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              className="flex h-7 w-7 items-center justify-center rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition hover:bg-zinc-800"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>

            <div className="h-4 w-px bg-zinc-800 mx-0.5" />

            <button
              onClick={handleFit}
              className="flex h-7 px-2 items-center justify-center gap-1 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition hover:bg-zinc-850"
              title="Fit to Screen"
            >
              <Maximize2 className="h-3 w-3" />
              <span>Fit</span>
            </button>

            <button
              onClick={handleReset}
              className="flex h-7 px-2 items-center justify-center gap-1 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition hover:bg-zinc-850"
              title="Reset View"
            >
              <RotateCcw className="h-3 w-3" />
              <span>100%</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper boundary position calculator for multiple systems
function systemYBoundary(sysIdx: number, usecasesCount: number): number {
  const systemHeight = Math.max(320, usecasesCount * 90 + 80);
  return 60 + sysIdx * (systemHeight + 50);
}

interface AttrPosition {
  col: Column;
  key: string;
  width: number;
  height: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
}

function resolveCollisions(attrs: AttrPosition[], cx: number, cy: number) {
  const maxIterations = 25;
  let changed = true;

  for (let iter = 0; iter < maxIterations && changed; iter++) {
    changed = false;
    for (let i = 0; i < attrs.length; i++) {
      for (let j = i + 1; j < attrs.length; j++) {
        const a = attrs[i];
        const b = attrs[j];

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const minXDist = (a.width + b.width) / 2 + 8;
        const minYDist = (a.height + b.height) / 2 + 8;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < minXDist && absDy < minYDist) {
          changed = true;
          const overlapX = minXDist - absDx;
          const overlapY = minYDist - absDy;

          let pushX = 0;
          let pushY = 0;

          if (overlapX < overlapY) {
            pushX = overlapX * (dx >= 0 ? 0.52 : -0.52);
          } else {
            pushY = overlapY * (dy >= 0 ? 0.52 : -0.52);
          }

          a.x += pushX;
          a.y += pushY;
          b.x -= pushX;
          b.y -= pushY;

          const dxA = a.x - cx;
          const dyA = a.y - cy;
          a.radius = Math.max(50, Math.min(350, Math.sqrt(dxA * dxA + dyA * dyA)));
          a.angle = Math.atan2(dyA, dxA);

          const dxB = b.x - cx;
          const dyB = b.y - cy;
          b.radius = Math.max(50, Math.min(350, Math.sqrt(dxB * dxB + dyB * dyB)));
          b.angle = Math.atan2(dyB, dxB);
        }
      }
    }
  }
}
