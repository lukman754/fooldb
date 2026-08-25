"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDbStore } from "@/store/dbStore";
import { getRelationshipLabel } from "@/lib/xml/drawioGenerator";
import { formatLrsColumn } from "@/lib/xml/lrsGenerator";
import { Column } from "@/types";
import {
  ChevronDown,
  RefreshCw,
  Filter,
  Sparkles,
  Sliders,
  Database,
  Trash2,
  X,
  Undo2,
  Redo2,
} from "lucide-react";

function hueToHex(hue: number, s = 70, l = 50): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const polyLen = (pts: { x: number; y: number }[]) => {
  let t = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x,
      dy = pts[i].y - pts[i - 1].y;
    t += Math.sqrt(dx * dx + dy * dy);
  }
  return t;
};

const ptAtT = (pts: { x: number; y: number }[], t: number) => {
  const total = polyLen(pts);
  let rem = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x,
      dy = pts[i].y - pts[i - 1].y;
    const seg = Math.sqrt(dx * dx + dy * dy);
    if (rem <= seg || i === pts.length - 1) {
      const f = seg > 0 ? rem / seg : 0;
      return {
        x: pts[i - 1].x + dx * f,
        y: pts[i - 1].y + dy * f,
      };
    }
    rem -= seg;
  }
  return pts[pts.length - 1];
};

const splitPointsAtDiamond = (
  pts: { x: number; y: number }[],
  t: number,
  dm: { x: number; y: number },
) => {
  const total = polyLen(pts);
  const target = t * total;

  let current = 0;
  const path1: { x: number; y: number }[] = [];
  const path2: { x: number; y: number }[] = [];

  path1.push(pts[0]);
  let dmPlaced = false;

  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const seg = Math.sqrt(dx * dx + dy * dy);

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

  return { path1, path2 };
};

const orthogonalisePath = (path: { x: number; y: number }[]) => {
  if (path.length === 0) return [];

  const result: { x: number; y: number }[] = [];
  result.push({ ...path[0] });

  for (let i = 0; i < path.length - 1; i++) {
    const A = path[i];
    const B = path[i + 1];
    if (!A || !B) continue;

    const dx = Math.abs(B.x - A.x);
    const dy = Math.abs(B.y - A.y);

    if (dx < 1.5) {
      // Purely vertical segment
      result.push({ x: A.x, y: B.y });
    } else if (dy < 1.5) {
      // Purely horizontal segment
      result.push({ x: B.x, y: A.y });
    } else {
      // Slanted segment: insert an elbow to make it orthogonal
      let goHorizontalFirst = true;

      if (result.length >= 2) {
        const prev = result[result.length - 2];
        const last = result[result.length - 1];
        if (prev && last) {
          const wasLastSegmentH = Math.abs(last.y - prev.y) < 1.5;
          // Alternate orientation: if previous segment was Horizontal, do Vertical first
          goHorizontalFirst = !wasLastSegmentH;
        }
      } else {
        // First segment: prefer horizontal-first if wider, else vertical-first
        goHorizontalFirst = dx >= dy;
      }

      if (goHorizontalFirst) {
        result.push({ x: B.x, y: A.y });
      } else {
        result.push({ x: A.x, y: B.y });
      }
      result.push({ ...B });
    }
  }

  return result;
};

// Helper: make an orthogonal L-shape path from A to B
// Prefers horizontal-first if wider, else vertical-first
const makeOrthoPath = (
  A: { x: number; y: number },
  B: { x: number; y: number },
) => {
  const dx = Math.abs(B.x - A.x);
  const dy = Math.abs(B.y - A.y);
  if (dx < 1) return [A, B]; // already vertical
  if (dy < 1) return [A, B]; // already horizontal
  // Go horizontal first (elbow at B.x, A.y)
  return [A, { x: B.x, y: A.y }, B];
};

function getRoundedPathD(pts: { x: number; y: number }[], radius = 12): string {
  if (pts.length <= 1) return "";
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const r = Math.min(radius, len1 / 2, len2 / 2);

    if (r <= 0) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const startX = curr.x + (dx1 / len1) * r;
    const startY = curr.y + (dy1 / len1) * r;

    const endX = curr.x + (dx2 / len2) * r;
    const endY = curr.y + (dy2 / len2) * r;

    d += ` L ${startX} ${startY} Q ${curr.x} ${curr.y} ${endX} ${endY}`;
  }

  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function getTableColors(tableName: string) {
  let hash = 0;
  for (let i = 0; i < tableName.length; i++) {
    hash = tableName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    stroke: hueToHex(hue, 70, 50),
    fill: hueToHex(hue, 80, 93),
    text: hueToHex(hue, 80, 20),
    border: hueToHex(hue, 70, 40),
  };
}

