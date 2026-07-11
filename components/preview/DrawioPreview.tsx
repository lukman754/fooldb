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

  // Determine dynamic canvas size based on active diagram data
  let canvasWidth = 800;
  let canvasHeight = 600;
  let hasDiagramData = false;

  if (mode === 'erd' || mode === 'lrs' || mode === 'transformation' || mode === 'visual') {
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

  // Auto-fit view coordinates and scale to container bounds when the active layout/mode changes
  useEffect(() => {
    if (!containerRef.current || !hasDiagramData) return;
    
    const diagWidth = canvasWidth;
    const diagHeight = canvasHeight;

    const containerWidth = containerRef.current.clientWidth || 800;
    const containerHeight = containerRef.current.clientHeight || 600;

    const margin = 45;
    const targetWidth = containerWidth - margin * 2;
    const targetHeight = containerHeight - margin * 2;

    const scaleX = targetWidth / diagWidth;
    const scaleY = targetHeight / diagHeight;
    let newZoom = Math.min(scaleX, scaleY);
    
    // Clamp zoom to prevent microscopic sizes or massive scaling
    newZoom = Math.max(0.15, Math.min(1.5, newZoom));

    // Centered alignment within container
    const xOffset = (containerWidth - diagWidth * newZoom) / 2;
    const yOffset = (containerHeight - diagHeight * newZoom) / 2;

    setPan({ x: xOffset, y: yOffset });
    setZoom(newZoom);
  }, [layout, usecaseDiagram, activityDiagram, sequenceDiagram, mode, hasDiagramData, canvasWidth, canvasHeight, setZoom]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // Prevent browser default scrolling or page-level pinch-to-zoom
      e.preventDefault();

      const zoomIntensity = 0.08;
      const delta = e.deltaY < 0 ? 1 : -1;
      setZoom((prevZoom) => {
        const nextZoom = prevZoom + delta * zoomIntensity * prevZoom;
        return Math.max(0.1, Math.min(3, nextZoom));
      });
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [setZoom]);

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

            {/* A. RENDER MODE: CHEN ERD + VISUAL BUILDER */}
            {(mode === 'erd' || mode === 'visual') && layout && (() => {
              // Helper to get intersection point on box border (120x45 rect)
              const getBorderPoint = (center: {x: number; y: number}, toward: {x: number; y: number}, w = 120, h = 45) => {
                const dx = toward.x - center.x;
                const dy = toward.y - center.y;
                if (dx === 0 && dy === 0) return center;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                const hw = w / 2;
                const hh = h / 2;
                const scaleX = dx !== 0 ? hw / absDx : Infinity;
                const scaleY = dy !== 0 ? hh / absDy : Infinity;
                const scale = Math.min(scaleX, scaleY);
                return {
                  x: center.x + dx * scale,
                  y: center.y + dy * scale
                };
              };

              // ──── Pre-compute diamond positions for ALL edges ────
              const polyLen = (pts: {x:number;y:number}[]) => {
                let t = 0;
                for (let i = 1; i < pts.length; i++) {
                  const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
                  t += Math.sqrt(dx*dx + dy*dy);
                }
                return t;
              };
              const ptAtT = (pts: {x:number;y:number}[], t: number) => {
                const total = polyLen(pts);
                let rem = Math.max(0, Math.min(1, t)) * total;
                for (let i = 1; i < pts.length; i++) {
                  const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
                  const seg = Math.sqrt(dx*dx + dy*dy);
                  if (rem <= seg || i === pts.length - 1) {
                    const f = seg > 0 ? rem / seg : 0;
                    return { x: pts[i-1].x + dx*f, y: pts[i-1].y + dy*f };
                  }
                  rem -= seg;
                }
                return pts[pts.length - 1];
              };

              const diamonds = layout.edges.map(edge => ({
                edge, rel: edge.relationship, t: 0.5, x: 0, y: 0, w: 120, h: 45
              }));
              diamonds.forEach(d => { const p = ptAtT(d.edge.points, d.t); d.x = p.x; d.y = p.y; });

              // Resolve diamond collisions by sliding along path
              for (let iter = 0; iter < 30; iter++) {
                let moved = false;
                for (let i = 0; i < diamonds.length; i++) {
                  for (let j = i + 1; j < diamonds.length; j++) {
                    const a = diamonds[i], b = diamonds[j];
                    if (Math.abs(a.x - b.x) < (a.w + b.w)/2 + 4 && Math.abs(a.y - b.y) < (a.h + b.h)/2 + 4) {
                      moved = true;
                      a.t = Math.max(0.15, Math.min(0.85, a.t - 0.04));
                      b.t = Math.max(0.15, Math.min(0.85, b.t + 0.04));
                      const pa = ptAtT(a.edge.points, a.t), pb = ptAtT(b.edge.points, b.t);
                      a.x = pa.x; a.y = pa.y; b.x = pb.x; b.y = pb.y;
                    }
                  }
                }
                if (!moved) break;
              }

              // Build a lookup: edgeId → diamond {x, y}
              const diamondMap = new Map<string, {x: number; y: number}>();
              diamonds.forEach(d => diamondMap.set(d.edge.id, { x: d.x, y: d.y }));

              // Helper: unit vector
              const uv = (a: {x:number;y:number}, b: {x:number;y:number}) => {
                const dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx*dx+dy*dy) || 1;
                return { x: dx/l, y: dy/l };
              };

              // Helper to split orthogonal points at the diamond position t
              const getSplitPaths = (pts: {x:number; y:number}[], t: number, dm: {x: number; y: number}) => {
                const total = polyLen(pts);
                const target = t * total;

                let current = 0;
                const path1: {x:number; y:number}[] = [];
                const path2: {x:number; y:number}[] = [];

                path1.push(pts[0]);
                let dmPlaced = false;

                for (let i = 1; i < pts.length; i++) {
                  const p1 = pts[i-1];
                  const p2 = pts[i];
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const seg = Math.sqrt(dx*dx + dy*dy);

                  if (!dmPlaced) {
                    if (current + seg < target) {
                      path1.push(p2);
                    } else {
                      path1.push(dm);
                      path2.push(dm);
                      path2.push(p2);
                      dmPlaced = true;
                    }
                  } else {
                    path2.push(p2);
                  }
                  current += seg;
                }

                if (!dmPlaced) {
                  path1.push(dm);
                  path2.push(dm);
                  path2.push(pts[pts.length - 1]);
                }

                const d1 = path1.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                const d2 = path2.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                return { d1, d2 };
              };

              return (
                <>
                  {/* LAYER 1: Lines split at diamond — Entity -> Diamond -> Entity */}
                  {layout.edges.map(edge => {
                    const dm = diamondMap.get(edge.id)!;
                    const { d1, d2 } = getSplitPaths(edge.points, 0.5, dm);

                    return (
                      <g key={`lines_${edge.id}`}>
                        <path d={d1} fill="none" stroke="#2563eb" strokeWidth={1.5} />
                        <path d={d2} fill="none" stroke="#2563eb" strokeWidth={1.5} />
                      </g>
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
                      ? attrs.find(a => a.col.name === selectedAttr.colName) : null;

                    return (
                      <g key={node.id}>
                        {selectedAttrInTable && (
                          <circle cx={cx} cy={cy} r={selectedAttrInTable.radius}
                            fill="none" stroke="#2563eb" strokeWidth={1}
                            strokeDasharray="4,4" opacity={0.4} />
                        )}

                        {attrs.map((item) => (
                          <line key={`line_${item.col.name}`}
                            x1={cx} y1={cy} x2={item.x} y2={item.y}
                            stroke={selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name ? '#2563eb' : '#52525b'}
                            strokeWidth={selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name ? 1.5 : 1}
                            strokeDasharray={selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name ? '2,2' : 'none'}
                          />
                        ))}

                        {attrs.map((item) => {
                          const isSelected = selectedAttr && selectedAttr.tableName === table.name && selectedAttr.colName === item.col.name;
                          return (
                            <g key={`attr_g_${item.col.name}`}
                              className="cursor-move group select-none origin-center"
                              onMouseDown={(e) => { e.stopPropagation(); setDraggingAttr({ tableName: table.name, colName: item.col.name }); setSelectedAttr({ tableName: table.name, colName: item.col.name }); }}
                              onClick={(e) => { e.stopPropagation(); }}
                            >
                              <ellipse cx={item.x} cy={item.y} rx={item.width / 2} ry={item.height / 2}
                                fill={item.col.isPrimaryKey ? '#18181b' : '#09090b'}
                                stroke={isSelected ? '#fbbf24' : item.col.isPrimaryKey ? '#2563eb' : '#52525b'}
                                strokeWidth={isSelected ? 2.5 : 1.5}
                                className="transition duration-150 group-hover:stroke-blue-400" />
                              <text x={item.x} y={item.y + 3.5} textAnchor="middle"
                                fill={item.col.isPrimaryKey ? '#fa5454' : '#a1a1aa'}
                                textDecoration={item.col.isPrimaryKey ? 'underline' : 'none'}
                                className={`text-[10px] ${item.col.isPrimaryKey ? 'italic font-medium' : 'font-normal'}`}
                              >{item.col.name}</text>
                            </g>
                          );
                        })}

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

                  {/* LAYER 3: Diamonds + crow's foot / labels — on top */}
                  {diamonds.map((d) => {
                    const { edge, rel, x: dmX, y: dmY } = d;
                    const label = rel.verb ? rel.verb : getRelationshipLabel(rel.sourceTable, rel.targetTable);
                    const cleanLabel = label.replace(/<div>/g, '\n').replace(/<\/div>/g, '');
                    const lines = cleanLabel.split('\n');
                    const diamondPts = `${dmX},${dmY - 22.5} ${dmX + 60},${dmY} ${dmX},${dmY + 22.5} ${dmX - 60},${dmY}`;

                    const srcPt = edge.points[0];
                    const srcPt2 = edge.points[1] ?? srcPt;
                    const tgtPt = edge.points[edge.points.length - 1];
                    const tgtPt2 = edge.points[edge.points.length - 2] ?? tgtPt;
                    const tgtLabel = rel.type === 'M:N' ? 'N' : rel.type === '1:N' ? 'N' : '1';

                    const sn = layout.nodes.find(n => n.id === rel.sourceTable);
                    const tn = layout.nodes.find(n => n.id === rel.targetTable);
                    const srcCenter = sn ? { x: sn.x + sn.width / 2, y: sn.y + sn.height / 2 } : srcPt;
                    const tgtCenter = tn ? { x: tn.x + tn.width / 2, y: tn.y + tn.height / 2 } : tgtPt;

                    const srcBorder = getBorderPoint(srcCenter, srcPt2, 120, 45);
                    const tgtBorder = getBorderPoint(tgtCenter, tgtPt2, 120, 45);

                    const uSrc = uv(srcCenter, srcPt2);
                    const uTgt = uv(tgtCenter, tgtPt2);

                    return (
                      <g key={`overlay_${edge.id}`}>
                        {relNotation === 'crowsfoot' ? (
                          <>
                            {/* Source side tick (Mandatory 1): single tick at 10px */}
                            {(() => {
                              const u = uSrc, px = -u.y, py = u.x;
                              const bx = srcBorder.x + u.x * 10, by = srcBorder.y + u.y * 10;
                              return <line x1={bx+px*5} y1={by+py*5} x2={bx-px*5} y2={by-py*5} stroke="#6366f1" strokeWidth={2} strokeLinecap="round" />;
                            })()}

                            {/* Target side marker: single tick for 1:1, crow's foot for many */}
                            {rel.type === '1:1' ? (() => {
                              const u = uTgt, px = -u.y, py = u.x;
                              const bx = tgtBorder.x + u.x * 10, by = tgtBorder.y + u.y * 10;
                              return <line x1={bx+px*5} y1={by+py*5} x2={bx-px*5} y2={by-py*5} stroke="#6366f1" strokeWidth={2} strokeLinecap="round" />;
                            })() : (() => {
                              const u = uTgt, px = -u.y, py = u.x;
                              const far = { x: tgtBorder.x + u.x * 12, y: tgtBorder.y + u.y * 12 };
                              return (
                                <g>
                                  <line x1={tgtBorder.x + px * 5} y1={tgtBorder.y + py * 5} x2={far.x} y2={far.y} stroke="#6366f1" strokeWidth={1.5} strokeLinecap="round" />
                                  <line x1={tgtBorder.x} y1={tgtBorder.y} x2={far.x} y2={far.y} stroke="#6366f1" strokeWidth={1.5} strokeLinecap="round" />
                                  <line x1={tgtBorder.x - px * 5} y1={tgtBorder.y - py * 5} x2={far.x} y2={far.y} stroke="#6366f1" strokeWidth={1.5} strokeLinecap="round" />
                                </g>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            {/* Text labels: positioned 36px back along the line */}
                            {(() => {
                              const u = uSrc, px = -u.y, py = u.x;
                              const lx = srcBorder.x + u.x*36 + px*14, ly = srcBorder.y + u.y*36 + py*14;
                              return (<g><rect x={lx-7} y={ly-7} width={14} height={14} rx={4} fill="#09090b" stroke="#6366f1" strokeWidth={1} />
                                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="#a5b4fc" className="pointer-events-none" style={{fontFamily:'monospace',fontSize:'10px',fontWeight:700}}>1</text></g>);
                            })()}
                            {(() => {
                              const u = uTgt, px = -u.y, py = u.x;
                              const lx = tgtBorder.x + u.x*36 + px*14, ly = tgtBorder.y + u.y*36 + py*14;
                              return (<g><rect x={lx-7} y={ly-7} width={14} height={14} rx={4} fill="#09090b" stroke="#6366f1" strokeWidth={1} />
                                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="#a5b4fc" className="pointer-events-none" style={{fontFamily:'monospace',fontSize:'10px',fontWeight:700}}>{tgtLabel}</text></g>);
                            })()}
                          </>
                        )}

                        {/* Diamond — connected to lines */}
                        <g className="cursor-pointer">
                          <polygon points={diamondPts} fill="#18181b" stroke="#2563eb" strokeWidth={1.5} />
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
                  })}
                </>
              );
            })()}
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