export default function DrawioPreview() {
  const mode = useDbStore((state) => state.mode);

  // Diagram states
  const layout = useDbStore((state) => state.layout); // used for ERD & LRS
  const usecaseDiagram = useDbStore((state) => state.usecaseDiagram);
  const selectedUsecaseId = useDbStore((state) => state.selectedUsecaseId);

  const schema = useDbStore((state) => state.schema);
  const excludedTables = useDbStore((state) => state.excludedTables);
  const toggleTableExclusion = useDbStore(
    (state) => state.toggleTableExclusion,
  );
  const clearExcludedTables = useDbStore((state) => state.clearExcludedTables);
  const [showTableFilter, setShowTableFilter] = useState(false);

  const error = useDbStore((state) => state.error);
  const isAiLoading = useDbStore((state) => state.isAiLoading);
  const triggerAiLabeling = useDbStore((state) => state.triggerAiLabeling);
  const updateRelationshipVerb = useDbStore(
    (state) => state.updateRelationshipVerb,
  );
  const updateNodePosition = useDbStore((state) => state.updateNodePosition);
  const updateVisualRelationCardinality = useDbStore(
    (state) => state.updateVisualRelationCardinality,
  );
  const removeVisualRelation = useDbStore(
    (state) => state.removeVisualRelation,
  );

  const zoom = useDbStore((state) => state.zoom);
  const setZoom = useDbStore((state) => state.setZoom);
  const fitTrigger = useDbStore((state) => state.fitTrigger);

  const undo = useDbStore((state) => state.undo);
  const redo = useDbStore((state) => state.redo);
  const canUndo = useDbStore((state) => state.historyIndex > 0);
  const canRedo = useDbStore(
    (state) => state.historyIndex < state.history.length - 1,
  );
  const saveHistory = useDbStore((state) => state.saveHistory);
  const lineStyle = useDbStore((state) => state.lineStyle);
  const setLineStyle = useDbStore((state) => state.setLineStyle);
  const relPositions = useDbStore((state) => state.relPositions ?? {});
  const updateRelPosition = useDbStore((state) => state.updateRelPosition);
  const diamondSize = useDbStore((state) => state.diamondSize ?? 120);
  const setDiamondSize = useDbStore((state) => state.setDiamondSize);
  const customWaypoints = useDbStore((state) => state.customWaypoints ?? {});
  const updateWaypoints = useDbStore((state) => state.updateWaypoints);

  // Zooming & Panning refs and states
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panStartRef = useRef({ x: 0, y: 0 });
  const gestureRef = useRef({
    mode: null as "pan" | "pinch" | null,
    startZoom: 1,
    startPan: { x: 0, y: 0 },
    startDistance: 0,
    startCenter: { x: 0, y: 0 },
  });

  const lastLoadedRef = useRef<string | null>(null);

  const wasSelectedBeforeDragRef = useRef<{
    type: "entity" | "relation" | null;
    id: string | null;
    wasSelected: boolean;
  }>({ type: null, id: null, wasSelected: false });

  const [draggingEntity, setDraggingEntity] = useState<{
    tableName: string;
    startX: number;
    startY: number;
    startPointerX: number;
    startPointerY: number;
  } | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [draggingRel, setDraggingRel] = useState<{
    relId: string;
    startX: number;
    startY: number;
    startPointerX: number;
    startPointerY: number;
  } | null>(null);
  // Orthogonal segment dragging state
  // 'pending' = mouse down but not yet moved (no waypoints inserted yet)
  // 'active'  = movement threshold exceeded, waypoints inserted & being moved
  const [draggingSegment, setDraggingSegment] = useState<{
    status: "pending" | "active";
    edgeId: string;
    side: "source" | "target";
    isHorizontal: boolean;
    // geometry of the segment endpoints at pointer-down time
    segA: { x: number; y: number };
    segB: { x: number; y: number };
    // insertion index into waypoints array
    insertIdx: number;
    // wpIdx1/wpIdx2 set once 'active'
    wpIdx1: number;
    wpIdx2: number;
    startPointerX: number;
    startPointerY: number;
    // snapshot of waypoints at the moment waypoints were first inserted
    originalWaypoints: { x: number; y: number }[];
    // waypoints BEFORE insertion (for the pending→active transition)
    waypointsBefore: { x: number; y: number }[];
    isIntermediate: boolean; // true if dragging a segment between two existing waypoints
  } | null>(null);

  const [draggingWaypoint, setDraggingWaypoint] = useState<{
    edgeId: string;
    side: "source" | "target";
    waypointIndex: number;
    startPointerX: number;
    startPointerY: number;
    originalWaypoints: { x: number; y: number }[];
  } | null>(null);

  // Dragging and positioning states for attributes
  const [draggingAttr, setDraggingAttr] = useState<{
    tableName: string;
    colName: string;
  } | null>(null);
  const [selectedAttr, setSelectedAttr] = useState<{
    tableName: string;
    colName: string;
  } | null>(null);
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(
    null,
  );
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(
    null,
  );
  const [entityInfoCollapsed, setEntityInfoCollapsed] = useState(false);
  const [showAttrControls, setShowAttrControls] = useState(false);
  const orbitBtnRef = useRef<HTMLButtonElement>(null);
  const [orbitBtnRect, setOrbitBtnRect] = useState<{
    top: number;
    right: number;
  } | null>(null);

  const attrPositions = useDbStore((state) => state.attrPositions);
  const setAttrPosition = useDbStore((state) => state.setAttrPosition);
  const resetAttrPosition = useDbStore((state) => state.resetAttrPosition);
  const resetTableAttrPositions = useDbStore(
    (state) => state.resetTableAttrPositions,
  );
  const resetAllAttrPositions = useDbStore(
    (state) => state.resetAllAttrPositions,
  );
  const relNotation = useDbStore((state) => state.relNotation);
  const setRelNotation = useDbStore((state) => state.setRelNotation);
  const lrsKeyNotation = useDbStore((state) => state.lrsKeyNotation);
  const setLrsKeyNotation = useDbStore((state) => state.setLrsKeyNotation);
  const classMethods = useDbStore((state) => state.classMethods);

  const selectedEntityNode =
    layout?.nodes.find((node) => node.table.name === selectedEntityName) ??
    null;
  const selectedEntityTable = selectedEntityNode?.table ?? null;
  const selectedEntityEdges = selectedEntityName
    ? (layout?.edges.filter(
        (edge) =>
          edge.sourceTable === selectedEntityName ||
          edge.targetTable === selectedEntityName,
      ) ?? [])
    : [];
  const selectedEntityRelations = selectedEntityName
    ? selectedEntityEdges.map((edge) => {
        const rel = edge.relationship;
        const isSource = rel.sourceTable === selectedEntityName;
        const otherTable = isSource ? rel.targetTable : rel.sourceTable;
        const verb =
          rel.verb || getRelationshipLabel(rel.sourceTable, rel.targetTable);
        const sourceCardinality = rel.sourceCardinality ?? "one";
        const targetCardinality =
          rel.targetCardinality ?? (rel.type === "1:1" ? "one" : "many");
        const cardinality = `${sourceCardinality === "many" ? "M" : "1"}:${targetCardinality === "many" ? "M" : "1"}`;
        return {
          edgeId: edge.id,
          otherTable,
          verb,
          cardinality,
          relId: rel.id,
        };
      })
    : [];
  const selectedAttrMeta =
    selectedAttr && layout
      ? (() => {
          const node = layout.nodes.find(
            (n) => n.table.name === selectedAttr.tableName,
          );
          if (!node) return null;
          const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
          const idx = node.table.columns.findIndex(
            (c) => c.name === selectedAttr.colName,
          );
          if (idx < 0) return null;
          const defaultAngle = (2 * Math.PI * idx) / node.table.columns.length;
          const defaultRadius = 85 + node.table.columns.length * 5;
          const pos = attrPositions[key] || {
            angle: defaultAngle,
            radius: defaultRadius,
          };
          let deg = Math.round((pos.angle * 180) / Math.PI);
          if (deg < 0) deg += 360;
          return { key, node, pos, deg, radiusVal: Math.round(pos.radius) };
        })()
      : null;

  useEffect(() => {
    if (selectedAttr) {
      setSelectedEntityName(null);
      setShowAttrControls(true);
    }
  }, [selectedAttr]);

  const focusEntityOnCanvas = (tableName: string) => {
    setSelectedEntityName(tableName);

    const node = layout?.nodes.find((n) => n.table.name === tableName);
    if (!node || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;

    setPan({
      x: rect.width / 2 - centerX * zoom,
      y: rect.height / 2 - centerY * zoom,
    });
  };

  const focusRelationOnCanvas = (relId: string) => {
    setSelectedRelationId(relId);

    const edge = layout?.edges.find((e) => e.relationship.id === relId);
    if (!edge || !containerRef.current) return;

    const pts = edge.points;
    if (pts.length === 0) return;

    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      totalLen += Math.sqrt(dx * dx + dy * dy);
    }

    const target = totalLen * 0.5;
    let current = 0;
    let centerX = pts[0].x;
    let centerY = pts[0].y;

    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1];
      const p2 = pts[i];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const seg = Math.sqrt(dx * dx + dy * dy);
      if (current + seg >= target) {
        const rem = target - current;
        const f = seg > 0 ? rem / seg : 0;
        centerX = p1.x + dx * f;
        centerY = p1.y + dy * f;
        break;
      }
      current += seg;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const targetZoom = Math.max(zoom, 0.95);
    setZoom(targetZoom);
    setPan({
      x: rect.width / 2 - centerX * targetZoom,
      y: rect.height / 2 - centerY * targetZoom,
    });
  };

  const handleEntityPointerDown = (
    e: React.PointerEvent<SVGElement>,
    tableName: string,
  ) => {
    if (e.button !== 0) return; // Only left click
    e.stopPropagation();

    const node = layout?.nodes.find((n) => n.table.name === tableName);
    if (!node) return;

    wasSelectedBeforeDragRef.current = {
      type: "entity",
      id: tableName,
      wasSelected: selectedEntityName === tableName,
    };
    setSelectedEntityName(tableName);
    setSelectedAttr(null);
    setSelectedRelationId(null);
    setHasDragged(false);

    setDraggingEntity({
      tableName,
      startX: node.x,
      startY: node.y,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
    });

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleEntityDrag = (clientX: number, clientY: number) => {
    if (!draggingEntity || !layout || !containerRef.current) return;

    const deltaX = (clientX - draggingEntity.startPointerX) / zoom;
    const deltaY = (clientY - draggingEntity.startPointerY) / zoom;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      setHasDragged(true);
    }

    const newX = draggingEntity.startX + deltaX;
    const newY = draggingEntity.startY + deltaY;

    updateNodePosition(draggingEntity.tableName, newX, newY);
  };

  const handleRelPointerDown = (
    e: React.PointerEvent<SVGElement>,
    relId: string,
    currentX: number,
    currentY: number,
  ) => {
    if (e.button !== 0) return; // Only left click
    e.stopPropagation();

    wasSelectedBeforeDragRef.current = {
      type: "relation",
      id: relId,
      wasSelected: selectedRelationId === relId,
    };
    setSelectedRelationId(relId);
    setSelectedEntityName(null);
    setSelectedAttr(null);
    setHasDragged(false);

    setDraggingRel({
      relId,
      startX: currentX,
      startY: currentY,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
    });

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleRelDrag = (clientX: number, clientY: number) => {
    if (!draggingRel) return;

    const deltaX = (clientX - draggingRel.startPointerX) / zoom;
    const deltaY = (clientY - draggingRel.startPointerY) / zoom;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      setHasDragged(true);
    }

    const newX = draggingRel.startX + deltaX;
    const newY = draggingRel.startY + deltaY;

    updateRelPosition(draggingRel.relId, newX, newY);
  };

  // ── Orthogonal segment / line-bending ──────────────────────────────────────
  const handleOrthoSegmentPointerDown = (
    e: React.PointerEvent<SVGElement>,
    edgeId: string,
    side: "source" | "target",
    fullPath: { x: number; y: number }[],
    si: number,
    currentWaypoints: { x: number; y: number }[],
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    // Check if dragging an intermediate segment (both ends are flexible waypoints)
    const isIntermediate = si > 0 && si + 1 < fullPath.length - 1;

    // Initialize base waypoints: if currentWaypoints is empty, seed it with the default orthogonal elbow
    let baseWps = [...currentWaypoints];
    if (baseWps.length === 0 && fullPath.length > 2) {
      baseWps = [fullPath[1]];
    }

    const A = fullPath[si];
    const B = fullPath[si + 1];
    const dx = Math.abs(B.x - A.x);
    const dy = Math.abs(B.y - A.y);
    const isHorizontal = dx >= dy;

    // Set pointer capture on the parent container so we receive move/up events globally
    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }

    setDraggingSegment({
      status: "pending",
      edgeId,
      side,
      isHorizontal,
      segA: A,
      segB: B,
      insertIdx: si,
      wpIdx1: isIntermediate ? si - 1 : si,
      wpIdx2: isIntermediate ? si : si + 1,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      originalWaypoints: baseWps,
      waypointsBefore: baseWps,
      isIntermediate,
    });
  };

  const handleOrthoSegmentDrag = (clientX: number, clientY: number) => {
    if (!draggingSegment) return;

    const rawDeltaX = clientX - draggingSegment.startPointerX;
    const rawDeltaY = clientY - draggingSegment.startPointerY;

    if (draggingSegment.isIntermediate) {
      // INTERMEDIATE SEGMENT: Drag existing segment/bend only — NEVER insert new waypoints!
      const { isHorizontal, wpIdx1, wpIdx2, originalWaypoints } =
        draggingSegment;
      const newWaypoints = [...originalWaypoints];

      if (wpIdx1 >= newWaypoints.length || wpIdx2 >= newWaypoints.length)
        return;

      if (isHorizontal) {
        const deltaY = rawDeltaY / zoom;
        newWaypoints[wpIdx1] = {
          ...originalWaypoints[wpIdx1],
          y: originalWaypoints[wpIdx1].y + deltaY,
        };
        newWaypoints[wpIdx2] = {
          ...originalWaypoints[wpIdx2],
          y: originalWaypoints[wpIdx2].y + deltaY,
        };
      } else {
        const deltaX = rawDeltaX / zoom;
        newWaypoints[wpIdx1] = {
          ...originalWaypoints[wpIdx1],
          x: originalWaypoints[wpIdx1].x + deltaX,
        };
        newWaypoints[wpIdx2] = {
          ...originalWaypoints[wpIdx2],
          x: originalWaypoints[wpIdx2].x + deltaX,
        };
      }

      updateWaypoints(
        draggingSegment.edgeId,
        draggingSegment.side,
        newWaypoints,
      );
      return;
    }

    // EDGE SEGMENT (connected to fixed endpoint): Insert elbow to preserve boundary connection
    const THRESHOLD = 3; // px screen space
    if (draggingSegment.status === "pending") {
      if (Math.abs(rawDeltaX) < THRESHOLD && Math.abs(rawDeltaY) < THRESHOLD)
        return;

      const {
        segA,
        segB,
        insertIdx,
        isHorizontal,
        waypointsBefore,
        edgeId,
        side,
      } = draggingSegment;
      let newWp1: { x: number; y: number };
      let newWp2: { x: number; y: number };

      if (isHorizontal) {
        newWp1 = { x: segA.x, y: segA.y };
        newWp2 = { x: segB.x, y: segB.y };
      } else {
        newWp1 = { x: segA.x, y: segA.y };
        newWp2 = { x: segB.x, y: segB.y };
      }

      const newWaypoints = [...waypointsBefore];
      newWaypoints.splice(insertIdx, 0, newWp1, newWp2);
      updateWaypoints(edgeId, side, newWaypoints);

      setDraggingSegment((prev) =>
        prev
          ? {
              ...prev,
              status: "active",
              wpIdx1: insertIdx,
              wpIdx2: insertIdx + 1,
              originalWaypoints: newWaypoints,
            }
          : null,
      );
      return;
    }

    // status === 'active' for Edge Segment
    const { isHorizontal, wpIdx1, wpIdx2, originalWaypoints } = draggingSegment;
    const newWaypoints = [...originalWaypoints];

    if (wpIdx1 >= newWaypoints.length || wpIdx2 >= newWaypoints.length) return;

    if (isHorizontal) {
      const deltaY = rawDeltaY / zoom;
      newWaypoints[wpIdx1] = {
        ...originalWaypoints[wpIdx1],
        y: originalWaypoints[wpIdx1].y + deltaY,
      };
      newWaypoints[wpIdx2] = {
        ...originalWaypoints[wpIdx2],
        y: originalWaypoints[wpIdx2].y + deltaY,
      };
    } else {
      const deltaX = rawDeltaX / zoom;
      newWaypoints[wpIdx1] = {
        ...originalWaypoints[wpIdx1],
        x: originalWaypoints[wpIdx1].x + deltaX,
      };
      newWaypoints[wpIdx2] = {
        ...originalWaypoints[wpIdx2],
        x: originalWaypoints[wpIdx2].x + deltaX,
      };
    }

    updateWaypoints(draggingSegment.edgeId, draggingSegment.side, newWaypoints);
  };

  const handleWaypointPointerDown = (
    e: React.PointerEvent<SVGElement>,
    edgeId: string,
    side: "source" | "target",
    waypointIndex: number,
    currentWaypoints: { x: number; y: number }[],
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }

    setDraggingWaypoint({
      edgeId,
      side,
      waypointIndex,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      originalWaypoints: currentWaypoints,
    });
  };

  const handleWaypointDrag = (clientX: number, clientY: number) => {
    if (!draggingWaypoint || !layout) return;

    const {
      edgeId,
      side,
      waypointIndex,
      startPointerX,
      startPointerY,
      originalWaypoints,
    } = draggingWaypoint;
    const deltaX = (clientX - startPointerX) / zoom;
    const deltaY = (clientY - startPointerY) / zoom;

    const newWaypoints = [...originalWaypoints];
    const targetWp = originalWaypoints[waypointIndex];
    if (!targetWp) return;

    let newX = targetWp.x + deltaX;
    let newY = targetWp.y + deltaY;

    // Retrieve layout edge to map fixed boundary locations
    const edge = layout.edges.find((e) => e.id === edgeId);
    if (!edge) return;

    const customPos = relPositions[edge.relationship.id];
    let dx = 0;
    let dy = 0;
    if (customPos) {
      dx = customPos.x;
      dy = customPos.y;
    } else {
      const p = ptAtT(edge.points, 0.5);
      dx = p.x;
      dy = p.y;
    }
    const { path1, path2 } = splitPointsAtDiamond(edge.points, 0.5, {
      x: dx,
      y: dy,
    });

    const basePath = side === "source" ? path1 : path2;
    const fullPath = [
      basePath[0],
      ...originalWaypoints,
      basePath[basePath.length - 1],
    ];

    const pi = waypointIndex + 1; // position in fullPath
    const prevPt = fullPath[pi - 1];
    const nextPt = fullPath[pi + 1];

    if (!prevPt || !nextPt) return;

    // Detect horizontal/vertical orientations of surrounding segments
    const prevIsH =
      Math.abs(targetWp.y - prevPt.y) < Math.abs(targetWp.x - prevPt.x);
    const nextIsH =
      Math.abs(nextPt.y - targetWp.y) < Math.abs(nextPt.x - targetWp.x);

    // If connected to a fixed start endpoint (entity boundary), constrain to its axis
    if (pi - 1 === 0) {
      if (prevIsH) newY = prevPt.y;
      else newX = prevPt.x;
    }

    // If connected to a fixed end endpoint (diamond boundary), constrain to its axis
    if (pi + 1 === fullPath.length - 1) {
      if (nextIsH) newY = nextPt.y;
      else newX = nextPt.x;
    }

    // Update coordinate of dragged corner bend point
    newWaypoints[waypointIndex] = { x: newX, y: newY };

    // Align adjacent flexible bends to maintain perfect orthogonal shapes
    if (pi - 1 > 0) {
      const prevWpIdx = waypointIndex - 1;
      if (prevIsH) {
        newWaypoints[prevWpIdx] = { ...newWaypoints[prevWpIdx], y: newY };
      } else {
        newWaypoints[prevWpIdx] = { ...newWaypoints[prevWpIdx], x: newX };
      }
    }
    if (pi + 1 < fullPath.length - 1) {
      const nextWpIdx = waypointIndex + 1;
      if (nextIsH) {
        newWaypoints[nextWpIdx] = { ...newWaypoints[nextWpIdx], y: newY };
      } else {
        newWaypoints[nextWpIdx] = { ...newWaypoints[nextWpIdx], x: newX };
      }
    }

    updateWaypoints(edgeId, side, newWaypoints);
  };

  // Determine dynamic canvas size based on active diagram data
  // Add generous padding so elements near the edge are never clipped
  const CANVAS_PADDING = 300;
  let canvasWidth = 1200;
  let canvasHeight = 900;
  let hasDiagramData = false;

  if (
    mode === "erd" ||
    mode === "lrs" ||
    mode === "transformation" ||
    mode === "visual" ||
    mode === "class"
  ) {
    if (layout) {
      canvasWidth = layout.width + CANVAS_PADDING * 2;
      canvasHeight = layout.height + CANVAS_PADDING * 2;
      hasDiagramData = true;
    }
  } else if (mode === "usecase" || mode === "uml") {
    if (usecaseDiagram) {
      canvasWidth = 750 + CANVAS_PADDING;
      const systemHeight = Math.max(
        320,
        usecaseDiagram.usecases.length * 90 + 80,
      );
      const systemsCount = Math.max(1, usecaseDiagram.systems.length);
      canvasHeight =
        Math.max(400, 60 + systemsCount * (systemHeight + 50) + 50) +
        CANVAS_PADDING;
      hasDiagramData = true;
    }
  }

  // Auto-fit view coordinates and scale to container bounds when the active layout/mode changes
  useEffect(() => {
    if (!containerRef.current || !hasDiagramData) return;

    // Only auto-fit when the mode changes, or when there is a major change (number of nodes/edges changes),
    // or when we transition from no diagram data to having diagram data.
    const layoutKey = `${mode}-${layout?.nodes.length || 0}-${layout?.edges.length || 0}-${hasDiagramData}`;
    if (lastLoadedRef.current === layoutKey) return;
    lastLoadedRef.current = layoutKey;

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
  }, [
    layout,
    usecaseDiagram,
    mode,
    hasDiagramData,
    canvasWidth,
    canvasHeight,
    setZoom,
  ]);

  const updateDraggingAttribute = (clientX: number, clientY: number) => {
    if (!containerRef.current || !layout || !draggingAttr) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (clientX - rect.left - pan.x) / zoom;
    const mouseY = (clientY - rect.top - pan.y) / zoom;

    const node = layout.nodes.find(
      (n) => n.table.name === draggingAttr.tableName,
    );
    if (!node) return;

    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const radius = Math.max(50, Math.min(350, Math.sqrt(dx * dx + dy * dy)));
    const angle = Math.atan2(dy, dx);

    setAttrPosition(`${draggingAttr.tableName}-${draggingAttr.colName}`, {
      angle,
      radius,
    });
  };

  const startPinchGesture = () => {
    if (!containerRef.current) return;

    const points = Array.from(activePointersRef.current.values());
    if (points.length < 2) return;

    const [first, second] = points;
    gestureRef.current.mode = "pinch";
    gestureRef.current.startZoom = zoom;
    gestureRef.current.startPan = { ...pan };
    gestureRef.current.startDistance = Math.max(
      Math.hypot(first.x - second.x, first.y - second.y),
      1,
    );
    gestureRef.current.startCenter = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    setIsPanning(false);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-canvas-interactive="true"]')) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gestureRef.current.mode = "pan";
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setIsPanning(true);
    setSelectedAttr(null);
    setEntityInfoCollapsed(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (activePointersRef.current.size >= 2) startPinchGesture();
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (draggingAttr) {
      updateDraggingAttribute(e.clientX, e.clientY);
      return;
    }

    // Waypoint corner bend dragging — handled at canvas level
    if (draggingWaypoint) {
      handleWaypointDrag(e.clientX, e.clientY);
      return;
    }

    // Orthogonal segment drag — handled at canvas level
    if (draggingSegment) {
      handleOrthoSegmentDrag(e.clientX, e.clientY);
      return;
    }

    if (activePointersRef.current.size >= 2) {
      if (gestureRef.current.mode !== "pinch") startPinchGesture();

      const points = Array.from(activePointersRef.current.values());
      if (points.length < 2 || !containerRef.current) return;

      const [first, second] = points;
      const currentCenter = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      const currentDistance = Math.max(
        Math.hypot(first.x - second.x, first.y - second.y),
        1,
      );
      const nextZoom = Math.max(
        0.1,
        Math.min(
          3,
          gestureRef.current.startZoom *
            (currentDistance / gestureRef.current.startDistance),
        ),
      );

      const rect = containerRef.current.getBoundingClientRect();
      const anchorX = gestureRef.current.startCenter.x - rect.left;
      const anchorY = gestureRef.current.startCenter.y - rect.top;
      const worldX =
        (anchorX - gestureRef.current.startPan.x) /
        gestureRef.current.startZoom;
      const worldY =
        (anchorY - gestureRef.current.startPan.y) /
        gestureRef.current.startZoom;

      setZoom(nextZoom);
      setPan({
        x: currentCenter.x - rect.left - worldX * nextZoom,
        y: currentCenter.y - rect.top - worldY * nextZoom,
      });
      setIsPanning(false);
      return;
    }

    if (gestureRef.current.mode !== "pan") return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const normalizeWaypointsWithEndpoints = (
    wps: { x: number; y: number }[],
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const fullPath = [start, ...wps, end];
    const result: { x: number; y: number }[] = [];

    for (let i = 0; i < fullPath.length; i++) {
      const current = fullPath[i];
      if (result.length === 0) {
        result.push(current);
        continue;
      }

      const last = result[result.length - 1];

      // 1. Zero-length segment check (overlapping or extremely close points)
      const dx = Math.abs(current.x - last.x);
      const dy = Math.abs(current.y - last.y);
      if (dx < 1.5 && dy < 1.5) {
        continue; // skip duplicate point
      }

      // 2. Collinear check: if three points align in a straight horizontal or vertical line, discard middle point
      if (result.length >= 2) {
        const prev = result[result.length - 2];
        const isH =
          Math.abs(last.y - prev.y) < 1.5 && Math.abs(current.y - last.y) < 1.5;
        const isV =
          Math.abs(last.x - prev.x) < 1.5 && Math.abs(current.x - last.x) < 1.5;

        if (isH || isV) {
          result.pop(); // remove intermediate collinear bend
        }
      }

      result.push(current);
    }

    if (result.length <= 2) return [];
    return result.slice(1, -1);
  };

  const endCanvasPointer = (pointerId: number) => {
    activePointersRef.current.delete(pointerId);

    // Release global pointer capture
    if (containerRef.current) {
      try {
        containerRef.current.releasePointerCapture(pointerId);
      } catch (err) {}
    }

    if (activePointersRef.current.size === 0) {
      gestureRef.current.mode = null;
      setIsPanning(false);

      if (draggingAttr) {
        saveHistory();
      }
      setDraggingAttr(null);

      // Normalize waypoints for the segment that was dragged
      if (draggingSegment && layout) {
        const { edgeId, side, status, isIntermediate } = draggingSegment;
        const state = useDbStore.getState();

        // Find path endpoints to run full path collinear checks
        const edge = layout.edges.find((e) => e.id === edgeId);
        if (edge) {
          const customPos = state.relPositions[edge.relationship.id];
          let dx = 0;
          let dy = 0;
          if (customPos) {
            dx = customPos.x;
            dy = customPos.y;
          } else {
            const p = ptAtT(edge.points, 0.5);
            dx = p.x;
            dy = p.y;
          }
          const { path1, path2 } = splitPointsAtDiamond(edge.points, 0.5, {
            x: dx,
            y: dy,
          });

          const basePath = side === "source" ? path1 : path2;
          const start = basePath[0];
          const end = basePath[basePath.length - 1];

          const sideKey =
            side === "source" ? "sourceWaypoints" : "targetWaypoints";
          const wps = state.customWaypoints[edgeId]?.[sideKey] ?? [];
          const normalized = normalizeWaypointsWithEndpoints(wps, start, end);
          updateWaypoints(edgeId, side, normalized);
        }

        if (status === "active" || isIntermediate) {
          saveHistory();
        }
      }
      setDraggingSegment(null);

      // Normalize waypoints for the corner waypoint that was dragged
      if (draggingWaypoint && layout) {
        const { edgeId, side } = draggingWaypoint;
        const state = useDbStore.getState();

        const edge = layout.edges.find((e) => e.id === edgeId);
        if (edge) {
          const customPos = state.relPositions[edge.relationship.id];
          let dx = 0;
          let dy = 0;
          if (customPos) {
            dx = customPos.x;
            dy = customPos.y;
          } else {
            const p = ptAtT(edge.points, 0.5);
            dx = p.x;
            dy = p.y;
          }
          const { path1, path2 } = splitPointsAtDiamond(edge.points, 0.5, {
            x: dx,
            y: dy,
          });

          const basePath = side === "source" ? path1 : path2;
          const start = basePath[0];
          const end = basePath[basePath.length - 1];

          const sideKey =
            side === "source" ? "sourceWaypoints" : "targetWaypoints";
          const wps = state.customWaypoints[edgeId]?.[sideKey] ?? [];
          const normalized = normalizeWaypointsWithEndpoints(wps, start, end);
          updateWaypoints(edgeId, side, normalized);
        }

        saveHistory();
      }
      setDraggingWaypoint(null);

      return;
    }

    if (activePointersRef.current.size === 1) {
      const [remaining] = Array.from(activePointersRef.current.values());
      gestureRef.current.mode = "pan";
      panStartRef.current = { x: remaining.x - pan.x, y: remaining.y - pan.y };
      setIsPanning(true);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-canvas-interactive="true"]')) return;

      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const zoomIntensity = 0.08;
      const delta = e.deltaY < 0 ? 1 : -1;

      const oldZoom = zoom;
      const nextZoom = Math.max(
        0.1,
        Math.min(3, oldZoom + delta * zoomIntensity * oldZoom),
      );

      const worldX = (cursorX - pan.x) / oldZoom;
      const worldY = (cursorY - pan.y) / oldZoom;

      setZoom(nextZoom);
      setPan({
        x: cursorX - worldX * nextZoom,
        y: cursorY - worldY * nextZoom,
      });
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [setZoom, setPan, zoom, pan]);

  const handleFit = useCallback(() => {
    if (!containerRef.current || !hasDiagramData) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const padding = 60;
    const scaleX = (containerWidth - padding) / canvasWidth;
    const scaleY = (containerHeight - padding) / canvasHeight;
    const fitScale = Math.max(0.1, Math.min(1.5, Math.min(scaleX, scaleY)));
    setZoom(fitScale);
    setPan({
      x: (containerWidth - canvasWidth * fitScale) / 2,
      y: (containerHeight - canvasHeight * fitScale) / 2,
    });
  }, [hasDiagramData, canvasWidth, canvasHeight, setZoom, setPan]);

  // React to fit trigger from Footer
  useEffect(() => {
    if (fitTrigger > 0) handleFit();
  }, [fitTrigger, handleFit]);

  // Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (canUndo) {
            undo();
          }
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          if (canRedo) {
            redo();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo, canUndo, canRedo]);

  return (
    <div className="relative flex h-full w-full flex-col bg-zinc-950 select-none">
      {/* 1. Preview Toolbar */}
      <div className="flex flex-col border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div className="flex h-10 w-full items-center justify-between px-3 gap-2">
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-minimal">
            <span className="text-xs font-medium text-zinc-500 shrink-0">
              Mode: <span className="text-blue-400 font-semibold">{mode}</span>
            </span>

            {(mode === "erd" ||
              mode === "lrs" ||
              mode === "transformation" ||
              mode === "visual" ||
              mode === "class") && (
              <>
                <div className="w-px h-4 bg-zinc-800 shrink-0" />

                {mode !== "visual" && (
                  <button
                    onClick={() => setShowTableFilter(!showTableFilter)}
                    className={`flex h-7 px-2.5 items-center gap-1.5 rounded-md border text-xs font-medium transition shrink-0 ${
                      showTableFilter
                        ? "border-blue-600/40 bg-blue-950/30 text-blue-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                    title="Toggle table filter"
                  >
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">Filter tables</span>
                    <span className="text-zinc-500 text-[10px]">
                      ({schema.tables.length - excludedTables.length}/
                      {schema.tables.length})
                    </span>
                  </button>
                )}

                <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0">
                  <button
                    onClick={() => setRelNotation("crowsfoot")}
                    title="Crow's Foot notation"
                    className={`h-7 px-2.5 text-xs font-medium transition ${
                      relNotation === "crowsfoot"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    Crow&apos;s Foot
                  </button>
                  <div className="w-px h-4 bg-zinc-700" />
                  <button
                    onClick={() => setRelNotation("label")}
                    title="1:N / M:N label notation"
                    className={`h-7 px-2.5 text-xs font-medium transition ${
                      relNotation === "label"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    1:N
                  </button>
                </div>

                <div className="w-px h-4 bg-zinc-800 shrink-0" />

                <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0">
                  <button
                    onClick={() => setLineStyle("sharp")}
                    title="Sharp orthogonal lines"
                    className={`h-7 px-2 text-xs font-medium transition ${
                      lineStyle === "sharp"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    Sharp
                  </button>
                  <div className="w-px h-4 bg-zinc-700" />
                  <button
                    onClick={() => setLineStyle("rounded")}
                    title="Rounded orthogonal lines"
                    className={`h-7 px-2 text-xs font-medium transition ${
                      lineStyle === "rounded"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    Rounded
                  </button>
                  <div className="w-px h-4 bg-zinc-700" />
                  <button
                    onClick={() => setLineStyle("curved")}
                    title="Curved flow lines"
                    className={`h-7 px-2 text-xs font-medium transition ${
                      lineStyle === "curved"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    Curved
                  </button>
                  <div className="w-px h-4 bg-zinc-700" />
                  <button
                    onClick={() => setLineStyle("straight")}
                    title="Direct straight lines"
                    className={`h-7 px-2 text-xs font-medium transition ${
                      lineStyle === "straight"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    Straight
                  </button>
                </div>

                {(mode === "lrs" || mode === "transformation") && (
                  <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0">
                    <button
                      onClick={() => setLrsKeyNotation("stars")}
                      title="Stars key notation (* / **)"
                      className={`h-7 px-2.5 text-xs font-medium transition ${
                        lrsKeyNotation === "stars"
                          ? "bg-blue-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      * / ** Keys
                    </button>
                    <div className="w-px h-4 bg-zinc-700" />
                    <button
                      onClick={() => setLrsKeyNotation("letters")}
                      title="Letters key notation (PK / FK)"
                      className={`h-7 px-2.5 text-xs font-medium transition ${
                        lrsKeyNotation === "letters"
                          ? "bg-blue-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      PK / FK Keys
                    </button>
                  </div>
                )}

                {mode !== "visual" && (
                  <button
                    onClick={() =>
                      triggerAiLabeling().catch((err) => alert(err.message))
                    }
                    disabled={isAiLoading}
                    className={`flex h-7 px-2.5 items-center gap-1.5 rounded-md border text-xs font-medium transition shrink-0 ${
                      isAiLoading
                        ? "border-blue-600/40 bg-blue-950/30 text-blue-400 cursor-not-allowed"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                    title="Auto-label relationships using Gemini AI"
                  >
                    {isAiLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    )}
                    <span className="hidden sm:inline">
                      {isAiLoading ? "Analyzing..." : "AI Auto-label"}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="relative flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 border border-zinc-800 bg-zinc-900 rounded-md p-0.5 shrink-0">
              <button
                onClick={undo}
                disabled={!canUndo}
                className={`p-1 rounded text-xs transition ${
                  canUndo
                    ? "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    : "text-zinc-600 cursor-not-allowed opacity-40"
                }`}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className={`p-1 rounded text-xs transition ${
                  canRedo
                    ? "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    : "text-zinc-600 cursor-not-allowed opacity-40"
                }`}
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-zinc-800 shrink-0" />

            {/* Orbit/radius only relevant in Chen ERD mode where attributes have orbits */}
            {mode === "erd" && (
              <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900 rounded-md px-2.5 h-7 shrink-0">
                <span className="text-zinc-500 text-[10px] uppercase font-semibold tracking-wider font-mono">
                  Diamond Size
                </span>
                <input
                  type="range"
                  min="60"
                  max="240"
                  value={diamondSize}
                  onChange={(e) => setDiamondSize(parseInt(e.target.value, 10))}
                  className="w-20 sm:w-28 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                />
                <span className="text-blue-400 text-[10px] font-mono w-6 text-right">
                  {diamondSize}
                </span>
              </div>
            )}

            {mode === "erd" && (
              <button
                ref={orbitBtnRef}
                onClick={() => {
                  if (!showAttrControls && orbitBtnRef.current) {
                    const r = orbitBtnRef.current.getBoundingClientRect();
                    setOrbitBtnRect({
                      top: r.bottom + 4,
                      right: window.innerWidth - r.right,
                    });
                  }
                  setShowAttrControls((v) => !v);
                }}
                className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition shrink-0 ${
                  showAttrControls
                    ? "border-blue-600/40 bg-blue-950/30 text-blue-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
                title="Attribute orbit and radius"
              >
                <Sliders className="h-3.5 w-3.5 shrink-0" />
                <span className="normal-case">Orbit / radius</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${showAttrControls ? "rotate-180" : ""}`}
                />
              </button>
            )}

            {showAttrControls &&
              orbitBtnRect &&
              createPortal(
                <>
                  <div
                    className="fixed inset-0 z-[9999998]"
                    onClick={() => setShowAttrControls(false)}
                  />
                  <div
                    className="fixed w-[300px] max-w-[calc(100vw-24px)] rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 shadow-2xl z-[9999999]"
                    style={{ top: orbitBtnRect.top, right: orbitBtnRect.right }}
                  >
                    {selectedAttrMeta ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                          <div className="min-w-0">
                            <div className="text-[10px] text-zinc-500 normal-case">
                              Attribute
                            </div>
                            <div className="truncate text-xs font-semibold text-zinc-100 normal-case">
                              {selectedAttr!.colName}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowAttrControls(false)}
                            className="rounded border border-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 normal-case"
                          >
                            Close
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="text-[10px] text-zinc-500 normal-case">
                              Orbit angle
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-blue-400">
                              <span className="normal-case">Current</span>
                              <span className="font-mono">
                                {selectedAttrMeta.deg}Â°
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="360"
                              value={selectedAttrMeta.deg}
                              onChange={(e) => {
                                const newDeg = parseInt(e.target.value, 10);
                                const rad = (newDeg * Math.PI) / 180;
                                setAttrPosition(selectedAttrMeta.key, {
                                  ...selectedAttrMeta.pos,
                                  angle: rad,
                                });
                              }}
                              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="text-[10px] text-zinc-500 normal-case">
                              Orbit radius
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-blue-400">
                              <span className="normal-case">Current</span>
                              <span className="font-mono">
                                {selectedAttrMeta.radiusVal}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min="50"
                              max="350"
                              value={selectedAttrMeta.radiusVal}
                              onChange={(e) => {
                                const newRad = parseInt(e.target.value, 10);
                                setAttrPosition(selectedAttrMeta.key, {
                                  ...selectedAttrMeta.pos,
                                  radius: newRad,
                                });
                              }}
                              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              resetAttrPosition(selectedAttrMeta.key)
                            }
                            className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-[5px] text-[10px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 normal-case"
                          >
                            Reset attribute
                          </button>
                          <button
                            onClick={() => {
                              resetTableAttrPositions(
                                selectedAttr!.tableName,
                                selectedAttrMeta.node.table.columns.map(
                                  (c) => c.name,
                                ),
                              );
                            }}
                            className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-[5px] text-[10px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 normal-case"
                          >
                            Reset table
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500 normal-case">
                        Tap an attribute to edit orbit and radius.
                      </div>
                    )}
                  </div>
                </>,
                document.body,
              )}
          </div>
        </div>

        {(mode === "erd" ||
          mode === "lrs" ||
          mode === "transformation" ||
          mode === "visual" ||
          mode === "class") && (
          <div className="hidden min-h-12 items-center justify-between gap-3 border-t border-zinc-800 px-3 py-2 overflow-x-auto scrollbar-minimal">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 shrink-0">
                Mode detail
              </span>
              <span className="text-xs text-zinc-300 shrink-0">
                {selectedEntityName
                  ? `Entity: ${selectedEntityName}`
                  : "Tap an entity to inspect it"}
              </span>
              {selectedEntityTable && (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 shrink-0">
                  <span>{selectedEntityTable.columns.length} cols</span>
                  <span className="text-zinc-600">â€¢</span>
                  <span>{selectedEntityEdges.length} rels</span>
                </span>
              )}
            </div>

            {selectedAttr ? (
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 shrink-0">
                  Attribute Orbit & Radius
                </span>
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5">
                  <div className="min-w-[120px]">
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Attribute
                    </div>
                    <div className="text-[11px] font-semibold text-blue-400 truncate">
                      {selectedAttr.colName}
                    </div>
                  </div>
                  <div className="w-px h-8 bg-zinc-800 shrink-0" />
                  <div className="flex flex-col gap-1 min-w-[180px]">
                    <div className="flex justify-between text-[10px] font-medium">
                      <span className="text-zinc-400">Orbit</span>
                      <span className="text-blue-400 font-mono">
                        {Math.round(
                          (() => {
                            const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
                            const node = layout?.nodes.find(
                              (n) => n.table.name === selectedAttr.tableName,
                            );
                            if (!node) return 0;
                            const idx = node.table.columns.findIndex(
                              (c) => c.name === selectedAttr.colName,
                            );
                            const defaultAngle =
                              (2 * Math.PI * idx) / node.table.columns.length;
                            const pos = attrPositions[key] || {
                              angle: defaultAngle,
                              radius: 85 + node.table.columns.length * 5,
                            };
                            let deg = Math.round((pos.angle * 180) / Math.PI);
                            if (deg < 0) deg += 360;
                            return deg;
                          })(),
                        )}
                        Â°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={(() => {
                        const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
                        const node = layout?.nodes.find(
                          (n) => n.table.name === selectedAttr.tableName,
                        );
                        if (!node) return 0;
                        const idx = node.table.columns.findIndex(
                          (c) => c.name === selectedAttr.colName,
                        );
                        const defaultAngle =
                          (2 * Math.PI * idx) / node.table.columns.length;
                        const pos = attrPositions[key] || {
                          angle: defaultAngle,
                          radius: 85 + node.table.columns.length * 5,
                        };
                        let deg = Math.round((pos.angle * 180) / Math.PI);
                        if (deg < 0) deg += 360;
                        return deg;
                      })()}
                      onChange={(e) => {
                        const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
                        const node = layout?.nodes.find(
                          (n) => n.table.name === selectedAttr.tableName,
                        );
                        if (!node) return;
                        const idx = node.table.columns.findIndex(
                          (c) => c.name === selectedAttr.colName,
                        );
                        const defaultRadius =
                          85 + node.table.columns.length * 5;
                        const current = attrPositions[key] || {
                          angle:
                            (2 * Math.PI * idx) / node.table.columns.length,
                          radius: defaultRadius,
                        };
                        const newDeg = parseInt(e.target.value, 10);
                        const rad = (newDeg * Math.PI) / 180;
                        setAttrPosition(key, { ...current, angle: rad });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-[180px]">
                    <div className="flex justify-between text-[10px] font-medium">
                      <span className="text-zinc-400">Radius</span>
                      <span className="text-blue-400 font-mono">
                        {(() => {
                          const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
                          const node = layout?.nodes.find(
                            (n) => n.table.name === selectedAttr.tableName,
                          );
                          if (!node) return 0;
                          const idx = node.table.columns.findIndex(
                            (c) => c.name === selectedAttr.colName,
                          );
                          const defaultRadius =
                            85 + node.table.columns.length * 5;
                          const pos = attrPositions[key] || {
                            angle:
                              (2 * Math.PI * idx) / node.table.columns.length,
                            radius: defaultRadius,
                          };
                          return Math.round(pos.radius);
                        })()}
                        px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="350"
                      value={(() => {
                        const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
                        const node = layout?.nodes.find(
                          (n) => n.table.name === selectedAttr.tableName,
                        );
                        if (!node) return 0;
                        const idx = node.table.columns.findIndex(
                          (c) => c.name === selectedAttr.colName,
                        );
                        const defaultRadius =
                          85 + node.table.columns.length * 5;
                        const pos = attrPositions[key] || {
                          angle:
                            (2 * Math.PI * idx) / node.table.columns.length,
                          radius: defaultRadius,
                        };
                        return Math.round(pos.radius);
                      })()}
                      onChange={(e) => {
                        const key = `${selectedAttr.tableName}-${selectedAttr.colName}`;
                        const node = layout?.nodes.find(
                          (n) => n.table.name === selectedAttr.tableName,
                        );
                        if (!node) return;
                        const idx = node.table.columns.findIndex(
                          (c) => c.name === selectedAttr.colName,
                        );
                        const defaultAngle =
                          (2 * Math.PI * idx) / node.table.columns.length;
                        const current = attrPositions[key] || {
                          angle: defaultAngle,
                          radius: 85 + node.table.columns.length * 5,
                        };
                        const newRad = parseInt(e.target.value, 10);
                        setAttrPosition(key, { ...current, radius: newRad });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-[10px] text-zinc-500">
                Tap an attribute to edit orbit and radius.
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Main Render Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full outline-none overflow-hidden relative"
      >
        {error && (
          <div className="absolute inset-x-4 top-4 bg-red-950/70 border border-red-900 text-red-200 p-4 rounded-lg z-20 flex flex-col gap-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">
              Compilation Error
            </h4>
            <p className="text-xs font-medium leading-relaxed">{error}</p>
          </div>
        )}

        {showTableFilter &&
          (mode === "erd" ||
            mode === "lrs" ||
            mode === "transformation" ||
            mode === "class") && (
            <div
              className="absolute left-6 top-6 bottom-6 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-4 flex flex-col gap-3.5 z-20 select-none max-h-[85%] touch-auto"
              data-canvas-interactive="true"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <Filter className="h-4 w-4 text-blue-500" />
                  <h4 className="text-xs font-semibold text-zinc-200">
                    Filter database tables
                  </h4>
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
                  const isChecked = !excludedTables.includes(
                    t.name.toLowerCase(),
                  );
                  return (
                    <label
                      key={t.name}
                      className={`flex items-center justify-between p-2 rounded border transition cursor-pointer ${
                        isChecked
                          ? "bg-zinc-950 border-zinc-800 text-zinc-200 hover:text-zinc-100"
                          : "bg-zinc-950/20 border-zinc-900/50 text-zinc-500 hover:text-zinc-400"
                      }`}
                    >
                      <span className="text-xs font-mono font-medium truncate max-w-[180px]">
                        {t.name}
                      </span>
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
                <span>
                  Checked: {schema.tables.length - excludedTables.length} /{" "}
                  {schema.tables.length}
                </span>
                <button
                  onClick={() => setShowTableFilter(false)}
                  className="text-blue-500 hover:underline font-semibold"
                >
                  Close panel
                </button>
              </div>
            </div>
          )}

        {selectedRelationId &&
          (() => {
            const edge = layout?.edges.find(
              (e) => e.relationship.id === selectedRelationId,
            );
            if (!edge) return null;
            const rel = edge.relationship;
            const defaultVerb = getRelationshipLabel(
              rel.sourceTable,
              rel.targetTable,
            );
            return (
              <div
                className="absolute right-4 top-4 z-10 w-fit min-w-[18rem] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-sm select-none"
                data-canvas-interactive="true"
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-bold text-zinc-100">
                      Relationship info
                    </div>
                    <div
                      className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate max-w-[14rem]"
                      title={`${rel.sourceTable} → ${rel.targetTable}`}
                    >
                      {rel.sourceTable} &rarr; {rel.targetTable}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedRelationId(null)}
                    className="rounded border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"
                  >
                    Close
                  </button>
                </div>

                {/* Relationship Label / Verb Edit */}
                <div className="mt-3">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Relationship Label (Diamond)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={rel.verb ?? ""}
                      placeholder={defaultVerb}
                      onChange={(e) =>
                        updateRelationshipVerb(rel.id, e.target.value)
                      }
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500 placeholder-zinc-600"
                    />
                    {rel.verb && (
                      <button
                        onClick={() => updateRelationshipVerb(rel.id, "")}
                        className="rounded border border-zinc-850 p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                        title="Reset to default label"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1">
                    Leave empty to use default:{" "}
                    <span className="font-mono">{defaultVerb}</span>
                  </p>
                </div>

                {/* Cardinality settings */}
                <div className="mt-4 border-t border-zinc-800 pt-3">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Cardinality
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-[10px] text-zinc-500 block mb-1 truncate"
                        title={rel.sourceTable}
                      >
                        {rel.sourceTable}
                      </span>
                      <select
                        value={rel.sourceCardinality ?? "one"}
                        onChange={(e) =>
                          updateVisualRelationCardinality(
                            rel.id,
                            e.target.value as "one" | "many",
                            rel.targetCardinality ??
                              (rel.type === "1:1" ? "one" : "many"),
                          )
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none focus:border-blue-500"
                      >
                        <option value="one">1 (One)</option>
                        <option value="many">N (Many)</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-[10px] text-zinc-500 block mb-1 truncate"
                        title={rel.targetTable}
                      >
                        {rel.targetTable}
                      </span>
                      <select
                        value={
                          rel.targetCardinality ??
                          (rel.type === "1:1" ? "one" : "many")
                        }
                        onChange={(e) =>
                          updateVisualRelationCardinality(
                            rel.id,
                            rel.sourceCardinality ?? "one",
                            e.target.value as "one" | "many",
                          )
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none focus:border-blue-500"
                      >
                        <option value="one">1 (One)</option>
                        <option value="many">N (Many)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Reset Path / Bends & Delete / Remove Action */}
                <div className="mt-4 border-t border-zinc-800 pt-3 flex gap-2 justify-between">
                  <button
                    onClick={() => {
                      updateWaypoints(edge.id, "source", []);
                      updateWaypoints(edge.id, "target", []);
                      saveHistory();
                    }}
                    className="flex items-center gap-1.5 rounded bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reset Line Path
                  </button>

                  <button
                    onClick={() => {
                      if (
                        confirm(
                          "Delete this relationship? This will also delete the foreign key column.",
                        )
                      ) {
                        removeVisualRelation(rel.id);
                        setSelectedRelationId(null);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 px-3 py-1.5 text-xs text-red-200 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Relation
                  </button>
                </div>
              </div>
            );
          })()}

        {selectedEntityName && selectedEntityTable && !entityInfoCollapsed && (
          <div
            className="absolute right-4 top-4 z-10 w-fit min-w-[18rem] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-800 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-sm select-none"
            data-canvas-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-zinc-100 normal-case">
                  Entity info
                </div>
                <div className="truncate text-sm font-semibold text-zinc-100">
                  {selectedEntityName}
                </div>
              </div>
              <button
                onClick={() => setEntityInfoCollapsed(true)}
                className="rounded border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                <div className="text-zinc-500">Columns</div>
                <div className="font-semibold text-zinc-100">
                  {selectedEntityTable.columns.length}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                <div className="text-zinc-500">PK</div>
                <div className="font-semibold text-blue-400">
                  {selectedEntityTable.primaryKey.length}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                <div className="text-zinc-500">FK</div>
                <div className="font-semibold text-violet-400">
                  {selectedEntityTable.foreignKeys.length}
                </div>
              </div>
            </div>

            <div className="mt-2">
              <div className="text-[10px] text-zinc-500 normal-case">
                Related tables
              </div>
              <div className="mt-1">
                {selectedEntityRelations.length > 0 ? (
                  <ul className="space-y-1 text-[10px] text-zinc-300">
                    {selectedEntityRelations.map((rel) => (
                      <li
                        key={rel.edgeId}
                        className="flex items-start gap-1.5 leading-relaxed whitespace-nowrap"
                      >
                        <span className="text-zinc-500">-</span>
                        <span className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEntityName(null);
                              setSelectedAttr(null);
                              focusRelationOnCanvas(rel.relId);
                            }}
                            className="text-zinc-200 hover:text-blue-400 font-medium hover:underline transition-colors align-baseline"
                            title="Edit relationship"
                          >
                            {rel.verb}
                          </button>
                          <span className="text-blue-400">
                            {" "}
                            {rel.cardinality}
                          </span>
                          <span className="text-zinc-500"> - </span>
                          <button
                            type="button"
                            onClick={() => focusEntityOnCanvas(rel.otherTable)}
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 decoration-transparent hover:decoration-current transition-colors align-baseline"
                            title={`Focus ${rel.otherTable}`}
                          >
                            <span>{rel.otherTable}</span>
                            <span aria-hidden="true" className="text-blue-500">
                              â†—
                            </span>
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[10px] text-zinc-500">
                    No relations
                  </span>
                )}
              </div>
            </div>

            {selectedEntityTable.comment && (
              <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[10px] text-zinc-400">
                {selectedEntityTable.comment}
              </div>
            )}

            <div className="mt-2">
              <div className="text-[10px] text-zinc-500 normal-case">
                Columns
              </div>
              <div className="scrollbar-mini mt-1 max-h-28 space-y-1 overflow-y-auto pr-1">
                {selectedEntityTable.columns.map((col) => {
                  const isPk = selectedEntityTable.primaryKey.includes(
                    col.name,
                  );
                  const isFk = selectedEntityTable.foreignKeys.some((fk) =>
                    fk.columns
                      .map((c) => c.toLowerCase())
                      .includes(col.name.toLowerCase()),
                  );
                  return (
                    <div
                      key={col.name}
                      className="flex items-center justify-between gap-2 text-[10px] leading-relaxed"
                    >
                      <span className="min-w-0 truncate text-zinc-200 normal-case">
                        {col.name}
                      </span>
                      <span className="ml-2 flex items-center gap-1 shrink-0">
                        {isPk && (
                          <span className="rounded border border-blue-500/30 px-1 py-0.5 text-blue-400">
                            PK
                          </span>
                        )}
                        {isFk && (
                          <span className="rounded border border-amber-500/30 px-1 py-0.5 text-amber-300">
                            FK
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {selectedEntityName && selectedEntityTable && entityInfoCollapsed && (
          <button
            onClick={() => setEntityInfoCollapsed(false)}
            className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/95 px-3 py-2 shadow-2xl backdrop-blur-sm hover:bg-zinc-800 transition-colors"
            data-canvas-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Database className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-zinc-200">
              {selectedEntityName}
            </span>
            <ChevronDown className="h-3 w-3 text-zinc-500 -rotate-90" />
          </button>
        )}

        {false && selectedAttr && (
          <div
            className="absolute right-6 top-20 w-72 bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-4 flex flex-col gap-3.5 z-20 select-none touch-auto"
            data-canvas-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Sliders className="h-4 w-4 text-blue-500" />
                <h4 className="text-xs font-semibold text-zinc-200">
                  Attribute Orbit & Radius
                </h4>
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
              <div className="text-xs font-semibold text-zinc-200 truncate">
                {selectedAttr!.tableName}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-zinc-500 font-mono">
                Attribute
              </div>
              <div className="text-xs font-semibold text-blue-450 truncate">
                {selectedAttr!.colName}
              </div>
            </div>

            {/* Sliders */}
            {(() => {
              if (!selectedAttr) return null;
              const key = `${selectedAttr!.tableName}-${selectedAttr!.colName}`;
              const node = layout?.nodes.find(
                (n) => n.table.name === selectedAttr!.tableName,
              );
              if (!node) return null;
              const N = node!.table.columns.length;
              const idx = node!.table.columns.findIndex(
                (c) => c.name === selectedAttr!.colName,
              );
              const defaultAngle = (2 * Math.PI * idx) / N;
              const defaultRadius = 85 + N * 5;

              const pos = attrPositions[key] || {
                angle: defaultAngle,
                radius: defaultRadius,
              };

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
                      <span className="text-blue-500 font-mono">{deg}Â°</span>
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
                      <span className="text-blue-500 font-mono">
                        {radiusVal}px
                      </span>
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
                            selectedAttr!.tableName,
                            node!.table.columns.map((c) => c.name),
                          );
                        }}
                        className="flex-1 py-1.5 text-center text-[10px] font-semibold text-zinc-400 bg-zinc-950 border border-zinc-800 rounded hover:bg-zinc-850 hover:text-zinc-200 transition"
                      >
                        Reset Table
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Reset all attribute positions in the diagram?",
                          )
                        ) {
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

        <div
          className={`absolute inset-0 z-0 ${isPanning ? "cursor-grabbing" : "cursor-grab"} touch-none overscroll-none`}
          style={{
            touchAction: "none",
            overscrollBehavior: "none",
          }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={(e) => endCanvasPointer(e.pointerId)}
          onPointerCancel={(e) => endCanvasPointer(e.pointerId)}
          onPointerLeave={(e) => {
            if (e.buttons === 0) endCanvasPointer(e.pointerId);
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: [
                "linear-gradient(to right, rgba(63, 63, 70, 0.42) 1px, transparent 1px)",
                "linear-gradient(to bottom, rgba(63, 63, 70, 0.42) 1px, transparent 1px)",
                "linear-gradient(to right, rgba(39, 39, 42, 0.55) 1px, transparent 1px)",
                "linear-gradient(to bottom, rgba(39, 39, 42, 0.55) 1px, transparent 1px)",
              ].join(", "),
              backgroundSize: [
                `${Math.max(16, 24 * zoom)}px ${Math.max(16, 24 * zoom)}px`,
                `${Math.max(16, 24 * zoom)}px ${Math.max(16, 24 * zoom)}px`,
                `${Math.max(64, 96 * zoom)}px ${Math.max(64, 96 * zoom)}px`,
                `${Math.max(64, 96 * zoom)}px ${Math.max(64, 96 * zoom)}px`,
              ].join(", "),
              backgroundPosition: [
                `${((pan.x % Math.max(16, 24 * zoom)) + Math.max(16, 24 * zoom)) % Math.max(16, 24 * zoom)}px ${((pan.y % Math.max(16, 24 * zoom)) + Math.max(16, 24 * zoom)) % Math.max(16, 24 * zoom)}px`,
                `${((pan.x % Math.max(16, 24 * zoom)) + Math.max(16, 24 * zoom)) % Math.max(16, 24 * zoom)}px ${((pan.y % Math.max(16, 24 * zoom)) + Math.max(16, 24 * zoom)) % Math.max(16, 24 * zoom)}px`,
                `${((pan.x % Math.max(64, 96 * zoom)) + Math.max(64, 96 * zoom)) % Math.max(64, 96 * zoom)}px ${((pan.y % Math.max(64, 96 * zoom)) + Math.max(64, 96 * zoom)) % Math.max(64, 96 * zoom)}px`,
                `${((pan.x % Math.max(64, 96 * zoom)) + Math.max(64, 96 * zoom)) % Math.max(64, 96 * zoom)}px ${((pan.y % Math.max(64, 96 * zoom)) + Math.max(64, 96 * zoom)) % Math.max(64, 96 * zoom)}px`,
              ].join(", "),
              opacity: 0.55,
            }}
          />

          {hasDiagramData ? (
            <svg
              id="fooldb-svg"
              className="absolute inset-0 w-full h-full overflow-visible"
            >
              <g
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                  transition: isPanning ? "none" : "transform 0.06s ease-out",
                  willChange: "transform",
                  contain: "layout paint",
                }}
              >
                {/* SVG Markers / Arrowdefs */}
                <defs>
                  {/* Crow's Foot End Markers */}
                  <marker
                    id="one-marker"
                    markerWidth="8"
                    markerHeight="8"
                    refX="0"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <circle
                      cx="4"
                      cy="4"
                      r="2.5"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                    />
                  </marker>
                  <marker
                    id="many-marker"
                    markerWidth="14"
                    markerHeight="12"
                    refX="14"
                    refY="6"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path
                      d="M 2 2 L 14 6 L 2 10"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                    />
                  </marker>
                  <marker
                    id="one-one-marker"
                    markerWidth="12"
                    markerHeight="12"
                    refX="12"
                    refY="6"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path
                      d="M 5 2 L 5 10 M 9 2 L 9 10"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                    />
                  </marker>

                  {/* UML Activity Arrow */}
                  <marker
                    id="activity-arrow"
                    markerWidth="10"
                    markerHeight="10"
                    refX="10"
                    refY="5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 1.5 L 10 5 L 0 8.5 Z" fill="#6366f1" />
                  </marker>
                  <marker
                    id="sequence-arrow"
                    markerWidth="10"
                    markerHeight="10"
                    refX="10"
                    refY="5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 1.5 L 10 5 L 0 8.5 Z" fill="#6366f1" />
                  </marker>
                </defs>

                {/* A. RENDER MODE: CHEN ERD + VISUAL BUILDER */}
                {(mode === "erd" || mode === "visual") &&
                  layout &&
                  (() => {
                    // Helper to get intersection point on box border (120x45 rect)
                    const getBorderPoint = (
                      center: { x: number; y: number },
                      toward: { x: number; y: number },
                      w = 120,
                      h = 45,
                    ) => {
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
                        y: center.y + dy * scale,
                      };
                    };

                    const dw = diamondSize;
                    const dh = diamondSize * 0.375;

                    const diamonds = layout.edges.map((edge) => {
                      const customPos = relPositions[edge.relationship.id];
                      let x = 0;
                      let y = 0;
                      let t = 0.5;
                      let hasCustomPos = false;

                      if (customPos) {
                        x = customPos.x;
                        y = customPos.y;
                        hasCustomPos = true;
                      } else {
                        const p = ptAtT(edge.points, 0.5);
                        x = p.x;
                        y = p.y;
                      }

                      const { path1: basePath1, path2: basePath2 } =
                        splitPointsAtDiamond(edge.points, 0.5, { x, y });

                      // Inject custom waypoints; if none → use orthogonal L-shaped base path
                      const edgeWaypoints = customWaypoints[edge.id];
                      let finalPath1: { x: number; y: number }[];
                      let finalPath2: { x: number; y: number }[];

                      if (edgeWaypoints?.sourceWaypoints?.length) {
                        finalPath1 = [
                          basePath1[0],
                          ...edgeWaypoints.sourceWaypoints,
                          basePath1[basePath1.length - 1],
                        ];
                      } else {
                        // No custom bends → make orthogonal
                        finalPath1 = makeOrthoPath(
                          basePath1[0],
                          basePath1[basePath1.length - 1],
                        );
                      }

                      if (edgeWaypoints?.targetWaypoints?.length) {
                        finalPath2 = [
                          basePath2[0],
                          ...edgeWaypoints.targetWaypoints,
                          basePath2[basePath2.length - 1],
                        ];
                      } else {
                        finalPath2 = makeOrthoPath(
                          basePath2[0],
                          basePath2[basePath2.length - 1],
                        );
                      }

                      return {
                        edge,
                        rel: edge.relationship,
                        t,
                        x,
                        y,
                        w: dw,
                        h: dh,
                        hasCustomPos,
                        path1: orthogonalisePath(finalPath1),
                        path2: orthogonalisePath(finalPath2),
                      };
                    });

                    // Resolve diamond collisions by sliding along path
                    for (let iter = 0; iter < 30; iter++) {
                      let moved = false;
                      for (let i = 0; i < diamonds.length; i++) {
                        for (let j = i + 1; j < diamonds.length; j++) {
                          const a = diamonds[i],
                            b = diamonds[j];
                          if (a.hasCustomPos || b.hasCustomPos) continue;

                          if (
                            Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 &&
                            Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 4
                          ) {
                            moved = true;
                            a.t = Math.max(0.15, Math.min(0.85, a.t - 0.04));
                            b.t = Math.max(0.15, Math.min(0.85, b.t + 0.04));
                            const pa = ptAtT(a.edge.points, a.t),
                              pb = ptAtT(b.edge.points, b.t);
                            a.x = pa.x;
                            a.y = pa.y;
                            b.x = pb.x;
                            b.y = pb.y;
                          }
                        }
                      }
                      if (!moved) break;
                    }

                    // Build a lookup: edgeId -> diamond {x, y}
                    const diamondMap = new Map<
                      string,
                      { x: number; y: number }
                    >();
                    diamonds.forEach((d) =>
                      diamondMap.set(d.edge.id, { x: d.x, y: d.y }),
                    );

                    // Helper: unit vector
                    const uv = (
                      a: { x: number; y: number },
                      b: { x: number; y: number },
                    ) => {
                      const dx = b.x - a.x,
                        dy = b.y - a.y,
                        l = Math.sqrt(dx * dx + dy * dy) || 1;
                      return { x: dx / l, y: dy / l };
                    };

                    return (
                      <>
                        {/* LAYER 1: Lines split at diamond — Entity -> Diamond -> Entity */}
                        {diamonds.map((d) => {
                          const { edge, rel, path1, path2 } = d;
                          const isEdgeSelected = selectedRelationId === rel.id;
                          const isEdgeFocused =
                            isEdgeSelected ||
                            (selectedEntityName
                              ? edge.sourceTable === selectedEntityName ||
                                edge.targetTable === selectedEntityName
                              : false);

                          let d1 = "";
                          let d2 = "";

                          if (lineStyle === "straight") {
                            d1 = path1
                              .map(
                                (p, idx) =>
                                  `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`,
                              )
                              .join(" ");
                            d2 = path2
                              .map(
                                (p, idx) =>
                                  `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`,
                              )
                              .join(" ");
                          } else if (lineStyle === "rounded") {
                            d1 = getRoundedPathD(path1, 8);
                            d2 = getRoundedPathD(path2, 8);
                          } else if (lineStyle === "curved") {
                            d1 = getRoundedPathD(path1, 32);
                            d2 = getRoundedPathD(path2, 32);
                          } else {
                            d1 = path1
                              .map(
                                (p, idx) =>
                                  `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`,
                              )
                              .join(" ");
                            d2 = path2
                              .map(
                                (p, idx) =>
                                  `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`,
                              )
                              .join(" ");
                          }

                          const edgeWaypts = customWaypoints[edge.id] || {
                            sourceWaypoints: [],
                            targetWaypoints: [],
                          };
                          const srcWpts = edgeWaypts.sourceWaypoints ?? [];
                          const tgtWpts = edgeWaypts.targetWaypoints ?? [];
                          const lineColor = isEdgeSelected
                            ? "#fbbf24"
                            : isEdgeFocused
                              ? "#60a5fa"
                              : "#2563eb";
                          const sw = isEdgeFocused ? 2.25 : 1.5;

                          return (
                            <g key={`lines_${edge.id}`}>
                              {/* Visible lines */}
                              <path
                                d={d1}
                                fill="none"
                                stroke={lineColor}
                                strokeWidth={sw}
                                className={
                                  isEdgeFocused
                                    ? "diagram-rel-line diagram-rel-line--active"
                                    : "diagram-rel-line"
                                }
                              />
                              <path
                                d={d2}
                                fill="none"
                                stroke={lineColor}
                                strokeWidth={sw}
                                className={
                                  isEdgeFocused
                                    ? "diagram-rel-line diagram-rel-line--active"
                                    : "diagram-rel-line"
                                }
                              />

                              {/* Hit zones: drag a segment to slide it orthogonally */}
                              {path1.slice(0, -1).map((p, si) => {
                                const p2seg = path1[si + 1];
                                const segIsH =
                                  Math.abs(p2seg.y - p.y) <
                                  Math.abs(p2seg.x - p.x);
                                return (
                                  <line
                                    key={`hit-src-${si}`}
                                    x1={p.x}
                                    y1={p.y}
                                    x2={p2seg.x}
                                    y2={p2seg.y}
                                    stroke="transparent"
                                    strokeWidth={12}
                                    style={{
                                      cursor: segIsH
                                        ? "ns-resize"
                                        : "ew-resize",
                                    }}
                                    onPointerDown={(e) =>
                                      handleOrthoSegmentPointerDown(
                                        e,
                                        edge.id,
                                        "source",
                                        path1,
                                        si,
                                        srcWpts,
                                      )
                                    }
                                  />
                                );
                              })}
                              {path2.slice(0, -1).map((p, si) => {
                                const p2seg = path2[si + 1];
                                const segIsH =
                                  Math.abs(p2seg.y - p.y) <
                                  Math.abs(p2seg.x - p.x);
                                return (
                                  <line
                                    key={`hit-tgt-${si}`}
                                    x1={p.x}
                                    y1={p.y}
                                    x2={p2seg.x}
                                    y2={p2seg.y}
                                    stroke="transparent"
                                    strokeWidth={12}
                                    style={{
                                      cursor: segIsH
                                        ? "ns-resize"
                                        : "ew-resize",
                                    }}
                                    onPointerDown={(e) =>
                                      handleOrthoSegmentPointerDown(
                                        e,
                                        edge.id,
                                        "target",
                                        path2,
                                        si,
                                        tgtWpts,
                                      )
                                    }
                                  />
                                );
                              })}

                              {/* Waypoint elbow handles — drag to adjust corner, double-click pair to remove */}
                              {isEdgeSelected &&
                                srcWpts.map((wp, wi) => (
                                  <circle
                                    key={`wp-src-${wi}`}
                                    cx={wp.x}
                                    cy={wp.y}
                                    r={4}
                                    fill={lineColor}
                                    stroke="#18181b"
                                    strokeWidth={1.5}
                                    style={{
                                      cursor: "move",
                                      pointerEvents: "all",
                                    }}
                                    onPointerDown={(e) =>
                                      handleWaypointPointerDown(
                                        e,
                                        edge.id,
                                        "source",
                                        wi,
                                        srcWpts,
                                      )
                                    }
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      // Remove waypoint pair (each elbow = 2 waypoints)
                                      const pairStart =
                                        wi % 2 === 0 ? wi : wi - 1;
                                      const newWpts = srcWpts.filter(
                                        (_, i) =>
                                          i !== pairStart &&
                                          i !== pairStart + 1,
                                      );
                                      updateWaypoints(
                                        edge.id,
                                        "source",
                                        newWpts,
                                      );
                                      saveHistory();
                                    }}
                                  />
                                ))}
                              {isEdgeSelected &&
                                tgtWpts.map((wp, wi) => (
                                  <circle
                                    key={`wp-tgt-${wi}`}
                                    cx={wp.x}
                                    cy={wp.y}
                                    r={4}
                                    fill={lineColor}
                                    stroke="#18181b"
                                    strokeWidth={1.5}
                                    style={{
                                      cursor: "move",
                                      pointerEvents: "all",
                                    }}
                                    onPointerDown={(e) =>
                                      handleWaypointPointerDown(
                                        e,
                                        edge.id,
                                        "target",
                                        wi,
                                        tgtWpts,
                                      )
                                    }
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      const pairStart =
                                        wi % 2 === 0 ? wi : wi - 1;
                                      const newWpts = tgtWpts.filter(
                                        (_, i) =>
                                          i !== pairStart &&
                                          i !== pairStart + 1,
                                      );
                                      updateWaypoints(
                                        edge.id,
                                        "target",
                                        newWpts,
                                      );
                                      saveHistory();
                                    }}
                                  />
                                ))}
                            </g>
                          );
                        })}

                        {/* LAYER 2: Entity boxes + orbiting attributes */}
                        {layout.nodes.map((node) => {
                          const table = node.table;
                          const cx = node.x + node.width / 2;
                          const cy = node.y + node.height / 2;
                          const N = table.columns.length;
                          const isEntitySelected =
                            selectedEntityName === table.name;
                          const foreignKeyColumns = new Set(
                            table.foreignKeys.flatMap((fk) =>
                              fk.columns.map((c) => c.toLowerCase()),
                            ),
                          );

                          const attrs = table.columns.map((col, idx) => {
                            const key = `${table.name}-${col.name}`;
                            const defaultAngle = (2 * Math.PI * idx) / N;
                            const defaultRadius = 85 + N * 5;
                            const pos = attrPositions[key] || {
                              angle: defaultAngle,
                              radius: defaultRadius,
                            };
                            const w_attr = Math.max(
                              60,
                              col.name.length * 8 + 16,
                            );
                            const h_attr = 30;
                            return {
                              col,
                              key,
                              width: w_attr,
                              height: h_attr,
                              angle: pos.angle,
                              radius: pos.radius,
                              x: cx + pos.radius * Math.cos(pos.angle),
                              y: cy + pos.radius * Math.sin(pos.angle),
                            };
                          });

                          resolveCollisions(attrs, cx, cy);

                          const selectedAttrInTable =
                            selectedAttr &&
                            selectedAttr.tableName === table.name
                              ? attrs.find(
                                  (a) => a.col.name === selectedAttr.colName,
                                )
                              : null;

                          return (
                            <g
                              key={node.id}
                              onPointerDown={(e) =>
                                handleEntityPointerDown(e, table.name)
                              }
                              onPointerMove={(e) => {
                                if (
                                  draggingEntity &&
                                  draggingEntity.tableName === table.name
                                ) {
                                  handleEntityDrag(e.clientX, e.clientY);
                                }
                              }}
                              onPointerUp={(e) => {
                                e.currentTarget.releasePointerCapture(
                                  e.pointerId,
                                );
                                setDraggingEntity(null);

                                if (hasDragged) {
                                  saveHistory();
                                } else {
                                  setSelectedRelationId(null);
                                  const wasSelected =
                                    wasSelectedBeforeDragRef.current.type ===
                                      "entity" &&
                                    wasSelectedBeforeDragRef.current.id ===
                                      table.name &&
                                    wasSelectedBeforeDragRef.current
                                      .wasSelected;
                                  if (wasSelected) {
                                    setSelectedEntityName(null);
                                    setSelectedAttr(null);
                                    setShowAttrControls(false);
                                    setEntityInfoCollapsed(true);
                                  } else {
                                    setSelectedEntityName(table.name);
                                    setSelectedAttr(null);
                                    setShowAttrControls(false);
                                    setEntityInfoCollapsed(false);
                                  }
                                }
                              }}
                            >
                              {selectedAttrInTable && (
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={selectedAttrInTable.radius}
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth={1}
                                  strokeDasharray="4,4"
                                  opacity={0.4}
                                />
                              )}

                              {attrs.map((item) => (
                                <line
                                  key={`line_${item.col.name}`}
                                  x1={cx}
                                  y1={cy}
                                  x2={item.x}
                                  y2={item.y}
                                  stroke={
                                    selectedAttr &&
                                    selectedAttr.tableName === table.name &&
                                    selectedAttr.colName === item.col.name
                                      ? "#2563eb"
                                      : "#52525b"
                                  }
                                  strokeWidth={
                                    selectedAttr &&
                                    selectedAttr.tableName === table.name &&
                                    selectedAttr.colName === item.col.name
                                      ? 1.5
                                      : 1
                                  }
                                  strokeDasharray={
                                    selectedAttr &&
                                    selectedAttr.tableName === table.name &&
                                    selectedAttr.colName === item.col.name
                                      ? "2,2"
                                      : "none"
                                  }
                                />
                              ))}

                              {attrs.map((item) => {
                                const isSelected =
                                  selectedAttr &&
                                  selectedAttr.tableName === table.name &&
                                  selectedAttr.colName === item.col.name;
                                const isForeignKey = foreignKeyColumns.has(
                                  item.col.name.toLowerCase(),
                                );
                                const highlightFk =
                                  isEntitySelected && isForeignKey;
                                return (
                                  <g
                                    key={`attr_g_${item.col.name}`}
                                    className="cursor-move group select-none origin-center"
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      setDraggingAttr({
                                        tableName: table.name,
                                        colName: item.col.name,
                                      });
                                      setSelectedAttr({
                                        tableName: table.name,
                                        colName: item.col.name,
                                      });
                                      setSelectedEntityName(null);
                                      setSelectedRelationId(null);
                                      (
                                        e.currentTarget as unknown as Element
                                      ).setPointerCapture?.(e.pointerId);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                  >
                                    <ellipse
                                      cx={item.x}
                                      cy={item.y}
                                      rx={item.width / 2}
                                      ry={item.height / 2}
                                      fill={
                                        item.col.isPrimaryKey
                                          ? "#18181b"
                                          : "#09090b"
                                      }
                                      stroke={
                                        isSelected
                                          ? "#fbbf24"
                                          : highlightFk
                                            ? "#f59e0b"
                                            : item.col.isPrimaryKey
                                              ? "#2563eb"
                                              : "#52525b"
                                      }
                                      strokeWidth={
                                        isSelected || highlightFk ? 2.5 : 1.5
                                      }
                                      className="transition duration-150 group-hover:stroke-blue-400"
                                    />
                                    <text
                                      x={item.x}
                                      y={item.y + 3.5}
                                      textAnchor="middle"
                                      fill={
                                        isSelected
                                          ? "#fbbf24"
                                          : highlightFk
                                            ? "#f59e0b"
                                            : item.col.isPrimaryKey
                                              ? "#fa5454"
                                              : "#a1a1aa"
                                      }
                                      textDecoration={
                                        item.col.isPrimaryKey
                                          ? "underline"
                                          : "none"
                                      }
                                      className={`text-[10px] ${item.col.isPrimaryKey ? "italic font-medium" : "font-normal"}`}
                                    >
                                      {item.col.name}
                                    </text>
                                  </g>
                                );
                              })}

                              <g
                                transform={`translate(${cx - 60}, ${cy - 22.5})`}
                                className="cursor-pointer"
                              >
                                <rect
                                  width={120}
                                  height={45}
                                  rx={6}
                                  fill="#18181b"
                                  stroke={
                                    isEntitySelected
                                      ? "#fbbf24"
                                      : table.isJunctionTable
                                        ? "#2563eb"
                                        : "#52525b"
                                  }
                                  strokeWidth={
                                    isEntitySelected
                                      ? 2.5
                                      : table.isJunctionTable
                                        ? 2
                                        : 1.5
                                  }
                                  className=""
                                />
                                <text
                                  x={60}
                                  y={27.5}
                                  textAnchor="middle"
                                  fill="#fafafa"
                                  className="text-xs font-medium tracking-wide"
                                >
                                  {table.name}
                                </text>
                                {table.isJunctionTable && (
                                  <g transform="translate(35, -16)">
                                    <rect
                                      width={50}
                                      height={12}
                                      rx={3}
                                      fill="#2563eb"
                                    />
                                    <text
                                      x={25}
                                      y={8.5}
                                      textAnchor="middle"
                                      fill="#ffffff"
                                      className="text-[7px] font-medium uppercase tracking-wider"
                                    >
                                      Junction
                                    </text>
                                  </g>
                                )}
                              </g>
                            </g>
                          );
                        })}

                        {/* LAYER 3: Diamonds + crow's foot / labels â€” on top */}
                        {diamonds.map((d) => {
                          const { edge, rel, x: dmX, y: dmY } = d;
                          const label = rel.verb
                            ? rel.verb
                            : getRelationshipLabel(
                                rel.sourceTable,
                                rel.targetTable,
                              );
                          const cleanLabel = label
                            .replace(/<div>/g, "\n")
                            .replace(/<\/div>/g, "");
                          const lines = cleanLabel.split("\n");
                          const hw = diamondSize / 2;
                          const hh = (diamondSize * 0.375) / 2;
                          const diamondPts = `${dmX},${dmY - hh} ${dmX + hw},${dmY} ${dmX},${dmY + hh} ${dmX - hw},${dmY}`;

                          const srcPt = edge.points[0];
                          const srcPt2 = edge.points[1] ?? srcPt;
                          const tgtPt = edge.points[edge.points.length - 1];
                          const tgtPt2 =
                            edge.points[edge.points.length - 2] ?? tgtPt;
                          const sourceCardinality =
                            rel.sourceCardinality ?? "one";
                          const targetCardinality =
                            rel.targetCardinality ??
                            (rel.type === "1:1" ? "one" : "many");
                          const srcLabel =
                            sourceCardinality === "many" ? "N" : "1";
                          const tgtLabel =
                            targetCardinality === "many" ? "N" : "1";

                          const sn = layout.nodes.find(
                            (n) => n.id === rel.sourceTable,
                          );
                          const tn = layout.nodes.find(
                            (n) => n.id === rel.targetTable,
                          );
                          const srcCenter = sn
                            ? {
                                x: sn.x + sn.width / 2,
                                y: sn.y + sn.height / 2,
                              }
                            : srcPt;
                          const tgtCenter = tn
                            ? {
                                x: tn.x + tn.width / 2,
                                y: tn.y + tn.height / 2,
                              }
                            : tgtPt;
                          const isDiamondSelected =
                            selectedRelationId === rel.id;
                          const isDiamondFocused =
                            isDiamondSelected ||
                            (selectedEntityName
                              ? edge.sourceTable === selectedEntityName ||
                                edge.targetTable === selectedEntityName
                              : false);

                          const { path1, path2 } = d;

                          const uSrc = uv(
                            srcCenter,
                            path1[1] ?? { x: dmX, y: dmY },
                          );
                          const uTgt = uv(
                            tgtCenter,
                            path2[path2.length - 2] ?? { x: dmX, y: dmY },
                          );

                          const wSrc = 240;
                          const hSrc = sn
                            ? 50 + sn.table.columns.length * 26
                            : 90;
                          const wTgt = 240;
                          const hTgt = tn
                            ? 50 + tn.table.columns.length * 26
                            : 90;

                          const srcBorder = getBorderPoint(
                            srcCenter,
                            path1[1] ?? { x: dmX, y: dmY },
                            wSrc,
                            hSrc,
                          );
                          const tgtBorder = getBorderPoint(
                            tgtCenter,
                            path2[path2.length - 2] ?? { x: dmX, y: dmY },
                            wTgt,
                            hTgt,
                          );

                          return (
                            <g key={`overlay_${edge.id}`}>
                              {relNotation === "crowsfoot" ? (
                                <>
                                  {/* Source-side cardinality marker */}
                                  {sourceCardinality === "one"
                                    ? (() => {
                                        const u = uSrc,
                                          px = -u.y,
                                          py = u.x;
                                        const bx = srcBorder.x + u.x * 6,
                                          by = srcBorder.y + u.y * 6;
                                        return (
                                          <line
                                            x1={bx + px * 5}
                                            y1={by + py * 5}
                                            x2={bx - px * 5}
                                            y2={by - py * 5}
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            strokeLinecap="round"
                                          />
                                        );
                                      })()
                                    : (() => {
                                        const u = uSrc,
                                          px = -u.y,
                                          py = u.x;
                                        const near = {
                                          x: srcBorder.x + u.x * 1,
                                          y: srcBorder.y + u.y * 1,
                                        };
                                        const far = {
                                          x: srcBorder.x + u.x * 9,
                                          y: srcBorder.y + u.y * 9,
                                        };
                                        return (
                                          <g>
                                            <line
                                              x1={near.x + px * 5}
                                              y1={near.y + py * 5}
                                              x2={far.x}
                                              y2={far.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={near.x}
                                              y1={near.y}
                                              x2={far.x}
                                              y2={far.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={near.x - px * 5}
                                              y1={near.y - py * 5}
                                              x2={far.x}
                                              y2={far.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                          </g>
                                        );
                                      })()}

                                  {/* Target side marker: single tick for 1:1, crow's foot for many */}
                                  {targetCardinality === "one"
                                    ? (() => {
                                        const u = uTgt,
                                          px = -u.y,
                                          py = u.x;
                                        const bx = tgtBorder.x + u.x * 6,
                                          by = tgtBorder.y + u.y * 6;
                                        return (
                                          <line
                                            x1={bx + px * 5}
                                            y1={by + py * 5}
                                            x2={bx - px * 5}
                                            y2={by - py * 5}
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            strokeLinecap="round"
                                          />
                                        );
                                      })()
                                    : (() => {
                                        const u = uTgt,
                                          px = -u.y,
                                          py = u.x;
                                        const near = {
                                          x: tgtBorder.x + u.x * 1,
                                          y: tgtBorder.y + u.y * 1,
                                        };
                                        const far = {
                                          x: tgtBorder.x + u.x * 9,
                                          y: tgtBorder.y + u.y * 9,
                                        };
                                        return (
                                          <g>
                                            <line
                                              x1={near.x + px * 5}
                                              y1={near.y + py * 5}
                                              x2={far.x}
                                              y2={far.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={near.x}
                                              y1={near.y}
                                              x2={far.x}
                                              y2={far.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={near.x - px * 5}
                                              y1={near.y - py * 5}
                                              x2={far.x}
                                              y2={far.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                          </g>
                                        );
                                      })()}
                                </>
                              ) : (
                                <>
                                  {/* Text labels: positioned 36px back along the line */}
                                  {(() => {
                                    const u = uSrc,
                                      px = -u.y,
                                      py = u.x;
                                    const lx = srcBorder.x + u.x * 20 + px * 8,
                                      ly = srcBorder.y + u.y * 20 + py * 8;
                                    return (
                                      <g>
                                        <rect
                                          x={lx - 7}
                                          y={ly - 7}
                                          width={14}
                                          height={14}
                                          rx={4}
                                          fill="#09090b"
                                          stroke="#6366f1"
                                          strokeWidth={1}
                                        />
                                        <text
                                          x={lx}
                                          y={ly}
                                          textAnchor="middle"
                                          dominantBaseline="middle"
                                          fill="#a5b4fc"
                                          className="pointer-events-none"
                                          style={{
                                            fontFamily: "monospace",
                                            fontSize: "10px",
                                            fontWeight: 700,
                                          }}
                                        >
                                          {srcLabel}
                                        </text>
                                      </g>
                                    );
                                  })()}
                                  {(() => {
                                    const u = uTgt,
                                      px = -u.y,
                                      py = u.x;
                                    const lx = tgtBorder.x + u.x * 20 + px * 8,
                                      ly = tgtBorder.y + u.y * 20 + py * 8;
                                    return (
                                      <g>
                                        <rect
                                          x={lx - 7}
                                          y={ly - 7}
                                          width={14}
                                          height={14}
                                          rx={4}
                                          fill="#09090b"
                                          stroke="#6366f1"
                                          strokeWidth={1}
                                        />
                                        <text
                                          x={lx}
                                          y={ly}
                                          textAnchor="middle"
                                          dominantBaseline="middle"
                                          fill="#a5b4fc"
                                          className="pointer-events-none"
                                          style={{
                                            fontFamily: "monospace",
                                            fontSize: "10px",
                                            fontWeight: 700,
                                          }}
                                        >
                                          {tgtLabel}
                                        </text>
                                      </g>
                                    );
                                  })()}
                                </>
                              )}

                              {/* Diamond — connected to lines */}
                              <g
                                className="cursor-pointer"
                                onPointerDown={(e) =>
                                  handleRelPointerDown(e, rel.id, dmX, dmY)
                                }
                                onPointerMove={(e) => {
                                  if (
                                    draggingRel &&
                                    draggingRel.relId === rel.id
                                  ) {
                                    handleRelDrag(e.clientX, e.clientY);
                                  }
                                }}
                                onPointerUp={(e) => {
                                  e.currentTarget.releasePointerCapture(
                                    e.pointerId,
                                  );
                                  setDraggingRel(null);
                                  if (hasDragged) {
                                    saveHistory();
                                  } else {
                                    setSelectedEntityName(null);
                                    setSelectedAttr(null);
                                    const wasSelected =
                                      wasSelectedBeforeDragRef.current.type ===
                                        "relation" &&
                                      wasSelectedBeforeDragRef.current.id ===
                                        rel.id &&
                                      wasSelectedBeforeDragRef.current
                                        .wasSelected;
                                    if (wasSelected) {
                                      setSelectedRelationId(null);
                                    } else {
                                      setSelectedRelationId(rel.id);
                                      focusRelationOnCanvas(rel.id);
                                    }
                                  }
                                }}
                              >
                                <polygon
                                  points={diamondPts}
                                  fill="#18181b"
                                  stroke={
                                    isDiamondSelected
                                      ? "#fbbf24"
                                      : isDiamondFocused
                                        ? "#60a5fa"
                                        : "#2563eb"
                                  }
                                  strokeWidth={
                                    isDiamondSelected
                                      ? 2.5
                                      : isDiamondFocused
                                        ? 2
                                        : 1.5
                                  }
                                />
                                {lines.length > 1 ? (
                                  <text
                                    x={dmX}
                                    y={dmY - 3}
                                    textAnchor="middle"
                                    fill={
                                      isDiamondSelected
                                        ? "#fbbf24"
                                        : isDiamondFocused
                                          ? "#60a5fa"
                                          : "#2563eb"
                                    }
                                    className="text-[8px] font-medium pointer-events-none"
                                  >
                                    <tspan x={dmX} dy="0">
                                      {lines[0]}
                                    </tspan>
                                    <tspan x={dmX} dy="8">
                                      {lines[1].replace(/^\/\s*/, "/ ")}
                                    </tspan>
                                  </text>
                                ) : (
                                  <text
                                    x={dmX}
                                    y={dmY + 3}
                                    textAnchor="middle"
                                    fill={
                                      isDiamondSelected
                                        ? "#fbbf24"
                                        : isDiamondFocused
                                          ? "#60a5fa"
                                          : "#2563eb"
                                    }
                                    className="text-[9px] font-medium pointer-events-none"
                                  >
                                    {lines[0]}
                                  </text>
                                )}
                              </g>
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                {/* B1. RENDER MODE: LRS SCHEMA */}
                {mode === "lrs" && layout && (
                  <>
                    {/* 1. Draw Connectors (Orthogonal lines) */}
                    {layout.edges.map((edge) => {
                      const rel = edge.relationship;
                      const isEdgeFocused = selectedEntityName
                        ? edge.sourceTable === selectedEntityName ||
                          edge.targetTable === selectedEntityName
                        : false;
                      let pathD = "";
                      if (lineStyle === "straight") {
                        const pts = edge.points;
                        if (pts.length > 0) {
                          pathD = `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
                        }
                      } else if (lineStyle === "rounded") {
                        pathD = getRoundedPathD(edge.points, 8);
                      } else if (lineStyle === "curved") {
                        pathD = getRoundedPathD(edge.points, 32);
                      } else {
                        edge.points.forEach((pt, i) => {
                          pathD += `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y} `;
                        });
                      }

                      return (
                        <g key={edge.id}>
                          <path
                            d={pathD}
                            fill="none"
                            stroke={isEdgeFocused ? "#60a5fa" : "#2563eb"}
                            strokeWidth={isEdgeFocused ? 2.25 : 1.5}
                            markerStart="url(#one-marker)"
                            markerEnd={
                              rel.type === "1:1"
                                ? "url(#one-one-marker)"
                                : "url(#many-marker)"
                            }
                            className="diagram-rel-line"
                          />
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
                          <rect
                            x={tx}
                            y={ty}
                            width={tWidth}
                            height={tHeight}
                            rx={8}
                            fill="#18181b"
                            stroke="#52525b"
                            strokeWidth={1.5}
                          />
                          {/* Header */}
                          <path
                            d={`M ${tx} ${ty + 8} A 8 8 0 0 1 ${tx + 8} ${ty} L ${tx + tWidth - 8} ${ty} A 8 8 0 0 1 ${tx + tWidth} ${ty + 8} L ${tx + tWidth} ${ty + 42} L ${tx} ${ty + 42} Z`}
                            fill="#09090b"
                          />
                          <text
                            x={cx}
                            y={ty + 26}
                            textAnchor="middle"
                            fill="#fafafa"
                            className="text-xs font-semibold font-mono tracking-tight"
                          >
                            {table.name}
                          </text>

                          {/* Column Rows */}
                          {table.columns.map((col, idx) => {
                            const ry = ty + 42 + idx * 26;
                            const isFk = table.foreignKeys.some((fk) =>
                              fk.columns
                                .map((c) => c.toLowerCase())
                                .includes(col.name.toLowerCase()),
                            );

                            return (
                              <g key={col.name}>
                                <rect
                                  x={tx}
                                  y={ry}
                                  width={tWidth}
                                  height={26}
                                  fill={
                                    idx % 2 === 0
                                      ? "rgba(39,39,42,0.15)"
                                      : "transparent"
                                  }
                                />
                                <text
                                  x={tx + 12}
                                  y={ry + 17}
                                  fill="#ffffff"
                                  className={`text-xs ${col.isPrimaryKey ? "italic font-medium font-mono" : "font-mono font-normal"}`}
                                >
                                  {formatLrsColumn(
                                    col.name,
                                    col.isPrimaryKey,
                                    isFk,
                                    lrsKeyNotation,
                                  )}{" "}
                                  <tspan fill="#ffffff" className="text-[9px]">
                                    ({col.type})
                                  </tspan>
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
                  </>
                )}

                {/* B1.5. RENDER MODE: CLASS DIAGRAM */}
                {mode === "class" && layout && (
                  <>
                    {/* 1. Draw Connectors (Orthogonal lines) */}
                    {layout.edges.map((edge) => {
                      const rel = edge.relationship;
                      const isEdgeFocused = selectedEntityName
                        ? edge.sourceTable === selectedEntityName ||
                          edge.targetTable === selectedEntityName
                        : false;
                      let pathD = "";
                      if (lineStyle === "straight") {
                        const pts = edge.points;
                        if (pts.length > 0) {
                          pathD = `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
                        }
                      } else if (lineStyle === "rounded") {
                        pathD = getRoundedPathD(edge.points, 8);
                      } else if (lineStyle === "curved") {
                        pathD = getRoundedPathD(edge.points, 32);
                      } else {
                        edge.points.forEach((pt, i) => {
                          pathD += `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y} `;
                        });
                      }

                      return (
                        <g key={edge.id}>
                          <path
                            d={pathD}
                            fill="none"
                            stroke={isEdgeFocused ? "#60a5fa" : "#3b82f6"}
                            strokeWidth={isEdgeFocused ? 2.25 : 1.5}
                            markerStart={
                              relNotation === "crowsfoot"
                                ? "url(#one-marker)"
                                : undefined
                            }
                            markerEnd={
                              relNotation === "crowsfoot"
                                ? rel.type === "1:1"
                                  ? "url(#one-one-marker)"
                                  : "url(#many-marker)"
                                : undefined
                            }
                            className="diagram-rel-line"
                          />
                          {relNotation === "label" && (
                            <>
                              {/* Start point label (Source) */}
                              <text
                                x={edge.points[0].x + 10}
                                y={edge.points[0].y - 5}
                                fill="#a1a1aa"
                                className="text-[9px] font-semibold font-mono"
                              >
                                1
                              </text>
                              {/* End point label (Target) */}
                              <text
                                x={edge.points[edge.points.length - 1].x - 15}
                                y={edge.points[edge.points.length - 1].y - 5}
                                fill="#a1a1aa"
                                className="text-[9px] font-semibold font-mono"
                              >
                                {rel.type === "1:1" ? "1" : "*"}
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}

                    {/* 2. Draw Class Boxes */}
                    {layout.nodes.map((node) => {
                      const table = node.table;
                      const cx = node.x + node.width / 2;
                      const cy = node.y + node.height / 2;
                      const tWidth = 240;

                      const methods = classMethods[table.name] || [
                        `+ insert(input: Data): void`,
                        `+ delete(id: int): boolean`,
                        `+ findById(id: int): Object`,
                      ];

                      const headerHeight = 40;
                      const attrsHeight = table.columns.length * 20 + 12;
                      const methodsHeight =
                        Math.max(1, methods.length) * 20 + 12;
                      const tHeight =
                        headerHeight + attrsHeight + methodsHeight;

                      const tx = cx - 120;
                      const ty = cy - tHeight / 2;

                      return (
                        <g
                          key={node.id}
                          onClick={() => setSelectedEntityName(table.name)}
                          className="cursor-pointer"
                        >
                          {/* Outer Class Container */}
                          <rect
                            x={tx}
                            y={ty}
                            width={tWidth}
                            height={tHeight}
                            rx={6}
                            fill="#18181b"
                            stroke={
                              selectedEntityName === table.name
                                ? "#3b82f6"
                                : "#3f3f46"
                            }
                            strokeWidth={
                              selectedEntityName === table.name ? 2.5 : 1.5
                            }
                          />

                          {/* Class Name Header */}
                          <text
                            x={cx}
                            y={ty + 24}
                            textAnchor="middle"
                            fill="#ffffff"
                            className="text-xs font-bold font-mono tracking-wide"
                          >
                            {table.name}
                          </text>

                          {/* First Separator Line (under header) */}
                          <line
                            x1={tx}
                            y1={ty + headerHeight}
                            x2={tx + tWidth}
                            y2={ty + headerHeight}
                            stroke="#3f3f46"
                            strokeWidth={1.5}
                          />

                          {/* Attributes Compartment */}
                          {table.columns.map((col, idx) => {
                            const vis = col.isPrimaryKey ? "+" : "-";
                            const ry = ty + headerHeight + 8 + idx * 20;
                            return (
                              <text
                                key={col.name}
                                x={tx + 12}
                                y={ry + 12}
                                fill="#ffffff"
                                className="text-[11px] font-mono"
                              >
                                {vis} {col.name}: {col.type.toLowerCase()}
                              </text>
                            );
                          })}

                          {/* Second Separator Line (under attributes) */}
                          <line
                            x1={tx}
                            y1={ty + headerHeight + attrsHeight}
                            x2={tx + tWidth}
                            y2={ty + headerHeight + attrsHeight}
                            stroke="#3f3f46"
                            strokeWidth={1.5}
                          />

                          {/* Methods Compartment */}
                          {methods.map((method, idx) => {
                            const ry =
                              ty + headerHeight + attrsHeight + 8 + idx * 20;
                            return (
                              <text
                                key={idx}
                                x={tx + 12}
                                y={ry + 12}
                                fill="#ffffff"
                                className="text-[11px] font-mono font-medium"
                              >
                                {method}
                              </text>
                            );
                          })}
                        </g>
                      );
                    })}
                  </>
                )}

                {/* B2. RENDER MODE: ERD âž” LRS HYBRID TRANSFORMATION */}
                {mode === "transformation" &&
                  layout &&
                  (() => {
                    const dw = diamondSize;
                    const dh = diamondSize * 0.375;

                    const diamonds = layout.edges.map((edge) => {
                      const customPos = relPositions[edge.relationship.id];
                      let x = 0;
                      let y = 0;
                      let t = 0.5;
                      let hasCustomPos = false;

                      if (customPos) {
                        x = customPos.x;
                        y = customPos.y;
                        hasCustomPos = true;
                      } else {
                        const p = ptAtT(edge.points, 0.5);
                        x = p.x;
                        y = p.y;
                      }

                      return {
                        edge,
                        rel: edge.relationship,
                        t,
                        x,
                        y,
                        w: dw,
                        h: dh,
                        hasCustomPos,
                      };
                    });

                    // Resolve diamond collisions by sliding along path
                    for (let iter = 0; iter < 30; iter++) {
                      let moved = false;
                      for (let i = 0; i < diamonds.length; i++) {
                        for (let j = i + 1; j < diamonds.length; j++) {
                          const a = diamonds[i],
                            b = diamonds[j];
                          if (a.hasCustomPos || b.hasCustomPos) continue;

                          if (
                            Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 &&
                            Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 4
                          ) {
                            moved = true;
                            a.t = Math.max(0.15, Math.min(0.85, a.t - 0.04));
                            b.t = Math.max(0.15, Math.min(0.85, b.t + 0.04));
                            const pa = ptAtT(a.edge.points, a.t),
                              pb = ptAtT(b.edge.points, b.t);
                            a.x = pa.x;
                            a.y = pa.y;
                            b.x = pb.x;
                            b.y = pb.y;
                          }
                        }
                      }
                      if (!moved) break;
                    }

                    const getBorderPoint = (
                      center: { x: number; y: number },
                      toward: { x: number; y: number },
                      w = 160,
                      h = 100,
                    ) => {
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
                        y: center.y + dy * scale,
                      };
                    };

                    const uv = (
                      a: { x: number; y: number },
                      b: { x: number; y: number },
                    ) => {
                      const dx = b.x - a.x,
                        dy = b.y - a.y,
                        l = Math.sqrt(dx * dx + dy * dy) || 1;
                      return { x: dx / l, y: dy / l };
                    };

                    const diamondMap = new Map<
                      string,
                      { x: number; y: number }
                    >();
                    diamonds.forEach((d) =>
                      diamondMap.set(d.edge.id, { x: d.x, y: d.y }),
                    );

                    const getSplitPaths = (
                      pts: { x: number; y: number }[],
                      t: number,
                      dm: { x: number; y: number },
                      edgeId: string,
                    ) => {
                      const total = polyLen(pts);
                      const target = t * total;

                      let current = 0;
                      let basePath1: { x: number; y: number }[] = [];
                      let basePath2: { x: number; y: number }[] = [];

                      basePath1.push(pts[0]);
                      let dmPlaced = false;

                      for (let i = 1; i < pts.length; i++) {
                        const p1 = pts[i - 1];
                        const p2 = pts[i];
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const seg = Math.sqrt(dx * dx + dy * dy);

                        if (!dmPlaced) {
                          if (current + seg < target) {
                            basePath1.push(p2);
                          } else {
                            basePath1.push(dm);
                            basePath2.push(dm);
                            basePath2.push(p2);
                            dmPlaced = true;
                          }
                        } else {
                          basePath2.push(p2);
                        }
                        current += seg;
                      }

                      if (!dmPlaced) {
                        basePath1.push(dm);
                        basePath2.push(dm);
                        basePath2.push(pts[pts.length - 1]);
                      }

                      // Inject custom waypoints
                      const edgeWayptsTrans = customWaypoints[edgeId];
                      const path1 = edgeWayptsTrans?.sourceWaypoints?.length
                        ? [
                            basePath1[0],
                            ...edgeWayptsTrans.sourceWaypoints,
                            basePath1[basePath1.length - 1],
                          ]
                        : basePath1;
                      const path2 = edgeWayptsTrans?.targetWaypoints?.length
                        ? [
                            basePath2[0],
                            ...edgeWayptsTrans.targetWaypoints,
                            basePath2[basePath2.length - 1],
                          ]
                        : basePath2;

                      let d1 = "";
                      let d2 = "";

                      if (lineStyle === "straight") {
                        d1 = `M ${pts[0].x} ${pts[0].y} L ${dm.x} ${dm.y}`;
                        d2 = `M ${dm.x} ${dm.y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
                      } else if (lineStyle === "rounded") {
                        d1 = getRoundedPathD(path1, 8);
                        d2 = getRoundedPathD(path2, 8);
                      } else if (lineStyle === "curved") {
                        d1 = getRoundedPathD(path1, 32);
                        d2 = getRoundedPathD(path2, 32);
                      } else {
                        d1 = path1
                          .map(
                            (p, idx) =>
                              `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`,
                          )
                          .join(" ");
                        d2 = path2
                          .map(
                            (p, idx) =>
                              `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`,
                          )
                          .join(" ");
                      }

                      return { d1, d2, path1, path2 };
                    };

                    return (
                      <>
                        {/* 1. Connectors (Lines) */}
                        {layout.edges.map((edge) => {
                          const isEdgeSelected =
                            selectedRelationId === edge.relationship.id;
                          const isEdgeFocused =
                            isEdgeSelected ||
                            (selectedEntityName
                              ? edge.sourceTable === selectedEntityName ||
                                edge.targetTable === selectedEntityName
                              : false);
                          const dm = diamondMap.get(edge.id)!;
                          const { d1, d2, path1, path2 } = getSplitPaths(
                            edge.points,
                            0.5,
                            dm,
                            edge.id,
                          );

                          let childTable = edge.relationship.targetTable;
                          if (
                            edge.relationship.sourceCardinality === "many" &&
                            edge.relationship.targetCardinality !== "many"
                          ) {
                            childTable = edge.relationship.sourceTable;
                          }
                          const colors = getTableColors(childTable);
                          const lineColor = isEdgeSelected
                            ? "#fbbf24"
                            : isEdgeFocused
                              ? "#60a5fa"
                              : colors.stroke;
                          const sw = isEdgeFocused ? 2.25 : 1.5;

                          const edgeWayptsTrans2 = customWaypoints[edge.id] || {
                            sourceWaypoints: [],
                            targetWaypoints: [],
                          };
                          const srcWptsTrans =
                            edgeWayptsTrans2.sourceWaypoints ?? [];
                          const tgtWptsTrans =
                            edgeWayptsTrans2.targetWaypoints ?? [];

                          return (
                            <g key={`trans_edge_${edge.id}`}>
                              <path
                                d={d1}
                                fill="none"
                                stroke={lineColor}
                                strokeWidth={sw}
                                className="diagram-rel-line"
                              />
                              <path
                                d={d2}
                                fill="none"
                                stroke={lineColor}
                                strokeWidth={sw}
                                className="diagram-rel-line"
                              />
                              {/* Hit zones: drag a segment to slide it orthogonally */}
                              {path1.slice(0, -1).map((p, si) => {
                                const p2t = path1[si + 1];
                                const segIsH =
                                  Math.abs(p2t.y - p.y) < Math.abs(p2t.x - p.x);
                                return (
                                  <line
                                    key={`hit-trans-src-${si}`}
                                    x1={p.x}
                                    y1={p.y}
                                    x2={p2t.x}
                                    y2={p2t.y}
                                    stroke="transparent"
                                    strokeWidth={12}
                                    style={{
                                      cursor: segIsH
                                        ? "ns-resize"
                                        : "ew-resize",
                                    }}
                                    onPointerDown={(e) =>
                                      handleOrthoSegmentPointerDown(
                                        e,
                                        edge.id,
                                        "source",
                                        path1,
                                        si,
                                        srcWptsTrans,
                                      )
                                    }
                                  />
                                );
                              })}
                              {path2.slice(0, -1).map((p, si) => {
                                const p2t = path2[si + 1];
                                const segIsH =
                                  Math.abs(p2t.y - p.y) < Math.abs(p2t.x - p.x);
                                return (
                                  <line
                                    key={`hit-trans-tgt-${si}`}
                                    x1={p.x}
                                    y1={p.y}
                                    x2={p2t.x}
                                    y2={p2t.y}
                                    stroke="transparent"
                                    strokeWidth={12}
                                    style={{
                                      cursor: segIsH
                                        ? "ns-resize"
                                        : "ew-resize",
                                    }}
                                    onPointerDown={(e) =>
                                      handleOrthoSegmentPointerDown(
                                        e,
                                        edge.id,
                                        "target",
                                        path2,
                                        si,
                                        tgtWptsTrans,
                                      )
                                    }
                                  />
                                );
                              })}
                              {/* Waypoint elbow handles — drag to adjust corner, double-click to remove */}
                              {isEdgeSelected &&
                                srcWptsTrans.map((wp, wi) => (
                                  <circle
                                    key={`wp-trans-src-${wi}`}
                                    cx={wp.x}
                                    cy={wp.y}
                                    r={4}
                                    fill={lineColor}
                                    stroke="#18181b"
                                    strokeWidth={1.5}
                                    style={{
                                      cursor: "move",
                                      pointerEvents: "all",
                                    }}
                                    onPointerDown={(e) =>
                                      handleWaypointPointerDown(
                                        e,
                                        edge.id,
                                        "source",
                                        wi,
                                        srcWptsTrans,
                                      )
                                    }
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      const pairStart =
                                        wi % 2 === 0 ? wi : wi - 1;
                                      const newWpts = srcWptsTrans.filter(
                                        (_, i) =>
                                          i !== pairStart &&
                                          i !== pairStart + 1,
                                      );
                                      updateWaypoints(
                                        edge.id,
                                        "source",
                                        newWpts,
                                      );
                                      saveHistory();
                                    }}
                                  />
                                ))}
                              {isEdgeSelected &&
                                tgtWptsTrans.map((wp, wi) => (
                                  <circle
                                    key={`wp-trans-tgt-${wi}`}
                                    cx={wp.x}
                                    cy={wp.y}
                                    r={4}
                                    fill={lineColor}
                                    stroke="#18181b"
                                    strokeWidth={1.5}
                                    style={{
                                      cursor: "move",
                                      pointerEvents: "all",
                                    }}
                                    onPointerDown={(e) =>
                                      handleWaypointPointerDown(
                                        e,
                                        edge.id,
                                        "target",
                                        wi,
                                        tgtWptsTrans,
                                      )
                                    }
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      const pairStart =
                                        wi % 2 === 0 ? wi : wi - 1;
                                      const newWpts = tgtWptsTrans.filter(
                                        (_, i) =>
                                          i !== pairStart &&
                                          i !== pairStart + 1,
                                      );
                                      updateWaypoints(
                                        edge.id,
                                        "target",
                                        newWpts,
                                      );
                                      saveHistory();
                                    }}
                                  />
                                ))}
                            </g>
                          );
                        })}

                        {/* 1.5. Dashed boxes (sent to back/drawn first) */}
                        {(() => {
                          const childTables = new Set<string>();
                          const relToChildTable = new Map<string, string>();
                          diamonds.forEach((d) => {
                            const rel = d.rel;
                            let childTable = rel.targetTable;
                            if (
                              rel.sourceCardinality === "many" &&
                              rel.targetCardinality !== "many"
                            ) {
                              childTable = rel.sourceTable;
                            }
                            childTables.add(childTable);
                            relToChildTable.set(rel.id, childTable);
                          });

                          return (
                            <>
                              {/* 1.5a. Weak Entity identifying relationship dashed boxes */}
                              {diamonds.map((d) => {
                                const rel = d.rel;
                                const diamondWidth = 120;
                                const diamondHeight = 60;
                                const dx = d.x - diamondWidth / 2;
                                const dy = d.y - diamondHeight / 2;

                                const childTable = relToChildTable.get(rel.id)!;
                                const sn = layout.nodes.find(
                                  (n) => n.id === childTable,
                                );
                                if (!sn) return null;

                                const numCols = sn.table.columns.length;
                                const boxWidth = 160;
                                const boxHeight = 40 + 15 + numCols * 20 + 15;
                                const cx = sn.x + sn.width / 2;
                                const cy = sn.y + sn.height / 2;
                                const bx = cx - boxWidth / 2;
                                const by = cy - boxHeight / 2;

                                const minX = Math.min(bx, dx) - 15;
                                const minY = Math.min(by, dy) - 15;
                                const maxX =
                                  Math.max(bx + boxWidth, dx + diamondWidth) +
                                  15;
                                const maxY =
                                  Math.max(by + boxHeight, dy + diamondHeight) +
                                  15;
                                const w = maxX - minX;
                                const h = maxY - minY;

                                const colors = getTableColors(childTable);

                                return (
                                  <rect
                                    key={`trans_dash_rel_${rel.id}`}
                                    x={minX}
                                    y={minY}
                                    width={w}
                                    height={h}
                                    fill="none"
                                    stroke={colors.stroke}
                                    strokeWidth={1.5}
                                    strokeDasharray="6,6"
                                    rx={8}
                                  />
                                );
                              })}

                              {/* 1.5b. Regular Entity dashed boxes (only wraps attributes and entity header) */}
                              {layout.nodes.map((node) => {
                                const table = node.table;
                                if (childTables.has(table.name)) return null;

                                const numCols = table.columns.length;
                                const boxWidth = 160;
                                const boxHeight = 40 + 15 + numCols * 20 + 15;
                                const cx = node.x + node.width / 2;
                                const cy = node.y + node.height / 2;
                                const bx = cx - boxWidth / 2;
                                const by = cy - boxHeight / 2;

                                const minX = bx - 10;
                                const minY = by - 10;
                                const w = boxWidth + 20;
                                const h = boxHeight + 20;

                                const colors = getTableColors(table.name);

                                return (
                                  <rect
                                    key={`trans_dash_table_${table.name}`}
                                    x={minX}
                                    y={minY}
                                    width={w}
                                    height={h}
                                    fill="none"
                                    stroke={colors.stroke}
                                    strokeWidth={1.5}
                                    strokeDasharray="6,6"
                                    rx={8}
                                  />
                                );
                              })}
                            </>
                          );
                        })()}

                        {/* 2. Solid Cards for Entities */}
                        {layout.nodes.map((node) => {
                          const table = node.table;
                          const numCols = table.columns.length;
                          const boxWidth = 160;
                          const boxHeight = 40 + 15 + numCols * 20 + 15;
                          const cx = node.x + node.width / 2;
                          const cy = node.y + node.height / 2;
                          const bx = cx - boxWidth / 2;
                          const by = cy - boxHeight / 2;

                          const isEntitySelected =
                            selectedEntityName === table.name;
                          const colors = getTableColors(table.name);

                          return (
                            <g
                              key={`trans_node_${node.id}`}
                              className="cursor-pointer"
                              onClick={() => setSelectedEntityName(table.name)}
                            >
                              {/* Outer Solid Container */}
                              <rect
                                x={bx}
                                y={by}
                                width={boxWidth}
                                height={boxHeight}
                                fill={colors.fill}
                                stroke={
                                  isEntitySelected ? "#60a5fa" : colors.stroke
                                }
                                strokeWidth={isEntitySelected ? 2 : 1}
                                rx={4}
                              />
                              {/* Entity Header Rounded Rectangle */}
                              <rect
                                x={bx + 10}
                                y={by + 10}
                                width={boxWidth - 20}
                                height={40}
                                fill={colors.stroke}
                                stroke={colors.border || colors.stroke}
                                strokeWidth={1.5}
                                rx={6}
                              />
                              <text
                                x={bx + boxWidth / 2}
                                y={by + 34}
                                textAnchor="middle"
                                fill="#ffffff"
                                className="text-xs font-semibold tracking-wide font-mono"
                              >
                                {table.name}
                              </text>

                              {/* Attributes Text Block stacked vertically */}
                              {table.columns.map((col, idx) => {
                                const isFk = table.foreignKeys.some((fk) =>
                                  fk.columns
                                    .map((c) => c.toLowerCase())
                                    .includes(col.name.toLowerCase()),
                                );
                                const formattedLabel = formatLrsColumn(
                                  col.name,
                                  col.isPrimaryKey,
                                  isFk,
                                  lrsKeyNotation,
                                );
                                const suffix =
                                  col.isUnique && !col.isPrimaryKey
                                    ? " (UQ)"
                                    : "";

                                return (
                                  <text
                                    key={col.name}
                                    x={bx + 16}
                                    y={by + 68 + idx * 20}
                                    fill={
                                      col.isPrimaryKey ? "#09090b" : colors.text
                                    }
                                    className={`text-[11px] font-mono ${col.isPrimaryKey ? "font-semibold" : "font-normal"}`}
                                  >
                                    - {formattedLabel}
                                    {suffix}
                                  </text>
                                );
                              })}
                            </g>
                          );
                        })}

                        {/* 3. Diamonds + Crow's Foot markers */}
                        {diamonds.map((d) => {
                          const { edge, rel, x: dmX, y: dmY } = d;
                          const label = rel.verb
                            ? rel.verb
                            : getRelationshipLabel(
                                rel.sourceTable,
                                rel.targetTable,
                              );
                          const cleanLabel = label
                            .replace(/<div>/g, "\n")
                            .replace(/<\/div>/g, "");
                          const lines = cleanLabel.split("\n");
                          const hw = diamondSize / 2;
                          const hh = (diamondSize * 0.375) / 2;
                          const diamondPts = `${dmX},${dmY - hh} ${dmX + hw},${dmY} ${dmX},${dmY + hh} ${dmX - hw},${dmY}`;

                          const srcPt = edge.points[0];
                          const srcPt2 = edge.points[1] ?? srcPt;
                          const tgtPt = edge.points[edge.points.length - 1];
                          const tgtPt2 =
                            edge.points[edge.points.length - 2] ?? tgtPt;
                          const sourceCardinality =
                            rel.sourceCardinality ?? "one";
                          const targetCardinality =
                            rel.targetCardinality ??
                            (rel.type === "1:1" ? "one" : "many");

                          const sn = layout.nodes.find(
                            (n) => n.id === rel.sourceTable,
                          );
                          const tn = layout.nodes.find(
                            (n) => n.id === rel.targetTable,
                          );

                          // Layout dimensions for custom box
                          const numColsSrc = sn?.table.columns.length ?? 0;
                          const hSrc = 40 + 15 + numColsSrc * 20 + 15;
                          const numColsTgt = tn?.table.columns.length ?? 0;
                          const hTgt = 40 + 15 + numColsTgt * 20 + 15;

                          const srcCenter = sn
                            ? {
                                x: sn.x + sn.width / 2,
                                y: sn.y + sn.height / 2,
                              }
                            : srcPt;
                          const tgtCenter = tn
                            ? {
                                x: tn.x + tn.width / 2,
                                y: tn.y + tn.height / 2,
                              }
                            : tgtPt;
                          const isDiamondFocused = selectedEntityName
                            ? edge.sourceTable === selectedEntityName ||
                              edge.targetTable === selectedEntityName
                            : false;

                          const srcBorder = getBorderPoint(
                            srcCenter,
                            srcPt2,
                            160,
                            hSrc,
                          );
                          const tgtBorder = getBorderPoint(
                            tgtCenter,
                            tgtPt2,
                            160,
                            hTgt,
                          );

                          const uSrc = uv(srcCenter, srcPt2);
                          const uTgt = uv(tgtCenter, tgtPt2);

                          // Colors mapped to the child/weak table group
                          let childTable = rel.targetTable;
                          if (
                            rel.sourceCardinality === "many" &&
                            rel.targetCardinality !== "many"
                          ) {
                            childTable = rel.sourceTable;
                          }
                          const colors = getTableColors(childTable);

                          return (
                            <g key={`trans_overlay_${edge.id}`}>
                              {/* Source side crow's foot tick marks */}
                              {sourceCardinality === "one"
                                ? (() => {
                                    const u = uSrc,
                                      px = -u.y,
                                      py = u.x;
                                    const bx = srcBorder.x + u.x * 10,
                                      by = srcBorder.y + u.y * 10;
                                    return (
                                      <line
                                        x1={bx + px * 5}
                                        y1={by + py * 5}
                                        x2={bx - px * 5}
                                        y2={by - py * 5}
                                        stroke={colors.stroke}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                      />
                                    );
                                  })()
                                : (() => {
                                    const u = uSrc,
                                      px = -u.y,
                                      py = u.x;
                                    const far = {
                                      x: srcBorder.x + u.x * 12,
                                      y: srcBorder.y + u.y * 12,
                                    };
                                    return (
                                      <g>
                                        <line
                                          x1={srcBorder.x + px * 5}
                                          y1={srcBorder.y + py * 5}
                                          x2={far.x}
                                          y2={far.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={srcBorder.x}
                                          y1={srcBorder.y}
                                          x2={far.x}
                                          y2={far.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={srcBorder.x - px * 5}
                                          y1={srcBorder.y - py * 5}
                                          x2={far.x}
                                          y2={far.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                      </g>
                                    );
                                  })()}

                              {/* Target side crow's foot tick marks */}
                              {targetCardinality === "one"
                                ? (() => {
                                    const u = uTgt,
                                      px = -u.y,
                                      py = u.x;
                                    const bx = tgtBorder.x + u.x * 10,
                                      by = tgtBorder.y + u.y * 10;
                                    return (
                                      <line
                                        x1={bx + px * 5}
                                        y1={by + py * 5}
                                        x2={bx - px * 5}
                                        y2={by - py * 5}
                                        stroke={colors.stroke}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                      />
                                    );
                                  })()
                                : (() => {
                                    const u = uTgt,
                                      px = -u.y,
                                      py = u.x;
                                    const far = {
                                      x: tgtBorder.x + u.x * 12,
                                      y: tgtBorder.y + u.y * 12,
                                    };
                                    return (
                                      <g>
                                        <line
                                          x1={tgtBorder.x + px * 5}
                                          y1={tgtBorder.y + py * 5}
                                          x2={far.x}
                                          y2={far.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={tgtBorder.x}
                                          y1={tgtBorder.y}
                                          x2={far.x}
                                          y2={far.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={tgtBorder.x - px * 5}
                                          y1={tgtBorder.y - py * 5}
                                          x2={far.x}
                                          y2={far.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                      </g>
                                    );
                                  })()}

                              {/* Diamond */}
                              <g
                                className="cursor-pointer"
                                onPointerDown={(e) =>
                                  handleRelPointerDown(e, rel.id, dmX, dmY)
                                }
                                onPointerMove={(e) => {
                                  if (
                                    draggingRel &&
                                    draggingRel.relId === rel.id
                                  ) {
                                    handleRelDrag(e.clientX, e.clientY);
                                  }
                                }}
                                onPointerUp={(e) => {
                                  e.currentTarget.releasePointerCapture(
                                    e.pointerId,
                                  );
                                  setDraggingRel(null);
                                  if (hasDragged) {
                                    saveHistory();
                                  } else {
                                    setSelectedEntityName(null);
                                    setSelectedAttr(null);
                                    const wasSelected =
                                      wasSelectedBeforeDragRef.current.type ===
                                        "relation" &&
                                      wasSelectedBeforeDragRef.current.id ===
                                        rel.id &&
                                      wasSelectedBeforeDragRef.current
                                        .wasSelected;
                                    if (wasSelected) {
                                      setSelectedRelationId(null);
                                    } else {
                                      setSelectedRelationId(rel.id);
                                    }
                                  }
                                }}
                              >
                                <polygon
                                  points={diamondPts}
                                  fill={colors.fill}
                                  stroke={
                                    isDiamondFocused ? "#60a5fa" : colors.stroke
                                  }
                                  strokeWidth={isDiamondFocused ? 2 : 1.5}
                                />
                                {lines.length > 1 ? (
                                  <text
                                    x={dmX}
                                    y={dmY - 3}
                                    textAnchor="middle"
                                    fill={
                                      isDiamondFocused ? "#60a5fa" : colors.text
                                    }
                                    className="text-[8px] font-medium pointer-events-none font-sans"
                                  >
                                    <tspan x={dmX} dy="0">
                                      {lines[0]}
                                    </tspan>
                                    <tspan x={dmX} dy="8">
                                      {lines[1].replace(/^\/\s*/, "/ ")}
                                    </tspan>
                                  </text>
                                ) : (
                                  <text
                                    x={dmX}
                                    y={dmY + 3}
                                    textAnchor="middle"
                                    fill={
                                      isDiamondFocused ? "#60a5fa" : colors.text
                                    }
                                    className="text-[9px] font-medium pointer-events-none font-sans"
                                  >
                                    {lines[0]}
                                  </text>
                                )}
                              </g>
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}

                {/* C. RENDER MODE: USE CASE DIAGRAM */}
                {(mode === "usecase" || mode === "uml") && usecaseDiagram && (
                  <>
                    {/* 1. Draw System Boundaries */}
                    {usecaseDiagram.systems.length > 0 ? (
                      usecaseDiagram.systems.map((sys, sIdx) => {
                        const sy = systemYBoundary(
                          sIdx,
                          usecaseDiagram.usecases.length,
                        );
                        return (
                          <g key={sIdx}>
                            <rect
                              x={260}
                              y={sy}
                              width={340}
                              height={Math.max(
                                320,
                                usecaseDiagram.usecases.length * 90 + 80,
                              )}
                              rx={8}
                              fill="none"
                              stroke="#52525b"
                              strokeWidth={2}
                              strokeDasharray="5,5"
                            />
                            <text
                              x={260 + 170}
                              y={sy + 25}
                              textAnchor="middle"
                              fill="#a1a1aa"
                              className="text-xs font-medium"
                            >
                              {sys.name}
                            </text>
                          </g>
                        );
                      })
                    ) : (
                      <g>
                        <rect
                          x={260}
                          y={60}
                          width={340}
                          height={Math.max(
                            320,
                            usecaseDiagram.usecases.length * 90 + 80,
                          )}
                          rx={8}
                          fill="none"
                          stroke="#52525b"
                          strokeWidth={2}
                          strokeDasharray="5,5"
                        />
                        <text
                          x={260 + 170}
                          y={60 + 25}
                          textAnchor="middle"
                          fill="#a1a1aa"
                          className="text-xs font-medium"
                        >
                          System boundary
                        </text>
                      </g>
                    )}

                    {/* 2. Draw Connections */}
                    {usecaseDiagram.connections.map((conn, cIdx) => {
                      const getActorCoords = (id: string) => {
                        const idx = usecaseDiagram.actors.findIndex(
                          (a) => a.id === id,
                        );
                        if (idx === -1) return null;
                        const act = usecaseDiagram.actors[idx];
                        const spacing = Math.max(
                          120,
                          Math.max(
                            320,
                            usecaseDiagram.usecases.length * 90 + 80,
                          ) / (usecaseDiagram.actors.length || 1),
                        );
                        const isRight = act.side === "right";
                        return {
                          x: (isRight ? 660 : 80) + 15,
                          y: 60 + 40 + idx * spacing + 30,
                        };
                      };
                      const getUsecaseCoords = (id: string) => {
                        const idx = usecaseDiagram.usecases.findIndex(
                          (u) => u.id === id,
                        );
                        if (idx === -1) return null;
                        let sysIdx = 0;
                        let sy = 60;
                        const systemHeight = Math.max(
                          320,
                          usecaseDiagram.usecases.length * 90 + 80,
                        );
                        for (
                          let sIdx = 0;
                          sIdx < usecaseDiagram.systems.length;
                          sIdx++
                        ) {
                          if (
                            usecaseDiagram.systems[sIdx].usecaseIds.includes(id)
                          ) {
                            sysIdx = sIdx;
                            sy = 60 + sysIdx * (systemHeight + 50);
                            break;
                          }
                        }
                        const localIdx =
                          usecaseDiagram.systems.length > 0
                            ? usecaseDiagram.systems[sysIdx].usecaseIds.indexOf(
                                id,
                              )
                            : idx;
                        return {
                          x: 260 + (340 - 160) / 2 + 80,
                          y: sy + 50 + (localIdx >= 0 ? localIdx : 0) * 85 + 30,
                        };
                      };

                      const fromCoords =
                        getActorCoords(conn.from) ||
                        getUsecaseCoords(conn.from);
                      const toCoords =
                        getActorCoords(conn.to) || getUsecaseCoords(conn.to);

                      if (!fromCoords || !toCoords) return null;

                      const sx = fromCoords.x;
                      const sy = fromCoords.y;
                      const tx = toCoords.x;
                      const ty = toCoords.y;

                      const midX = (sx + tx) / 2;
                      const midY = (sy + ty) / 2;
                      return (
                        <g key={`${conn.id}-${cIdx}`}>
                          <line
                            x1={sx}
                            y1={sy}
                            x2={tx}
                            y2={ty}
                            stroke={conn.label ? "#2563eb" : "#52525b"}
                            strokeWidth={1.5}
                            strokeDasharray={conn.label ? "5,3" : "none"}
                            markerEnd={
                              conn.label ? "url(#sequence-arrow)" : undefined
                            }
                          />
                          {conn.label && (
                            <text
                              x={midX}
                              y={midY - 4}
                              textAnchor="middle"
                              fill="#2563eb"
                              className="text-[8px] font-mono font-bold"
                              style={{
                                paintOrder: "stroke",
                                stroke: "#09090b",
                                strokeWidth: "3px",
                              }}
                            >
                              {conn.label}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* 3. Draw Actors */}
                    {usecaseDiagram.actors.map((act, idx) => {
                      const spacing = Math.max(
                        120,
                        Math.max(
                          320,
                          usecaseDiagram.usecases.length * 90 + 80,
                        ) / (usecaseDiagram.actors.length || 1),
                      );
                      const ay = 60 + 40 + idx * spacing;
                      const isRight = act.side === "right";
                      const ax = isRight ? 660 : 80;
                      return (
                        <g key={act.id}>
                          <circle
                            cx={ax + 15}
                            cy={ay + 10}
                            r={10}
                            fill="#18181b"
                            stroke="#2563eb"
                            strokeWidth={2}
                          />
                          <line
                            x1={ax + 15}
                            y1={ay + 20}
                            x2={ax + 15}
                            y2={ay + 45}
                            stroke="#2563eb"
                            strokeWidth={2}
                          />
                          <line
                            x1={ax}
                            y1={ay + 28}
                            x2={ax + 30}
                            y2={ay + 28}
                            stroke="#2563eb"
                            strokeWidth={2}
                          />
                          <line
                            x1={ax + 15}
                            y1={ay + 45}
                            x2={ax + 5}
                            y2={ay + 60}
                            stroke="#2563eb"
                            strokeWidth={2}
                          />
                          <line
                            x1={ax + 15}
                            y1={ay + 45}
                            x2={ax + 25}
                            y2={ay + 60}
                            stroke="#2563eb"
                            strokeWidth={2}
                          />
                          <text
                            x={ax + 15}
                            y={ay + 75}
                            textAnchor="middle"
                            fill="#fafafa"
                            className="text-[10px] font-medium select-none"
                          >
                            {act.name}
                          </text>
                        </g>
                      );
                    })}

                    {/* 4. Draw Use Cases */}
                    {usecaseDiagram.usecases.map((uc, idx) => {
                      let sysIdx = 0;
                      let sy = 60;
                      const systemHeight = Math.max(
                        320,
                        usecaseDiagram.usecases.length * 90 + 80,
                      );
                      for (
                        let sIdx = 0;
                        sIdx < usecaseDiagram.systems.length;
                        sIdx++
                      ) {
                        if (
                          usecaseDiagram.systems[sIdx].usecaseIds.includes(
                            uc.id,
                          )
                        ) {
                          sysIdx = sIdx;
                          sy = 60 + sysIdx * (systemHeight + 50);
                          break;
                        }
                      }
                      const localIdx =
                        usecaseDiagram.systems.length > 0
                          ? usecaseDiagram.systems[sysIdx].usecaseIds.indexOf(
                              uc.id,
                            )
                          : idx;

                      const ux = 260 + (340 - 160) / 2;
                      const uy = sy + 50 + (localIdx >= 0 ? localIdx : 0) * 85;

                      return (
                        <g key={uc.id}>
                          <ellipse
                            cx={ux + 80}
                            cy={uy + 30}
                            rx={80}
                            ry={30}
                            fill="#18181b"
                            stroke="#52525b"
                            strokeWidth={1.5}
                          />
                          <text
                            x={ux + 80}
                            y={uy + 33.5}
                            textAnchor="middle"
                            fill="#fafafa"
                            className="text-[11px] font-medium select-none"
                          >
                            {uc.name}
                          </text>
                        </g>
                      );
                    })}
                  </>
                )}
              </g>
            </svg>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-450">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-zinc-550" />
                <p className="text-sm font-medium">
                  Generating diagram preview...
                </p>
              </div>
            </div>
          )}
        </div>
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
          a.radius = Math.max(
            50,
            Math.min(350, Math.sqrt(dxA * dxA + dyA * dyA)),
          );
          a.angle = Math.atan2(dyA, dxA);

          const dxB = b.x - cx;
          const dyB = b.y - cy;
          b.radius = Math.max(
            50,
            Math.min(350, Math.sqrt(dxB * dxB + dyB * dyB)),
          );
          b.angle = Math.atan2(dyB, dxB);
        }
      }
    }
  }
}
