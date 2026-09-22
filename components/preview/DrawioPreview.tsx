"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useDbStore } from "@/store/dbStore";
import { getRelationshipLabel } from "@/lib/xml/drawioGenerator";
import { formatLrsColumn } from "@/lib/xml/lrsGenerator";
import { Column, Table } from "@/types";
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

function getRectBorderPoint(
  center: { x: number; y: number },
  toward: { x: number; y: number },
  width: number,
  height: number,
) {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scaleX = dx === 0 ? Infinity : width / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

function getLrsTableWidth(
  table: { name: string; columns: Column[]; foreignKeys: Table["foreignKeys"] },
  showDataTypes: boolean,
  notation: "stars" | "letters",
) {
  const longestText = table.columns.reduce((longest, column) => {
    const keyPrefix = column.isPrimaryKey
      ? notation === "stars"
        ? "* "
        : "PK "
      : "";
    const fkPrefix = table.foreignKeys.some((fk) =>
      fk.columns.some(
        (name) => name.toLowerCase() === column.name.toLowerCase(),
      ),
    )
      ? "FK "
      : "";
    const textLength =
      keyPrefix.length +
      fkPrefix.length +
      column.name.length +
      (showDataTypes ? column.type.length + 3 : 0);
    return Math.max(longest, textLength);
  }, table.name.length);
  return Math.max(180, Math.min(600, longestText * 9.5 + 36));
}

function getLrsRoute(
  source: { x: number; y: number },
  target: { x: number; y: number },
  offset: number,
) {
  const horizontal =
    Math.abs(target.x - source.x) >= Math.abs(target.y - source.y);
  if (horizontal) {
    const middleX = (source.x + target.x) / 2 + offset;
    return [
      source,
      { x: middleX, y: source.y },
      { x: middleX, y: target.y },
      target,
    ];
  }
  const middleY = (source.y + target.y) / 2 + offset;
  return [
    source,
    { x: source.x, y: middleY },
    { x: target.x, y: middleY },
    target,
  ];
}

interface LrsObstacle {
  name: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

function segmentHitsAnyObstacle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  obstacles: LrsObstacle[],
  ignoredNames: string[] = [],
): boolean {
  const isHoriz = Math.abs(p1.y - p2.y) < 1;
  const isVert = Math.abs(p1.x - p2.x) < 1;
  if (!isHoriz && !isVert) return true;

  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  for (const obs of obstacles) {
    if (ignoredNames.includes(obs.name)) continue;
    // Clearance buffer of 4px around card borders
    const ox1 = obs.x1 - 4;
    const ox2 = obs.x2 + 4;
    const oy1 = obs.y1 - 4;
    const oy2 = obs.y2 + 4;

    if (isHoriz) {
      const y = p1.y;
      if (y >= oy1 && y <= oy2) {
        if (Math.max(minX, ox1) < Math.min(maxX, ox2)) return true;
      }
    } else {
      const x = p1.x;
      if (x >= ox1 && x <= ox2) {
        if (Math.max(minY, oy1) < Math.min(maxY, oy2)) return true;
      }
    }
  }
  return false;
}

function simplifyPath(points: { x: number; y: number }[]) {
  if (points.length <= 2) return points;
  const result: { x: number; y: number }[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const isCollinearX =
      Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
    const isCollinearY =
      Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;

    if (isCollinearX || isCollinearY) {
      continue;
    }
    if (
      Math.abs(prev.x - curr.x) < 0.5 &&
      Math.abs(prev.y - curr.y) < 0.5
    ) {
      continue;
    }
    result.push(curr);
  }

  const lastAdded = result[result.length - 1];
  const target = points[points.length - 1];
  if (
    !(
      Math.abs(lastAdded.x - target.x) < 0.5 &&
      Math.abs(lastAdded.y - target.y) < 0.5
    )
  ) {
    result.push(target);
  }
  return result;
}

function findOrthogonalShortestRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  srcFace: "left" | "right" | "top" | "bottom",
  tgtFace: "left" | "right" | "top" | "bottom",
  sourceTable: string,
  targetTable: string,
  obstacles: LrsObstacle[],
  routeOffset: number = 0,
): { x: number; y: number }[] {
  const snapToGrid = (v: number) => Math.round(v / 10) * 10;
  const S = { x: snapToGrid(start.x), y: snapToGrid(start.y) };
  const E = { x: snapToGrid(end.x), y: snapToGrid(end.y) };
  const ignored = [sourceTable, targetTable];

  // 1. Direct Straight Lines (0 Bends)
  if (S.x === E.x && !segmentHitsAnyObstacle(S, E, obstacles, ignored)) {
    return [S, E];
  }
  if (S.y === E.y && !segmentHitsAnyObstacle(S, E, obstacles, ignored)) {
    return [S, E];
  }

  // 2. Direct L-Shape (1 Bend)
  const cornerA = { x: S.x, y: E.y };
  const cornerB = { x: E.x, y: S.y };

  const srcIsVert = srcFace === "top" || srcFace === "bottom";
  const tgtIsHoriz = tgtFace === "left" || tgtFace === "right";

  if (srcIsVert && tgtIsHoriz) {
    if (
      !segmentHitsAnyObstacle(S, cornerA, obstacles, ignored) &&
      !segmentHitsAnyObstacle(cornerA, E, obstacles, ignored)
    ) {
      return [S, cornerA, E];
    }
  } else if (!srcIsVert && !tgtIsHoriz) {
    if (
      !segmentHitsAnyObstacle(S, cornerB, obstacles, ignored) &&
      !segmentHitsAnyObstacle(cornerB, E, obstacles, ignored)
    ) {
      return [S, cornerB, E];
    }
  } else {
    // Both horizontal or both vertical
    if (srcIsVert) {
      const midY = snapToGrid((S.y + E.y) / 2 + routeOffset);
      const m1 = { x: S.x, y: midY };
      const m2 = { x: E.x, y: midY };
      if (
        !segmentHitsAnyObstacle(S, m1, obstacles, ignored) &&
        !segmentHitsAnyObstacle(m1, m2, obstacles, ignored) &&
        !segmentHitsAnyObstacle(m2, E, obstacles, ignored)
      ) {
        return [S, m1, m2, E];
      }
    } else {
      const midX = snapToGrid((S.x + E.x) / 2 + routeOffset);
      const m1 = { x: midX, y: S.y };
      const m2 = { x: midX, y: E.y };
      if (
        !segmentHitsAnyObstacle(S, m1, obstacles, ignored) &&
        !segmentHitsAnyObstacle(m1, m2, obstacles, ignored) &&
        !segmentHitsAnyObstacle(m2, E, obstacles, ignored)
      ) {
        return [S, m1, m2, E];
      }
    }
  }

  // Check the alternative 1-bend corner if still clear
  if (
    !segmentHitsAnyObstacle(S, cornerA, obstacles, ignored) &&
    !segmentHitsAnyObstacle(cornerA, E, obstacles, ignored)
  ) {
    return [S, cornerA, E];
  }
  if (
    !segmentHitsAnyObstacle(S, cornerB, obstacles, ignored) &&
    !segmentHitsAnyObstacle(cornerB, E, obstacles, ignored)
  ) {
    return [S, cornerB, E];
  }

  // 3. Obstacle Detected in the Direct Path! Run A* Channel Routing
  const margin = 20;
  const xSet = new Set<number>([S.x, E.x]);
  const ySet = new Set<number>([S.y, E.y]);

  for (const obs of obstacles) {
    xSet.add(snapToGrid(obs.x1 - margin));
    xSet.add(snapToGrid(obs.x2 + margin));
    ySet.add(snapToGrid(obs.y1 - margin));
    ySet.add(snapToGrid(obs.y2 + margin));
  }

  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);

  interface ANode {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: ANode | null;
    dir: "H" | "V" | null;
  }

  const startNode: ANode = {
    x: S.x,
    y: S.y,
    g: 0,
    h: Math.abs(S.x - E.x) + Math.abs(S.y - E.y),
    f: Math.abs(S.x - E.x) + Math.abs(S.y - E.y),
    parent: null,
    dir: srcIsVert ? "V" : "H",
  };

  const openList: ANode[] = [startNode];
  const closedSet = new Set<string>();
  let bestNode: ANode | null = null;
  let iterations = 0;

  while (openList.length > 0 && iterations < 300) {
    iterations++;
    openList.sort((a, b) => a.f - b.f);
    const curr = openList.shift()!;

    if (curr.x === E.x && curr.y === E.y) {
      bestNode = curr;
      break;
    }

    const key = `${curr.x},${curr.y},${curr.dir || ""}`;
    if (closedSet.has(key)) continue;
    closedSet.add(key);

    for (const nextX of xs) {
      if (nextX === curr.x) continue;
      const p1 = { x: curr.x, y: curr.y };
      const p2 = { x: nextX, y: curr.y };
      if (!segmentHitsAnyObstacle(p1, p2, obstacles, ignored)) {
        const turnCost = curr.dir === "V" ? 30 : 0;
        const g = curr.g + Math.abs(nextX - curr.x) + turnCost;
        const h = Math.abs(nextX - E.x) + Math.abs(curr.y - E.y);
        openList.push({
          x: nextX,
          y: curr.y,
          g,
          h,
          f: g + h,
          parent: curr,
          dir: "H",
        });
      }
    }

    for (const nextY of ys) {
      if (nextY === curr.y) continue;
      const p1 = { x: curr.x, y: curr.y };
      const p2 = { x: curr.x, y: nextY };
      if (!segmentHitsAnyObstacle(p1, p2, obstacles, ignored)) {
        const turnCost = curr.dir === "H" ? 30 : 0;
        const g = curr.g + Math.abs(nextY - curr.y) + turnCost;
        const h = Math.abs(curr.x - E.x) + Math.abs(nextY - E.y);
        openList.push({
          x: curr.x,
          y: nextY,
          g,
          h,
          f: g + h,
          parent: curr,
          dir: "V",
        });
      }
    }
  }

  if (bestNode) {
    const rawPath: { x: number; y: number }[] = [];
    let cur: ANode | null = bestNode;
    while (cur) {
      rawPath.unshift({ x: cur.x, y: cur.y });
      cur = cur.parent;
    }
    return simplifyPath(rawPath);
  }

  return [S, cornerA, E];
}

function renderCrowFootMarker(
  point: { x: number; y: number },
  direction: { x: number; y: number },
  cardinality: "one" | "many",
  key: string,
) {
  const perpendicular = { x: -direction.y, y: direction.x };
  const base = {
    x: point.x + direction.x * 10,
    y: point.y + direction.y * 10,
  };

  if (cardinality === "one") {
    const tickPoint = {
      x: point.x + direction.x * 3,
      y: point.y + direction.y * 3,
    };
    return (
      <line
        key={key}
        x1={tickPoint.x + perpendicular.x * 5}
        y1={tickPoint.y + perpendicular.y * 5}
        x2={tickPoint.x - perpendicular.x * 5}
        y2={tickPoint.y - perpendicular.y * 5}
        stroke="#6366f1"
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  }

  return (
    <g key={key}>
      <line
        x1={point.x + perpendicular.x * 6}
        y1={point.y + perpendicular.y * 6}
        x2={base.x}
        y2={base.y}
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={point.x}
        y1={point.y}
        x2={base.x}
        y2={base.y}
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={point.x - perpendicular.x * 6}
        y1={point.y - perpendicular.y * 6}
        x2={base.x}
        y2={base.y}
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
}

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
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showLrsDataTypes, setShowLrsDataTypes] = useState(true);

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
  // Global selection state — synced with VisualEditor
  const selectedEntityName = useDbStore((state) => state.selectedEntityName);
  const setSelectedEntityNameStore = useDbStore(
    (state) => state.setSelectedEntityName,
  );
  const setSelectedEntityName = (name: string | null) => {
    setSelectedEntityNameStore(name);
  };

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
  const relPositionsRaw = useDbStore((state) => state.relPositions);
  const relPositions = relPositionsRaw ?? {};
  const updateRelPosition = useDbStore((state) => state.updateRelPosition);
  const diamondSize = useDbStore((state) => state.diamondSize ?? 120);
  const setDiamondSize = useDbStore((state) => state.setDiamondSize);
  const customWaypointsRaw = useDbStore((state) => state.customWaypoints);
  const customWaypoints = customWaypointsRaw ?? {};
  const updateWaypoints = useDbStore((state) => state.updateWaypoints);

  // Zooming & Panning refs and states
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const diagramGroupRef = useRef<SVGGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const frameName = useDbStore((state) => state.frameName);
  const setFrameName = useDbStore((state) => state.setFrameName);
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

    if ((Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) && !hasDragged) {
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

  const frameBounds = useMemo(() => {
    if (!hasDiagramData) return null;
    if (mode === "usecase" || mode === "uml") {
      return {
        x: -16,
        y: -16,
        width: canvasWidth + 32,
        height: canvasHeight + 32,
      };
    }
    if (!layout || layout.nodes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of layout.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const padding = 48;
    return {
      x: Math.round(minX - padding),
      y: Math.round(minY - padding),
      width: Math.round(maxX - minX + padding * 2),
      height: Math.round(maxY - minY + padding * 2),
    };
  }, [hasDiagramData, layout, mode, canvasWidth, canvasHeight]);

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

    const table = node.table;
    const pkCol = table.columns.find((c) => c.isPrimaryKey) || table.columns[0];
    const isPk = draggingAttr.colName === pkCol.name;

    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const radius = Math.max(50, Math.min(350, Math.sqrt(dx * dx + dy * dy)));
    const absoluteAngle = Math.atan2(dy, dx);

    if (isPk) {
      setAttrPosition(`${draggingAttr.tableName}-${draggingAttr.colName}`, {
        angle: absoluteAngle,
        radius,
      });
    } else {
      const pkKey = `${table.name}-${pkCol.name}`;
      const pkIdx = table.columns.findIndex((c) => c.name === pkCol.name);
      const pkDefaultAngle = (2 * Math.PI * pkIdx) / table.columns.length;
      const pkDefaultRadius = 85 + table.columns.length * 5;
      const pkPos = attrPositions[pkKey] || {
        angle: pkDefaultAngle,
        radius: pkDefaultRadius,
      };

      const relativeAngle = absoluteAngle - pkPos.angle;
      setAttrPosition(`${draggingAttr.tableName}-${draggingAttr.colName}`, {
        angle: relativeAngle,
        radius,
      });
    }
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
    const padding = 48;
    const measuredBounds = diagramGroupRef.current?.getBBox();
    const bounds =
      measuredBounds && measuredBounds.width > 0 && measuredBounds.height > 0
        ? measuredBounds
        : { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

    const scaleX = (containerWidth - padding * 2) / bounds.width;
    const scaleY = (containerHeight - padding * 2) / bounds.height;
    const fitScale = Math.max(0.1, Math.min(1.5, Math.min(scaleX, scaleY)));
    setZoom(fitScale);
    setPan({
      x: (containerWidth - bounds.width * fitScale) / 2 - bounds.x * fitScale,
      y: (containerHeight - bounds.height * fitScale) / 2 - bounds.y * fitScale,
    });
  }, [hasDiagramData, canvasWidth, canvasHeight, setZoom, setPan]);



  // React to fit trigger from Footer
  const lastFitTriggerRef = useRef(0);
  useEffect(() => {
    if (fitTrigger > 0 && fitTrigger !== lastFitTriggerRef.current) {
      lastFitTriggerRef.current = fitTrigger;
      handleFit();
    }
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
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-zinc-500 shrink-0">
              Mode: <span className="text-blue-400 font-semibold">{mode}</span>
            </span>
            <input
              value={frameName}
              onChange={(e) => setFrameName(e.target.value)}
              aria-label="Frame name"
              placeholder="Diagram"
              className="h-6 w-32 rounded border border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-blue-600/60"
            />
          </div>

          <div className="relative flex items-center gap-2 shrink-0">
            {/* Right Panel Toggle */}
            {(mode === "erd" ||
              mode === "lrs" ||
              mode === "transformation" ||
              mode === "visual" ||
              mode === "class") && (
              <button
                onClick={() => setShowRightPanel((v) => !v)}
                title="Toggle view controls panel"
                className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition shrink-0 ${
                  showRightPanel
                    ? "border-blue-600/40 bg-blue-950/30 text-blue-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <Sliders className="h-3.5 w-3.5 shrink-0" />
                <span>Controls</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${showRightPanel ? "rotate-180" : ""}`}
                />
              </button>
            )}
            <div className="w-px h-4 bg-zinc-800 shrink-0" />
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
          </div>
        </div>
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

        {/* Right Controls Sidebar */}
        {showRightPanel &&
          (mode === "erd" ||
            mode === "lrs" ||
            mode === "transformation" ||
            mode === "visual" ||
            mode === "class") && (
            <div
              className="absolute right-3 top-3 bottom-3 z-30 w-56 flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-sm overflow-y-auto select-none"
              data-canvas-interactive="true"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-semibold text-zinc-200">
                    View Controls
                  </span>
                </div>
                <button
                  onClick={() => setShowRightPanel(false)}
                  className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Filter Tables */}
              {mode !== "visual" && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Tables
                  </span>
                  <button
                    onClick={() => setShowTableFilter(!showTableFilter)}
                    className={`flex w-full h-7 px-2.5 items-center gap-1.5 rounded-md border text-xs font-medium transition ${
                      showTableFilter
                        ? "border-blue-600/40 bg-blue-950/30 text-blue-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span>Filter tables</span>
                    <span className="ml-auto text-zinc-500 text-[10px]">
                      ({schema.tables.length - excludedTables.length}/
                      {schema.tables.length})
                    </span>
                  </button>
                </div>
              )}

              {/* Relationship Notation */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Notation
                </span>
                <div className="flex rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden">
                  <button
                    onClick={() => setRelNotation("crowsfoot")}
                    className={`flex-1 h-7 text-xs font-medium transition ${
                      relNotation === "crowsfoot"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    Crow&apos;s Foot
                  </button>
                  <div className="w-px bg-zinc-700" />
                  <button
                    onClick={() => setRelNotation("label")}
                    className={`flex-1 h-7 text-xs font-medium transition ${
                      relNotation === "label"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    1:N
                  </button>
                </div>
              </div>

              {/* Line Style */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Line Style
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {(["sharp", "rounded", "curved", "straight"] as const).map(
                    (style) => (
                      <button
                        key={style}
                        onClick={() => setLineStyle(style)}
                        className={`h-7 rounded text-xs font-medium capitalize transition border ${
                          lineStyle === style
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        }`}
                      >
                        {style.charAt(0).toUpperCase() + style.slice(1)}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* LRS Key Notation */}
              {(mode === "lrs" || mode === "transformation") && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Key Notation
                  </span>
                  <div className="flex rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden">
                    <button
                      onClick={() => setLrsKeyNotation("stars")}
                      className={`flex-1 h-7 text-xs font-medium transition ${
                        lrsKeyNotation === "stars"
                          ? "bg-blue-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      * / **
                    </button>
                    <div className="w-px bg-zinc-700" />
                    <button
                      onClick={() => setLrsKeyNotation("letters")}
                      className={`flex-1 h-7 text-xs font-medium transition ${
                        lrsKeyNotation === "letters"
                          ? "bg-blue-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      PK/FK
                    </button>
                  </div>
                </div>
              )}

              {mode === "lrs" && (
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={showLrsDataTypes}
                    onChange={(e) => setShowLrsDataTypes(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Show data types
                </label>
              )}

              {/* Diamond Size (ERD only) */}
              {mode === "erd" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Diamond Size
                    </span>
                    <span className="text-blue-400 text-[10px] font-mono">
                      {diamondSize}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="240"
                    value={diamondSize}
                    onChange={(e) =>
                      setDiamondSize(parseInt(e.target.value, 10))
                    }
                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Orbit / Radius (ERD only) */}
              {mode === "erd" && (
                <div className="space-y-1.5 border-t border-zinc-800 pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Orbit &amp; Radius
                  </span>
                  {selectedAttrMeta ? (
                    <div className="space-y-2">
                      <div className="text-[10px] text-zinc-400 truncate">
                        Attribute:{" "}
                        <span className="text-zinc-200 font-semibold">
                          {selectedAttr!.colName}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-500">Orbit angle</span>
                          <span className="text-blue-400 font-mono">
                            {selectedAttrMeta.deg}°
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
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-500">Orbit radius</span>
                          <span className="text-blue-400 font-mono">
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
                      <div className="flex gap-1.5 pt-1">
                        <button
                          onClick={() =>
                            resetAttrPosition(selectedAttrMeta.key)
                          }
                          className="flex-1 rounded border border-zinc-800 bg-zinc-900 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                        >
                          Reset attr
                        </button>
                        <button
                          onClick={() =>
                            resetTableAttrPositions(
                              selectedAttr!.tableName,
                              selectedAttrMeta.node.table.columns.map(
                                (c) => c.name,
                              ),
                            )
                          }
                          className="flex-1 rounded border border-zinc-800 bg-zinc-900 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                        >
                          Reset table
                        </button>
                      </div>
                    </div>
                  ) : selectedEntityName && selectedEntityTable ? (
                    <div className="space-y-3">
                      <div className="text-[10px] text-zinc-400 truncate">
                        Entity:{" "}
                        <span className="text-zinc-200 font-semibold">
                          {selectedEntityName}
                        </span>
                      </div>

                      {/* Collective Rotation Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-500">
                            Rotate attributes
                          </span>
                          <span className="text-blue-400 font-mono">
                            {(() => {
                              const table = selectedEntityTable;
                              if (table) {
                                const pkCol =
                                  table.columns.find((c) => c.isPrimaryKey) ||
                                  table.columns[0];
                                const key = `${table.name}-${pkCol.name}`;
                                const pos = attrPositions[key];
                                if (pos) {
                                  let deg = Math.round(
                                    (pos.angle * 180) / Math.PI,
                                  );
                                  if (deg < 0) deg += 360;
                                  return `${deg}°`;
                                }
                              }
                              return "0°";
                            })()}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={(() => {
                            const table = selectedEntityTable;
                            if (table) {
                              const pkCol =
                                table.columns.find((c) => c.isPrimaryKey) ||
                                table.columns[0];
                              const key = `${table.name}-${pkCol.name}`;
                              const pos = attrPositions[key];
                              if (pos) {
                                let deg = Math.round(
                                  (pos.angle * 180) / Math.PI,
                                );
                                if (deg < 0) deg += 360;
                                return deg;
                              }
                            }
                            return 0;
                          })()}
                          onChange={(e) => {
                            const deg = parseInt(e.target.value, 10);
                            const rad = (deg * Math.PI) / 180;
                            const table = selectedEntityTable;
                            if (!table) return;
                            const pkCol =
                              table.columns.find((c) => c.isPrimaryKey) ||
                              table.columns[0];
                            const key = `${table.name}-${pkCol.name}`;
                            const current = attrPositions[key] || {
                              angle: rad,
                              radius: 85 + table.columns.length * 5,
                            };
                            setAttrPosition(key, { ...current, angle: rad });
                          }}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                        />
                      </div>

                      {/* Collective Radius Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-500">Orbit radius</span>
                          <span className="text-blue-400 font-mono">
                            {(() => {
                              const table = selectedEntityTable;
                              if (table) {
                                const pkCol =
                                  table.columns.find((c) => c.isPrimaryKey) ||
                                  table.columns[0];
                                const key = `${table.name}-${pkCol.name}`;
                                const pos = attrPositions[key];
                                if (pos) return `${Math.round(pos.radius)}px`;
                              }
                              return `${85 + (table?.columns.length || 0) * 5}px`;
                            })()}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="50"
                          max="350"
                          value={(() => {
                            const table = selectedEntityTable;
                            if (table) {
                              const pkCol =
                                table.columns.find((c) => c.isPrimaryKey) ||
                                table.columns[0];
                              const key = `${table.name}-${pkCol.name}`;
                              const pos = attrPositions[key];
                              if (pos) return Math.round(pos.radius);
                            }
                            return 85 + (table?.columns.length || 0) * 5;
                          })()}
                          onChange={(e) => {
                            const newRad = parseInt(e.target.value, 10);
                            const table = selectedEntityTable;
                            if (!table) return;
                            table.columns.forEach((col) => {
                              const key = `${table.name}-${col.name}`;
                              const current = attrPositions[key] || {
                                angle: 0,
                                radius: newRad,
                              };
                              setAttrPosition(key, {
                                ...current,
                                radius: newRad,
                              });
                            });
                          }}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                        />
                      </div>

                      {/* Attribute Spacing (Clustering / Density) Slider */}
                      {(() => {
                        const table = selectedEntityTable;
                        const pkCol =
                          table?.columns.find((c) => c.isPrimaryKey) ||
                          table?.columns[0];
                        const otherCols =
                          table?.columns.filter(
                            (c) => c.name !== pkCol?.name,
                          ) || [];
                        if (otherCols.length === 0) return null;

                        return (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-zinc-500">
                                Clustering spacing
                              </span>
                              <span className="text-blue-400 font-mono">
                                {(() => {
                                  const col0 = otherCols[0];
                                  const pos =
                                    attrPositions[`${table.name}-${col0.name}`];
                                  if (pos) {
                                    return `${Math.abs(pos.angle).toFixed(2)} rad`;
                                  }
                                  return "0.25 rad";
                                })()}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.05"
                              max="1.0"
                              step="0.01"
                              value={(() => {
                                const col0 = otherCols[0];
                                const pos =
                                  attrPositions[`${table.name}-${col0.name}`];
                                if (pos) {
                                  return Math.abs(pos.angle);
                                }
                                return 0.25;
                              })()}
                              onChange={(e) => {
                                const newSpacing = parseFloat(e.target.value);
                                otherCols.forEach((col, idx) => {
                                  const key = `${table.name}-${col.name}`;
                                  const factor = idx % 2 === 0 ? 1 : -1;
                                  const step = Math.floor(idx / 2) + 1;
                                  const relAngle = newSpacing * factor * step;
                                  const current = attrPositions[key] || {
                                    angle: relAngle,
                                    radius: 85 + table.columns.length * 5,
                                  };
                                  setAttrPosition(key, {
                                    ...current,
                                    angle: relAngle,
                                  });
                                });
                              }}
                              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                            />
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-500 italic">
                      Tap an entity or attribute to edit its orbit layout.
                    </p>
                  )}
                </div>
              )}

              {/* AI Auto-label */}
              {mode !== "visual" && (
                <div className="space-y-1.5 border-t border-zinc-800 pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    AI
                  </span>
                  <button
                    onClick={() =>
                      triggerAiLabeling().catch((err) => alert(err.message))
                    }
                    disabled={isAiLoading}
                    className={`flex w-full h-8 px-2.5 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition ${
                      isAiLoading
                        ? "border-blue-600/40 bg-blue-950/30 text-blue-400 cursor-not-allowed"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    {isAiLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    )}
                    {isAiLoading ? "Analyzing..." : "AI Auto-label"}
                  </button>
                </div>
              )}
            </div>
          )}

        {showTableFilter &&
          (mode === "erd" ||
            mode === "lrs" ||
            mode === "transformation" ||
            mode === "class") && (
            <div
              className={`absolute top-6 bottom-6 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-4 flex flex-col gap-3.5 z-20 select-none max-h-[85%] touch-auto transition-all ${
                showRightPanel ? "right-[15.5rem]" : "left-6"
              }`}
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
                className={`absolute top-4 z-10 w-fit min-w-[18rem] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-sm select-none transition-all ${
                  showRightPanel ? "right-[15.5rem]" : "right-4"
                }`}
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
            className={`absolute top-4 z-10 w-fit min-w-[18rem] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-800 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-sm select-none transition-all ${
              showRightPanel ? "right-[15.5rem]" : "right-4"
            }`}
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
              ref={svgRef}
              className="absolute inset-0 w-full h-full overflow-visible"
            >
              {frameBounds && (
                <g
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "0 0",
                    pointerEvents: "none",
                  }}
                >
                  <rect
                    x={frameBounds.x}
                    y={frameBounds.y}
                    width={frameBounds.width}
                    height={frameBounds.height}
                    rx={10}
                    fill="rgba(24, 24, 27, 0.2)"
                    stroke="#52525b"
                    strokeWidth={2}
                    strokeDasharray="8 6"
                  />
                  <text
                    x={frameBounds.x + 12}
                    y={frameBounds.y + 18}
                    fill="#d4d4d8"
                    fontSize={13}
                    fontWeight={600}
                  >
                    {frameName || "Diagram"}
                  </text>
                </g>
              )}
              <g
                ref={diagramGroupRef}
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

                    const getActualOrthoBorderPoint = (
                      path: { x: number; y: number }[],
                      cx: number,
                      cy: number,
                      w: number,
                      h: number,
                    ) => {
                      const rx = w / 2;
                      const ry = h / 2;
                      const minX = cx - rx;
                      const maxX = cx + rx;
                      const minY = cy - ry;
                      const maxY = cy + ry;

                      // Find the first point that is outside the bounding box
                      for (let i = 1; i < path.length; i++) {
                        const prev = path[i - 1];
                        const curr = path[i];

                        // Check if this segment crosses the border
                        const prevInside =
                          prev.x >= minX &&
                          prev.x <= maxX &&
                          prev.y >= minY &&
                          prev.y <= maxY;
                        const currInside =
                          curr.x >= minX &&
                          curr.x <= maxX &&
                          curr.y >= minY &&
                          curr.y <= maxY;

                        if (prevInside && !currInside) {
                          // It exits during this segment!
                          // Since it's orthogonal, either prev.x === curr.x or prev.y === curr.y.
                          if (Math.abs(prev.x - curr.x) < 0.5) {
                            // Vertical segment
                            const exitY = curr.y < prev.y ? minY : maxY;
                            const dir =
                              curr.y < prev.y
                                ? { x: 0, y: -1 }
                                : { x: 0, y: 1 };
                            return {
                              pt: { x: prev.x, y: exitY },
                              dir,
                              segIndex: i,
                            };
                          } else {
                            // Horizontal segment
                            const exitX = curr.x < prev.x ? minX : maxX;
                            const dir =
                              curr.x < prev.x
                                ? { x: -1, y: 0 }
                                : { x: 1, y: 0 };
                            return {
                              pt: { x: exitX, y: prev.y },
                              dir,
                              segIndex: i,
                            };
                          }
                        }
                      }

                      // Fallback to basic direction from center to path[1]
                      const p1 = path[1] ?? path[0];
                      const dx = p1.x - cx;
                      const dy = p1.y - cy;
                      if (Math.abs(dy) * rx > Math.abs(dx) * ry) {
                        const exitY = dy < 0 ? minY : maxY;
                        const dir = dy < 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
                        return { pt: { x: p1.x, y: exitY }, dir, segIndex: 1 };
                      } else {
                        const exitX = dx < 0 ? minX : maxX;
                        const dir = dx < 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
                        return { pt: { x: exitX, y: p1.y }, dir, segIndex: 1 };
                      }
                    };

                    const getEdgeBorderPoint = (
                      pt0: { x: number; y: number } | undefined,
                      pt1: { x: number; y: number } | undefined,
                      cx: number,
                      cy: number,
                      w: number,
                      h: number,
                    ) => {
                      if (!pt0) return { x: cx, y: cy };
                      const rx = w / 2;
                      const ry = h / 2;
                      const dxFromCenter = Math.abs(pt0.x - cx);
                      const dyFromCenter = Math.abs(pt0.y - cy);
                      if (dxFromCenter > rx - 2 || dyFromCenter > ry - 2) {
                        return pt0;
                      }
                      const targetPt = pt1 ?? { x: cx, y: cy };
                      const dx = targetPt.x - cx;
                      const dy = targetPt.y - cy;
                      if (Math.abs(dy) * rx > Math.abs(dx) * ry) {
                        return {
                          x: targetPt.x,
                          y: dy < 0 ? cy - ry : cy + ry,
                        };
                      } else {
                        return {
                          x: dx < 0 ? cx - rx : cx + rx,
                          y: targetPt.y,
                        };
                      }
                    };

                    const dw = diamondSize;
                    const dh = diamondSize * 0.375;

                    const diamonds = layout.edges.map((edge) => {
                      const customPos = relPositions[edge.relationship.id];
                      let x = 0;
                      let y = 0;
                      const t = 0.5;
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
                        srcBorder: { x: 0, y: 0 },
                        tgtBorder: { x: 0, y: 0 },
                        uSrc: { x: 0, y: 0 },
                        uTgt: { x: 0, y: 0 },
                        srcSegIndex: 1,
                        tgtSegIndex: 1,
                      };
                    });

                    const rerouteDiamond = (
                      diamond: (typeof diamonds)[number],
                    ) => {
                      const point = ptAtT(diamond.edge.points, diamond.t);
                      diamond.x = point.x;
                      diamond.y = point.y;

                      const { path1: basePath1, path2: basePath2 } =
                        splitPointsAtDiamond(
                          diamond.edge.points,
                          diamond.t,
                          point,
                        );
                      const edgeWaypoints = customWaypoints[diamond.edge.id];
                      const sourcePath = edgeWaypoints?.sourceWaypoints?.length
                        ? [
                            basePath1[0],
                            ...edgeWaypoints.sourceWaypoints,
                            basePath1[basePath1.length - 1],
                          ]
                        : makeOrthoPath(
                            basePath1[0],
                            basePath1[basePath1.length - 1],
                          );
                      const targetPath = edgeWaypoints?.targetWaypoints?.length
                        ? [
                            basePath2[0],
                            ...edgeWaypoints.targetWaypoints,
                            basePath2[basePath2.length - 1],
                          ]
                        : makeOrthoPath(
                            basePath2[0],
                            basePath2[basePath2.length - 1],
                          );

                      diamond.path1 = orthogonalisePath(sourcePath);
                      diamond.path2 = orthogonalisePath(targetPath);
                    };

                    const overlapsEntity = (
                      diamond: (typeof diamonds)[number],
                      node: (typeof layout.nodes)[number],
                    ) =>
                      Math.abs(diamond.x - (node.x + node.width / 2)) <
                        (diamond.w + 120) / 2 + 4 &&
                      Math.abs(diamond.y - (node.y + node.height / 2)) <
                        (diamond.h + 45) / 2 + 4;

                    // Resolve diamond collisions by sliding along path
                    const diamondCollisionIterations =
                      diamonds.length > 40 ? 10 : 30;
                    for (
                      let iter = 0;
                      iter < diamondCollisionIterations;
                      iter++
                    ) {
                      let moved = false;

                      diamonds.forEach((diamond) => {
                        if (diamond.hasCustomPos) return;
                        const occupiedNodes = layout.nodes.filter((node) =>
                          overlapsEntity(diamond, node),
                        );
                        if (occupiedNodes.length === 0) return;

                        const currentT = diamond.t;
                        const candidates = [
                          Math.max(0.12, currentT - 0.06),
                          Math.min(0.88, currentT + 0.06),
                        ];
                        const score = (candidateT: number) => {
                          const point = ptAtT(diamond.edge.points, candidateT);
                          return layout.nodes.filter(
                            (node) =>
                              Math.abs(point.x - (node.x + node.width / 2)) <
                                (diamond.w + 120) / 2 + 4 &&
                              Math.abs(point.y - (node.y + node.height / 2)) <
                                (diamond.h + 45) / 2 + 4,
                          ).length;
                        };
                        const bestT = candidates.reduce((best, candidate) =>
                          score(candidate) < score(best) ? candidate : best,
                        );

                        if (score(bestT) < occupiedNodes.length) {
                          diamond.t = bestT;
                          rerouteDiamond(diamond);
                          moved = true;
                        }
                      });

                      for (let i = 0; i < diamonds.length; i++) {
                        for (let j = i + 1; j < diamonds.length; j++) {
                          const a = diamonds[i],
                            b = diamonds[j];
                          if (!a || !b) continue;
                          if (a.hasCustomPos || b.hasCustomPos) continue;

                          if (
                            Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 &&
                            Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 4
                          ) {
                            moved = true;
                            a.t = Math.max(0.15, Math.min(0.85, a.t - 0.04));
                            b.t = Math.max(0.15, Math.min(0.85, b.t + 0.04));
                            rerouteDiamond(a);
                            rerouteDiamond(b);
                          }
                        }
                      }
                      if (!moved) break;
                    }

                    // Resolve overlapping parallel segments
                    avoidOverlappingSegments(diamonds);

                    // Collect all vertical segments in the diagram (for horizontal line jump intersections)
                    const allVerticalSegments: {
                      x: number;
                      y1: number;
                      y2: number;
                      edgeId: string;
                    }[] = [];
                    diamonds.forEach((d) => {
                      const collectFromPath = (
                        pts: { x: number; y: number }[],
                      ) => {
                        for (let i = 0; i < pts.length - 1; i++) {
                          const A = pts[i];
                          const B = pts[i + 1];
                          if (A && B && Math.abs(A.x - B.x) < 1.5) {
                            allVerticalSegments.push({
                              x: (A.x + B.x) / 2,
                              y1: A.y,
                              y2: B.y,
                              edgeId: d.edge.id,
                            });
                          }
                        }
                      };
                      collectFromPath(d.path1);
                      collectFromPath(d.path2);
                    });

                    // Collect all line segments in the diagram (for attribute collision avoidance)
                    const allSegments: {
                      p1: { x: number; y: number };
                      p2: { x: number; y: number };
                    }[] = [];
                    diamonds.forEach((d) => {
                      for (let i = 0; i < d.path1.length - 1; i++) {
                        const p1 = d.path1[i];
                        const p2 = d.path1[i + 1];
                        if (p1 && p2) {
                          allSegments.push({ p1, p2 });
                        }
                      }
                      for (let i = 0; i < d.path2.length - 1; i++) {
                        const p1 = d.path2[i];
                        const p2 = d.path2[i + 1];
                        if (p1 && p2) {
                          allSegments.push({ p1, p2 });
                        }
                      }
                    });

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

                    // Compute borders and directions using the actual orthogonal exit points
                    diamonds.forEach((d) => {
                      const sn = layout.nodes.find(
                        (n) => n.id === d.rel.sourceTable,
                      );
                      const tn = layout.nodes.find(
                        (n) => n.id === d.rel.targetTable,
                      );

                      const srcCenter = sn
                        ? { x: sn.x + sn.width / 2, y: sn.y + sn.height / 2 }
                        : d.path1[0];
                      const tgtCenter = tn
                        ? { x: tn.x + tn.width / 2, y: tn.y + tn.height / 2 }
                        : d.path2[d.path2.length - 1];

                      const srcRes = getActualOrthoBorderPoint(
                        d.path1,
                        srcCenter.x,
                        srcCenter.y,
                        120,
                        45,
                      );
                      d.srcBorder = srcRes.pt;
                      d.uSrc = srcRes.dir;
                      d.srcSegIndex = srcRes.segIndex;

                      const reversedPath2 = [...d.path2].reverse();
                      const tgtRes = getActualOrthoBorderPoint(
                        reversedPath2,
                        tgtCenter.x,
                        tgtCenter.y,
                        120,
                        45,
                      );
                      d.tgtBorder = tgtRes.pt;
                      d.uTgt = tgtRes.dir;
                      d.tgtSegIndex = tgtRes.segIndex;
                    });

                    // Compute stagger offsets
                    const staggerLevels = computeStaggerOffsets(
                      diamonds,
                      layout,
                    );

                    // Shift borders by stagger offset perpendicular to the line direction
                    const getStaggerOffsetVal = (index: number) => {
                      if (index === 0) return 0;
                      const magnitude = Math.ceil(index / 2) * 16;
                      const sign = index % 2 === 1 ? 1 : -1;
                      return magnitude * sign;
                    };

                    diamonds.forEach((d) => {
                      const srcStagger =
                        staggerLevels[`${d.edge.id}-source`] || 0;
                      const tgtStagger =
                        staggerLevels[`${d.edge.id}-target`] || 0;

                      if (srcStagger > 0) {
                        const px = -d.uSrc.y;
                        const py = d.uSrc.x;
                        const offset = getStaggerOffsetVal(srcStagger);
                        d.srcBorder.x += px * offset;
                        d.srcBorder.y += py * offset;

                        const bendIdx = d.srcSegIndex;
                        if (d.path1[bendIdx]) {
                          d.path1[bendIdx].x += px * offset;
                          d.path1[bendIdx].y += py * offset;
                        }
                      }
                      if (tgtStagger > 0) {
                        const px = -d.uTgt.y;
                        const py = d.uTgt.x;
                        const offset = getStaggerOffsetVal(tgtStagger);
                        d.tgtBorder.x += px * offset;
                        d.tgtBorder.y += py * offset;

                        const bendIdx = d.path2.length - 1 - d.tgtSegIndex;
                        if (d.path2[bendIdx]) {
                          d.path2[bendIdx].x += px * offset;
                          d.path2[bendIdx].y += py * offset;
                        }
                      }
                    });

                    // Rebuild jump intersections from the final paths. Endpoint
                    // trimming and stagger offsets above can move vertical lines.
                    allVerticalSegments.length = 0;
                    diamonds.forEach((d) => {
                      const sourcePath = [
                        d.srcBorder || d.path1[0],
                        ...d.path1.slice(1),
                      ];
                      const targetPath = [
                        ...d.path2.slice(0, d.path2.length - 1),
                        d.tgtBorder || d.path2[d.path2.length - 1],
                      ];

                      [sourcePath, targetPath].forEach((path) => {
                        for (let i = 0; i < path.length - 1; i++) {
                          const A = path[i];
                          const B = path[i + 1];
                          if (A && B && Math.abs(A.x - B.x) < 1.5) {
                            allVerticalSegments.push({
                              x: (A.x + B.x) / 2,
                              y1: A.y,
                              y2: B.y,
                              edgeId: d.edge.id,
                            });
                          }
                        }
                      });
                    });

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
                          const srcStart = d.srcBorder || path1[0];
                          const tgtEnd = d.tgtBorder || path2[path2.length - 1];
                          const adjPath1 = [srcStart, ...path1.slice(1)];
                          const adjPath2 = [
                            ...path2.slice(0, path2.length - 1),
                            tgtEnd,
                          ];
                          const d1 = generatePathDWithJumps(
                            adjPath1,
                            allVerticalSegments,
                            edge.id,
                            lineStyle,
                          );
                          const d2 = generatePathDWithJumps(
                            adjPath2,
                            allVerticalSegments,
                            edge.id,
                            lineStyle,
                          );

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
                                    className="diagram-rel-hit-zone"
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
                                    className="diagram-rel-hit-zone"
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
                          const entityCx = node.x + node.width / 2;
                          const entityCy = node.y + node.height / 2;
                          const cx = entityCx;
                          const cy = entityCy;
                          const N = table.columns.length;
                          const isEntitySelected =
                            selectedEntityName === table.name;
                          const foreignKeyColumns = new Set(
                            table.foreignKeys.flatMap((fk) =>
                              fk.columns.map((c) => c.toLowerCase()),
                            ),
                          );

                          const pkCol =
                            table.columns.find((c) => c.isPrimaryKey) ||
                            table.columns[0];
                          const pkIdx = table.columns.findIndex(
                            (c) => c.name === pkCol.name,
                          );
                          const pkKey = `${table.name}-${pkCol.name}`;
                          const pkDefaultAngle = (2 * Math.PI * pkIdx) / N;
                          const pkDefaultRadius = 85 + N * 5;
                          const pkPos = attrPositions[pkKey] || {
                            angle: pkDefaultAngle,
                            radius: pkDefaultRadius,
                          };
                          const pkX =
                            entityCx + pkPos.radius * Math.cos(pkPos.angle);
                          const pkY =
                            entityCy + pkPos.radius * Math.sin(pkPos.angle);

                          const otherCols = table.columns.filter(
                            (c) => c.name !== pkCol.name,
                          );

                          const attrs = table.columns.map((col, idx) => {
                            const isPk = col.name === pkCol.name;
                            const key = `${table.name}-${col.name}`;
                            const w_attr = Math.max(
                              60,
                              col.name.length * 8 + 16,
                            );
                            const h_attr = 30;

                            if (isPk) {
                              return {
                                col,
                                key,
                                width: w_attr,
                                height: h_attr,
                                angle: pkPos.angle,
                                radius: pkPos.radius,
                                x: pkX,
                                y: pkY,
                              };
                            } else {
                              const otherIdx = otherCols.findIndex(
                                (c) => c.name === col.name,
                              );
                              const factor = otherIdx % 2 === 0 ? 1 : -1;
                              const step = Math.floor(otherIdx / 2) + 1;
                              const defaultRelativeAngle = 0.25 * factor * step;
                              const defaultRadius = 85 + N * 5;
                              const pos = attrPositions[key] || {
                                angle: defaultRelativeAngle,
                                radius: defaultRadius,
                              };
                              const absoluteAngle = pkPos.angle + pos.angle;
                              return {
                                col,
                                key,
                                width: w_attr,
                                height: h_attr,
                                angle: pos.angle,
                                radius: pos.radius,
                                x:
                                  entityCx +
                                  pos.radius * Math.cos(absoluteAngle),
                                y:
                                  entityCy +
                                  pos.radius * Math.sin(absoluteAngle),
                              };
                            }
                          });

                          resolveCollisions(
                            attrs,
                            entityCx,
                            entityCy,
                            allSegments,
                          );

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
                                  cx={entityCx}
                                  cy={entityCy}
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
                                  x1={entityCx}
                                  y1={entityCy}
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

                          const sourceCardinality =
                            rel.sourceCardinality ?? "one";
                          const targetCardinality =
                            rel.targetCardinality ??
                            (rel.type === "1:1" ? "one" : "many");
                          const isDiamondSelected =
                            selectedRelationId === rel.id;
                          const isDiamondFocused =
                            isDiamondSelected ||
                            (selectedEntityName
                              ? edge.sourceTable === selectedEntityName ||
                                edge.targetTable === selectedEntityName
                              : false);

                          const { srcBorder, tgtBorder, uSrc, uTgt } = d;

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
                                        // Tick sits right at the outline (no inward offset)
                                        const bx = srcBorder.x + u.x * 3,
                                          by = srcBorder.y + u.y * 3;
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
                                        const tip = {
                                          x: srcBorder.x,
                                          y: srcBorder.y,
                                        };
                                        const base = {
                                          x: srcBorder.x + u.x * 10,
                                          y: srcBorder.y + u.y * 10,
                                        };
                                        return (
                                          <g>
                                            <line
                                              x1={tip.x + px * 6}
                                              y1={tip.y + py * 6}
                                              x2={base.x}
                                              y2={base.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={tip.x}
                                              y1={tip.y}
                                              x2={base.x}
                                              y2={base.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={tip.x - px * 6}
                                              y1={tip.y - py * 6}
                                              x2={base.x}
                                              y2={base.y}
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
                                        const bx = tgtBorder.x + u.x * 3,
                                          by = tgtBorder.y + u.y * 3;
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
                                        const tip = {
                                          x: tgtBorder.x,
                                          y: tgtBorder.y,
                                        };
                                        const base = {
                                          x: tgtBorder.x + u.x * 10,
                                          y: tgtBorder.y + u.y * 10,
                                        };
                                        return (
                                          <g>
                                            <line
                                              x1={tip.x + px * 6}
                                              y1={tip.y + py * 6}
                                              x2={base.x}
                                              y2={base.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={tip.x}
                                              y1={tip.y}
                                              x2={base.x}
                                              y2={base.y}
                                              stroke="#6366f1"
                                              strokeWidth={1.5}
                                              strokeLinecap="round"
                                            />
                                            <line
                                              x1={tip.x - px * 6}
                                              y1={tip.y - py * 6}
                                              x2={base.x}
                                              y2={base.y}
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
                                  <text
                                    x={srcBorder.x + uSrc.x * 12 - uSrc.y * 11}
                                    y={
                                      srcBorder.y +
                                      uSrc.y * 12 +
                                      uSrc.x * 11 +
                                      4
                                    }
                                    textAnchor="middle"
                                    fill="#bfdbfe"
                                    fontSize={10}
                                    fontWeight={700}
                                    pointerEvents="none"
                                  >
                                    {sourceCardinality === "many" ? "N" : "1"}
                                  </text>
                                  <text
                                    x={tgtBorder.x + uTgt.x * 12 - uTgt.y * 11}
                                    y={
                                      tgtBorder.y +
                                      uTgt.y * 12 +
                                      uTgt.x * 11 +
                                      4
                                    }
                                    textAnchor="middle"
                                    fill="#bfdbfe"
                                    fontSize={10}
                                    fontWeight={700}
                                    pointerEvents="none"
                                  >
                                    {targetCardinality === "many" ? "N" : "1"}
                                  </text>
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
                {mode === "lrs" &&
                  layout &&
                  (() => {
                    // 1. Group edges by table face connections
                    const tableFaceConnections: Record<
                      string,
                      Record<"left" | "right" | "top" | "bottom", string[]>
                    > = {};

                    // Initialize for all nodes
                    layout.nodes.forEach((node) => {
                      tableFaceConnections[node.table.name] = {
                        left: [],
                        right: [],
                        top: [],
                        bottom: [],
                      };
                    });

                    // Determine faces for each edge based on actual card gaps
                    layout.edges.forEach((edge) => {
                      const sn = layout.nodes.find(
                        (n) => n.table.name === edge.sourceTable,
                      );
                      const tn = layout.nodes.find(
                        (n) => n.table.name === edge.targetTable,
                      );
                      if (!sn || !tn) return;

                      const sW = getLrsTableWidth(
                        sn.table,
                        showLrsDataTypes,
                        lrsKeyNotation,
                      );
                      const sH = 42 + sn.table.columns.length * 26 + 8;
                      const tW = getLrsTableWidth(
                        tn.table,
                        showLrsDataTypes,
                        lrsKeyNotation,
                      );
                      const tH = 42 + tn.table.columns.length * 26 + 8;

                      const sL = sn.x + sn.width / 2 - sW / 2;
                      const sR = sL + sW;
                      const sT = sn.y + sn.height / 2 - sH / 2;
                      const sB = sT + sH;

                      const tL = tn.x + tn.width / 2 - tW / 2;
                      const tR = tL + tW;
                      const tT = tn.y + tn.height / 2 - tH / 2;
                      const tB = tT + tH;

                      const isLeft = sR <= tL;
                      const isRight = tR <= sL;
                      const isAbove = sB <= tT;
                      const isBelow = tB <= sT;

                      let srcFace: "left" | "right" | "top" | "bottom";
                      let tgtFace: "left" | "right" | "top" | "bottom";

                      if (isBelow && isLeft) {
                        // Source is Bottom-Left, Target is Top-Right -> Exit Top of Source, Enter Left of Target
                        srcFace = "top";
                        tgtFace = "left";
                      } else if (isBelow && isRight) {
                        // Source is Bottom-Right, Target is Top-Left -> Exit Left of Source, Enter Bottom of Target
                        srcFace = "left";
                        tgtFace = "bottom";
                      } else if (isAbove && isLeft) {
                        // Source is Top-Left, Target is Bottom-Right -> Exit Bottom of Source, Enter Left of Target
                        srcFace = "bottom";
                        tgtFace = "left";
                      } else if (isAbove && isRight) {
                        // Source is Top-Right, Target is Bottom-Left -> Exit Bottom of Source, Enter Right of Target
                        srcFace = "bottom";
                        tgtFace = "right";
                      } else if (isBelow) {
                        // Source directly Below Target
                        srcFace = "top";
                        tgtFace = "bottom";
                      } else if (isAbove) {
                        // Source directly Above Target
                        srcFace = "bottom";
                        tgtFace = "top";
                      } else if (isLeft) {
                        // Source directly Left of Target
                        srcFace = "right";
                        tgtFace = "left";
                      } else if (isRight) {
                        // Source directly Right of Target
                        srcFace = "left";
                        tgtFace = "right";
                      } else {
                        // Overlapping boxes: compare centers
                        const srcCenterX = sL + sW / 2;
                        const srcCenterY = sT + sH / 2;
                        const tgtCenterX = tL + tW / 2;
                        const tgtCenterY = tT + tH / 2;
                        const dx = tgtCenterX - srcCenterX;
                        const dy = tgtCenterY - srcCenterY;

                        if (Math.abs(dx) >= Math.abs(dy)) {
                          srcFace = dx >= 0 ? "right" : "left";
                          tgtFace = dx >= 0 ? "left" : "right";
                        } else {
                          srcFace = dy >= 0 ? "bottom" : "top";
                          tgtFace = dy >= 0 ? "top" : "bottom";
                        }
                      }

                      tableFaceConnections[edge.sourceTable][srcFace].push(
                        edge.id,
                      );
                      tableFaceConnections[edge.targetTable][tgtFace].push(
                        edge.id,
                      );
                    });

                    // Sort connections to prevent line crossings
                    layout.nodes.forEach((node) => {
                      const name = node.table.name;
                      const faces = tableFaceConnections[name];
                      if (!faces) return;

                      const getOtherCenter = (edgeId: string, isX: boolean) => {
                        const edge = layout.edges.find((e) => e.id === edgeId);
                        if (!edge) return 0;
                        const otherTableName =
                          edge.sourceTable === name
                            ? edge.targetTable
                            : edge.sourceTable;
                        const otherNode = layout.nodes.find(
                          (n) => n.table.name === otherTableName,
                        );
                        if (!otherNode) return 0;
                        return isX
                          ? otherNode.x + otherNode.width / 2
                          : otherNode.y + otherNode.height / 2;
                      };

                      faces.left.sort(
                        (a, b) =>
                          getOtherCenter(a, false) - getOtherCenter(b, false),
                      );
                      faces.right.sort(
                        (a, b) =>
                          getOtherCenter(a, false) - getOtherCenter(b, false),
                      );
                      faces.top.sort(
                        (a, b) =>
                          getOtherCenter(a, true) - getOtherCenter(b, true),
                      );
                      faces.bottom.sort(
                        (a, b) =>
                          getOtherCenter(a, true) - getOtherCenter(b, true),
                      );
                    });

                    // Helper to get port coords
                    const getPortCoords = (
                      tableName: string,
                      edgeId: string,
                    ) => {
                      const node = layout.nodes.find(
                        (n) => n.table.name === tableName,
                      );
                      if (!node)
                        return {
                          x: 0,
                          y: 0,
                          dir: { x: 0, y: 0 },
                          face: "left" as const,
                        };

                      // Find which face this edge is on
                      const faces = tableFaceConnections[tableName];
                      let face: "left" | "right" | "top" | "bottom" = "left";
                      if (faces.left.includes(edgeId)) face = "left";
                      else if (faces.right.includes(edgeId)) face = "right";
                      else if (faces.top.includes(edgeId)) face = "top";
                      else if (faces.bottom.includes(edgeId)) face = "bottom";

                      const tWidth = getLrsTableWidth(
                        node.table,
                        showLrsDataTypes,
                        lrsKeyNotation,
                      );
                      const tHeight = 42 + node.table.columns.length * 26 + 8;

                      // Snap the table card origin tx, ty to 10px grid
                      const snapToGrid = (val: number) =>
                        Math.round(val / 10) * 10;
                      const tx = snapToGrid(
                        node.x + node.width / 2 - tWidth / 2,
                      );
                      const ty = snapToGrid(
                        node.y + node.height / 2 - tHeight / 2,
                      );

                      const edgeIds = faces[face];
                      const idx = edgeIds.indexOf(edgeId);
                      const count = edgeIds.length;

                      // Get other table's center coordinate for dynamic projection
                      const edge = layout.edges.find((e) => e.id === edgeId);
                      const otherTableName = edge
                        ? edge.sourceTable === tableName
                          ? edge.targetTable
                          : edge.sourceTable
                        : "";
                      const otherNode = layout.nodes.find(
                        (n) => n.table.name === otherTableName,
                      );
                      
                      let otherCX = tx + tWidth / 2;
                      let otherCY = ty + tHeight / 2;
                      if (otherNode) {
                        const otherW = getLrsTableWidth(
                          otherNode.table,
                          showLrsDataTypes,
                          lrsKeyNotation,
                        );
                        const otherH = 42 + otherNode.table.columns.length * 26 + 8;
                        otherCX = snapToGrid(otherNode.x + otherNode.width / 2 - otherW / 2 + otherW / 2);
                        otherCY = snapToGrid(otherNode.y + otherNode.height / 2 - otherH / 2 + otherH / 2);
                      }

                      if (face === "left") {
                        const prefY = Math.max(ty + 10, Math.min(ty + tHeight - 10, otherCY));
                        const yRaw = prefY + (idx - (count - 1) / 2) * 20;
                        const yClamped = Math.max(ty + 10, Math.min(ty + tHeight - 10, yRaw));
                        return {
                          x: tx,
                          y: snapToGrid(yClamped),
                          dir: { x: -1, y: 0 },
                          face,
                        };
                      } else if (face === "right") {
                        const prefY = Math.max(ty + 10, Math.min(ty + tHeight - 10, otherCY));
                        const yRaw = prefY + (idx - (count - 1) / 2) * 20;
                        const yClamped = Math.max(ty + 10, Math.min(ty + tHeight - 10, yRaw));
                        return {
                          x: tx + tWidth,
                          y: snapToGrid(yClamped),
                          dir: { x: 1, y: 0 },
                          face,
                        };
                      } else if (face === "top") {
                        const prefX = Math.max(tx + 10, Math.min(tx + tWidth - 10, otherCX));
                        const xRaw = prefX + (idx - (count - 1) / 2) * 20;
                        const xClamped = Math.max(tx + 10, Math.min(tx + tWidth - 10, xRaw));
                        return {
                          x: snapToGrid(xClamped),
                          y: ty,
                          dir: { x: 0, y: -1 },
                          face,
                        };
                      } else {
                        const prefX = Math.max(tx + 10, Math.min(tx + tWidth - 10, otherCX));
                        const xRaw = prefX + (idx - (count - 1) / 2) * 20;
                        const xClamped = Math.max(tx + 10, Math.min(tx + tWidth - 10, xRaw));
                        return {
                          x: snapToGrid(xClamped),
                          y: ty + tHeight,
                          dir: { x: 0, y: 1 },
                          face,
                        };
                      }
                    };

                    // Create obstacles list for avoidance
                    const obstacles: LrsObstacle[] = layout.nodes.map((node) => {
                      const tWidth = getLrsTableWidth(
                        node.table,
                        showLrsDataTypes,
                        lrsKeyNotation,
                      );
                      const tHeight = 42 + node.table.columns.length * 26 + 8;
                      const snapToGrid = (val: number) =>
                        Math.round(val / 10) * 10;
                      const tx = snapToGrid(
                        node.x + node.width / 2 - tWidth / 2,
                      );
                      const ty = snapToGrid(
                        node.y + node.height / 2 - tHeight / 2,
                      );
                      return {
                        name: node.table.name,
                        x1: tx,
                        x2: tx + tWidth,
                        y1: ty,
                        y2: ty + tHeight,
                      };
                    });

                    // Compute all routes
                    const computedRoutes = layout.edges.map(
                      (edge, edgeIndex) => {
                        const rel = edge.relationship;
                        const sourcePort = getPortCoords(
                          edge.sourceTable,
                          edge.id,
                        );
                        const targetPort = getPortCoords(
                          edge.targetTable,
                          edge.id,
                        );

                        const sharedEndpointCount = layout.edges
                          .slice(0, edgeIndex)
                          .filter(
                            (candidate) =>
                              candidate.sourceTable === edge.sourceTable ||
                              candidate.targetTable === edge.sourceTable ||
                              candidate.sourceTable === edge.targetTable ||
                              candidate.targetTable === edge.targetTable,
                          ).length;
                        const routeOffset =
                          sharedEndpointCount === 0
                            ? 0
                            : ((sharedEndpointCount + 1) % 3) * 20 - 20;

                        const gapX = Math.abs(targetPort.x - sourcePort.x);
                        const gapY = Math.abs(targetPort.y - sourcePort.y);
                        const marginX = Math.max(10, Math.min(40, gapX / 2));
                        const marginY = Math.max(10, Math.min(40, gapY / 2));

                        const pSource = {
                          x: sourcePort.x + (sourcePort.face === "right" ? marginX : sourcePort.face === "left" ? -marginX : 0),
                          y: sourcePort.y + (sourcePort.face === "bottom" ? marginY : sourcePort.face === "top" ? -marginY : 0),
                        };

                        const pTarget = {
                          x: targetPort.x + (targetPort.face === "right" ? marginX : targetPort.face === "left" ? -marginX : 0),
                          y: targetPort.y + (targetPort.face === "bottom" ? marginY : targetPort.face === "top" ? -marginY : 0),
                        };

                        const rawMiddleRoute = findOrthogonalShortestRoute(
                          pSource,
                          pTarget,
                          sourcePort.face,
                          targetPort.face,
                          edge.sourceTable,
                          edge.targetTable,
                          obstacles,
                          routeOffset,
                        );

                        // Reconstruct the full route starting/ending cleanly at actual port boundaries
                        const route = simplifyPath([
                          sourcePort,
                          ...rawMiddleRoute,
                          targetPort,
                        ]);

                        return {
                          edge,
                          route,
                          sourceBorder: sourcePort,
                          targetBorder: targetPort,
                          sourceDirection: sourcePort.dir,
                          targetDirection: targetPort.dir,
                        };
                      },
                    );

                    // Collect vertical segments for arc jumps
                    const lrsVerticalSegments: {
                      x: number;
                      y1: number;
                      y2: number;
                      edgeId: string;
                    }[] = [];
                    computedRoutes.forEach(({ route, edge }) => {
                      for (let i = 0; i < route.length - 1; i++) {
                        const A = route[i];
                        const B = route[i + 1];
                        if (A && B && Math.abs(A.x - B.x) < 1.5) {
                          lrsVerticalSegments.push({
                            x: (A.x + B.x) / 2,
                            y1: A.y,
                            y2: B.y,
                            edgeId: edge.id,
                          });
                        }
                      }
                    });

                    return (
                      <>
                        {/* 1. Draw Connectors (Orthogonal lines with jumps) */}
                        {computedRoutes.map(
                          ({
                            edge,
                            route,
                            sourceBorder,
                            targetBorder,
                            sourceDirection,
                            targetDirection,
                          }) => {
                            const rel = edge.relationship;
                            const isEdgeFocused = selectedEntityName
                              ? edge.sourceTable === selectedEntityName ||
                                edge.targetTable === selectedEntityName
                              : false;
                            const pathD = generatePathDWithJumps(
                              route,
                              lrsVerticalSegments,
                              edge.id,
                              lineStyle,
                            );

                            const sourceCardinality =
                              rel.sourceCardinality ?? "one";
                            const targetCardinality =
                              rel.targetCardinality ??
                              (rel.type === "1:1" ? "one" : "many");

                            return (
                              <g key={edge.id}>
                                <path
                                  d={pathD}
                                  fill="none"
                                  stroke={isEdgeFocused ? "#60a5fa" : "#2563eb"}
                                  strokeWidth={isEdgeFocused ? 2.25 : 1.5}
                                  className="diagram-rel-line"
                                />
                                {relNotation === "crowsfoot" && (
                                  <>
                                    {renderCrowFootMarker(
                                      sourceBorder,
                                      sourceDirection,
                                      sourceCardinality,
                                      `${edge.id}-source-marker`,
                                    )}
                                    {renderCrowFootMarker(
                                      targetBorder,
                                      targetDirection,
                                      targetCardinality,
                                      `${edge.id}-target-marker`,
                                    )}
                                  </>
                                )}
                                {relNotation === "label" && (
                                  <>
                                    <text
                                      x={sourceBorder.x}
                                      y={sourceBorder.y - 8}
                                      textAnchor="middle"
                                      fill="#a1a1aa"
                                      className="text-[10px] font-semibold font-mono"
                                    >
                                      {sourceCardinality === "many" ? "N" : "1"}
                                    </text>
                                    <text
                                      x={targetBorder.x}
                                      y={targetBorder.y - 8}
                                      textAnchor="middle"
                                      fill="#a1a1aa"
                                      className="text-[10px] font-semibold font-mono"
                                    >
                                      {targetCardinality === "many" ? "N" : "1"}
                                    </text>
                                  </>
                                )}
                              </g>
                            );
                          },
                        )}

                        {/* 2. Draw Table Rows Blocks */}
                        {layout.nodes.map((node) => {
                          const table = node.table;
                          const cx = node.x + node.width / 2;
                          const cy = node.y + node.height / 2;
                          const tWidth = getLrsTableWidth(
                            table,
                            showLrsDataTypes,
                            lrsKeyNotation,
                          );
                          const tHeight = 42 + table.columns.length * 26 + 8;
                          const snapToGrid = (value: number) =>
                            Math.round(value / 10) * 10;
                          const tx = snapToGrid(cx - tWidth / 2);
                          const ty = snapToGrid(cy - tHeight / 2);

                          return (
                            <g
                              key={node.id}
                              onPointerDown={(e) =>
                                handleEntityPointerDown(e, table.name)
                              }
                              onPointerMove={(e) => {
                                if (draggingEntity?.tableName === table.name) {
                                  handleEntityDrag(e.clientX, e.clientY);
                                }
                              }}
                              onPointerUp={(e) => {
                                e.currentTarget.releasePointerCapture(
                                  e.pointerId,
                                );
                                setDraggingEntity(null);
                                if (hasDragged) saveHistory();
                              }}
                              className="cursor-move"
                            >
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
                                      )}
                                      {showLrsDataTypes && (
                                        <tspan
                                          fill="#ffffff"
                                          className="text-[9px]"
                                        >
                                          {` (${col.type})`}
                                        </tspan>
                                      )}
                                    </text>
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })}

                        {/* Keep LRS connectors visible above table cards. */}
                        {computedRoutes.map(
                          ({
                            edge,
                            route,
                            sourceBorder,
                            targetBorder,
                            sourceDirection,
                            targetDirection,
                          }) => {
                            const rel = edge.relationship;
                            const sourceCardinality =
                              rel.sourceCardinality ?? "one";
                            const targetCardinality =
                              rel.targetCardinality ??
                              (rel.type === "1:1" ? "one" : "many");
                            const pathD = generatePathDWithJumps(
                              route,
                              lrsVerticalSegments,
                              edge.id,
                              lineStyle,
                            );

                            return (
                              <g
                                key={`lrs-overlay-${edge.id}`}
                                pointerEvents="none"
                              >
                                <path
                                  d={pathD}
                                  fill="none"
                                  stroke={
                                    selectedEntityName &&
                                    (edge.sourceTable === selectedEntityName ||
                                      edge.targetTable === selectedEntityName)
                                      ? "#60a5fa"
                                      : "#2563eb"
                                  }
                                  strokeWidth={1.5}
                                  className="diagram-rel-line"
                                />
                                {relNotation === "crowsfoot" && (
                                  <>
                                    {renderCrowFootMarker(
                                      sourceBorder,
                                      sourceDirection,
                                      sourceCardinality,
                                      `lrs-overlay-${edge.id}-source`,
                                    )}
                                    {renderCrowFootMarker(
                                      targetBorder,
                                      targetDirection,
                                      targetCardinality,
                                      `lrs-overlay-${edge.id}-target`,
                                    )}
                                  </>
                                )}
                                {relNotation === "label" && (
                                  <>
                                    <text
                                      x={sourceBorder.x}
                                      y={sourceBorder.y - 8}
                                      textAnchor="middle"
                                      fill="#a1a1aa"
                                      className="text-[10px] font-semibold font-mono"
                                    >
                                      {sourceCardinality === "many" ? "N" : "1"}
                                    </text>
                                    <text
                                      x={targetBorder.x}
                                      y={targetBorder.y - 8}
                                      textAnchor="middle"
                                      fill="#a1a1aa"
                                      className="text-[10px] font-semibold font-mono"
                                    >
                                      {targetCardinality === "many" ? "N" : "1"}
                                    </text>
                                  </>
                                )}
                              </g>
                            );
                          },
                        )}
                      </>
                    );
                  })()}

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
                                {rel.sourceCardinality === "many" ? "N" : "1"}
                              </text>
                              {/* End point label (Target) */}
                              <text
                                x={edge.points[edge.points.length - 1].x - 15}
                                y={edge.points[edge.points.length - 1].y - 5}
                                fill="#a1a1aa"
                                className="text-[9px] font-semibold font-mono"
                              >
                                {rel.targetCardinality === "many" ? "N" : "1"}
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
                      const t = 0.5;
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
                    const relationCollisionIterations =
                      layout.nodes.length + layout.edges.length > 80 ? 10 : 30;
                    for (
                      let iter = 0;
                      iter < relationCollisionIterations;
                      iter++
                    ) {
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
                      const basePath1: { x: number; y: number }[] = [];
                      const basePath2: { x: number; y: number }[] = [];

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
                                    className="diagram-rel-hit-zone"
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
                                    className="diagram-rel-hit-zone"
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

                                const cx = node.x + node.width / 2;
                                const cy = node.y + node.height / 2;
                                const numCols = table.columns.length;
                                const boxWidth = 160;
                                const boxHeight = 40 + 15 + numCols * 20 + 15;
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
                            sn ? sn.width : 160,
                            sn ? sn.height : hSrc,
                          );
                          const tgtBorder = getBorderPoint(
                            tgtCenter,
                            tgtPt2,
                            tn ? tn.width : 160,
                            tn ? tn.height : hTgt,
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
                                    const tip = {
                                      x: srcBorder.x,
                                      y: srcBorder.y,
                                    };
                                    const base = {
                                      x: srcBorder.x + u.x * 12,
                                      y: srcBorder.y + u.y * 12,
                                    };
                                    return (
                                      <g>
                                        <line
                                          x1={tip.x + px * 6}
                                          y1={tip.y + py * 6}
                                          x2={base.x}
                                          y2={base.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={tip.x}
                                          y1={tip.y}
                                          x2={base.x}
                                          y2={base.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={tip.x - px * 6}
                                          y1={tip.y - py * 6}
                                          x2={base.x}
                                          y2={base.y}
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
                                    const tip = {
                                      x: tgtBorder.x,
                                      y: tgtBorder.y,
                                    };
                                    const base = {
                                      x: tgtBorder.x + u.x * 12,
                                      y: tgtBorder.y + u.y * 12,
                                    };
                                    return (
                                      <g>
                                        <line
                                          x1={tip.x + px * 6}
                                          y1={tip.y + py * 6}
                                          x2={base.x}
                                          y2={base.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={tip.x}
                                          y1={tip.y}
                                          x2={base.x}
                                          y2={base.y}
                                          stroke={colors.stroke}
                                          strokeWidth={1.5}
                                          strokeLinecap="round"
                                        />
                                        <line
                                          x1={tip.x - px * 6}
                                          y1={tip.y - py * 6}
                                          x2={base.x}
                                          y2={base.y}
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

function closestPointOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return { x: a.x, y: a.y };

  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  return {
    x: a.x + t * abx,
    y: a.y + t * aby,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function avoidOverlappingSegments(diamonds: any[]) {
  interface SegRef {
    edgeId: string;
    pathKey: "path1" | "path2";
    ptIndex: number;
    isHorizontal: boolean;
    coord: number;
    minVal: number;
    maxVal: number;
  }

  const hSegs: SegRef[] = [];
  const vSegs: SegRef[] = [];

  diamonds.forEach((d) => {
    const processPath = (
      pts: { x: number; y: number }[],
      pathKey: "path1" | "path2",
    ) => {
      if (pts.length < 3) return;
      for (let i = 1; i <= pts.length - 2; i++) {
        const A = pts[i];
        const B = pts[i + 1];
        if (!A || !B) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        if (Math.abs(dy) < 1.5) {
          hSegs.push({
            edgeId: d.edge.id,
            pathKey,
            ptIndex: i,
            isHorizontal: true,
            coord: (A.y + B.y) / 2,
            minVal: Math.min(A.x, B.x),
            maxVal: Math.max(A.x, B.x),
          });
        } else if (Math.abs(dx) < 1.5) {
          vSegs.push({
            edgeId: d.edge.id,
            pathKey,
            ptIndex: i,
            isHorizontal: false,
            coord: (A.x + B.x) / 2,
            minVal: Math.min(A.y, B.y),
            maxVal: Math.max(A.y, B.y),
          });
        }
      }
    };
    processPath(d.path1, "path1");
    processPath(d.path2, "path2");
  });

  const resolveOverlap = (segs: SegRef[], spacing: number) => {
    const maxIters = 8;
    let changed = true;
    for (let iter = 0; iter < maxIters && changed; iter++) {
      changed = false;
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const s1 = segs[i];
          const s2 = segs[j];
          if (!s1 || !s2) continue;
          if (s1.edgeId === s2.edgeId && s1.pathKey === s2.pathKey) continue;

          const diff = s1.coord - s2.coord;
          if (Math.abs(diff) < spacing) {
            const overlap =
              Math.min(s1.maxVal, s2.maxVal) - Math.max(s1.minVal, s2.minVal);
            if (overlap > 5) {
              changed = true;
              const push = (spacing - Math.abs(diff)) / 2 + 1;
              const dir = diff >= 0 ? 1 : -1;
              s1.coord += dir * push;
              s2.coord -= dir * push;
            }
          }
        }
      }
    }
  };

  resolveOverlap(hSegs, 10);
  resolveOverlap(vSegs, 10);

  const applyCoords = (segs: SegRef[]) => {
    segs.forEach((s) => {
      const d = diamonds.find((dia) => dia.edge.id === s.edgeId);
      if (!d) return;
      const pts = s.pathKey === "path1" ? d.path1 : d.path2;
      if (s.isHorizontal) {
        if (pts[s.ptIndex]) pts[s.ptIndex].y = s.coord;
        if (pts[s.ptIndex + 1]) pts[s.ptIndex + 1].y = s.coord;
      } else {
        if (pts[s.ptIndex]) pts[s.ptIndex].x = s.coord;
        if (pts[s.ptIndex + 1]) pts[s.ptIndex + 1].x = s.coord;
      }
    });
  };

  applyCoords(hSegs);
  applyCoords(vSegs);
}

function drawHorizontalSegmentWithJumps(
  A: { x: number; y: number },
  B: { x: number; y: number },
  allVerticalSegments: { x: number; y1: number; y2: number; edgeId: string }[],
  currentEdgeId: string,
): string {
  const y = A.y;
  const xStart = A.x;
  const xEnd = B.x;

  const minX = Math.min(xStart, xEnd);
  const maxX = Math.max(xStart, xEnd);

  const r = 5;

  const intersections: number[] = [];
  allVerticalSegments.forEach((v) => {
    if (v.edgeId === currentEdgeId) return;
    if (v.x > minX + r + 1 && v.x < maxX - r - 1) {
      const minY = Math.min(v.y1, v.y2);
      const maxY = Math.max(v.y1, v.y2);
      if (y > minY + 2 && y < maxY - 2) {
        intersections.push(v.x);
      }
    }
  });

  if (intersections.length === 0) {
    return `L ${B.x} ${B.y}`;
  }

  if (xStart < xEnd) {
    intersections.sort((a, b) => a - b);
  } else {
    intersections.sort((a, b) => b - a);
  }

  let d = "";
  const dx = xStart < xEnd ? 1 : -1;
  const sweepFlag = xStart < xEnd ? 0 : 1;

  let lastX = xStart;
  intersections.forEach((vx) => {
    const jumpStart = vx - r * dx;
    const jumpEnd = vx + r * dx;

    if (
      (xStart < xEnd && jumpStart > lastX + 1) ||
      (xStart > xEnd && jumpStart < lastX - 1)
    ) {
      d += ` L ${jumpStart} ${y} A ${r} ${r} 0 0 ${sweepFlag} ${jumpEnd} ${y}`;
      lastX = jumpEnd;
    }
  });

  d += ` L ${xEnd} ${y}`;
  return d;
}

function getRoundedPathDWithJumps(
  pts: { x: number; y: number }[],
  radius = 0,
  allVerticalSegments: {
    x: number;
    y1: number;
    y2: number;
    edgeId: string;
  }[] = [],
  currentEdgeId = "",
): string {
  if (pts.length <= 1) return "";
  if (pts.length === 2) {
    const A = pts[0];
    const B = pts[1];
    if (!A || !B) return "";
    let d = `M ${A.x} ${A.y}`;
    if (Math.abs(A.y - B.y) < 1.5) {
      d += drawHorizontalSegmentWithJumps(
        A,
        B,
        allVerticalSegments,
        currentEdgeId,
      );
    } else {
      d += ` L ${B.x} ${B.y}`;
    }
    return d;
  }

  const firstPt = pts[0];
  if (!firstPt) return "";
  let d = `M ${firstPt.x} ${firstPt.y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    if (!prev || !curr || !next) continue;

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const r = Math.min(radius, len1 / 2, len2 / 2);

    if (r <= 0) {
      if (Math.abs(prev.y - curr.y) < 1.5) {
        d += drawHorizontalSegmentWithJumps(
          prev,
          curr,
          allVerticalSegments,
          currentEdgeId,
        );
      } else {
        d += ` L ${curr.x} ${curr.y}`;
      }
      continue;
    }

    const startX = curr.x + (dx1 / len1) * r;
    const startY = curr.y + (dy1 / len1) * r;

    const endX = curr.x + (dx2 / len2) * r;
    const endY = curr.y + (dy2 / len2) * r;

    const segmentStart = prev;
    const segmentEnd = { x: startX, y: startY };
    if (Math.abs(segmentStart.y - segmentEnd.y) < 1.5) {
      d += drawHorizontalSegmentWithJumps(
        segmentStart,
        segmentEnd,
        allVerticalSegments,
        currentEdgeId,
      );
    } else {
      d += ` L ${startX} ${startY}`;
    }

    d += ` Q ${curr.x} ${curr.y} ${endX} ${endY}`;
  }

  const penultimate = pts[pts.length - 2];
  const last = pts[pts.length - 1];
  if (!penultimate || !last) return d;

  let lastSegStart = penultimate;
  if (radius > 0 && pts.length > 2) {
    const prevNode = pts[pts.length - 3];
    if (prevNode) {
      const dx1 = prevNode.x - penultimate.x;
      const dy1 = prevNode.y - penultimate.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = last.x - penultimate.x;
      const dy2 = last.y - penultimate.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const r = Math.min(radius, len1 / 2, len2 / 2);
      if (r > 0) {
        lastSegStart = {
          x: penultimate.x + (dx2 / len2) * r,
          y: penultimate.y + (dy2 / len2) * r,
        };
      }
    }
  }

  if (Math.abs(lastSegStart.y - last.y) < 1.5) {
    d += drawHorizontalSegmentWithJumps(
      lastSegStart,
      last,
      allVerticalSegments,
      currentEdgeId,
    );
  } else {
    d += ` L ${last.x} ${last.y}`;
  }

  return d;
}

function generatePathDWithJumps(
  path: { x: number; y: number }[],
  allVerticalSegments: { x: number; y1: number; y2: number; edgeId: string }[],
  currentEdgeId: string,
  lineStyle: string,
): string {
  return getRoundedPathDWithJumps(
    path,
    lineStyle === "rounded" ? 8 : lineStyle === "curved" ? 32 : 0,
    allVerticalSegments,
    currentEdgeId,
  );
}

function resolveCollisions(
  attrs: AttrPosition[],
  cx: number,
  cy: number,
  allSegments: {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
  }[] = [],
) {
  const maxIterations = allSegments.length > 80 ? 8 : 25;
  let changed = true;

  for (let iter = 0; iter < maxIterations && changed; iter++) {
    changed = false;
    for (let i = 0; i < attrs.length; i++) {
      for (let j = i + 1; j < attrs.length; j++) {
        const a = attrs[i];
        const b = attrs[j];
        if (!a || !b) continue;

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

    if (allSegments.length > 0) {
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        if (!a) continue;
        for (const seg of allSegments) {
          const p = closestPointOnSegment(a, seg.p1, seg.p2);
          const dx = a.x - p.x;
          const dy = a.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = Math.max(a.width / 2, a.height / 2) + 14;

          if (dist < minDist) {
            changed = true;
            const overlap = minDist - dist;
            const pushX = (dx / dist) * overlap * 0.6;
            const pushY = (dy / dist) * overlap * 0.6;

            a.x += pushX;
            a.y += pushY;

            const dxA = a.x - cx;
            const dyA = a.y - cy;
            a.radius = Math.max(
              50,
              Math.min(350, Math.sqrt(dxA * dxA + dyA * dyA)),
            );
            a.angle = Math.atan2(dyA, dxA);
          }
        }
      }
    }
  }
}

function computeStaggerOffsets(
  diamonds: {
    edge: { id: string; sourceTable: string; targetTable: string };
    srcBorder?: { x: number; y: number };
    tgtBorder?: { x: number; y: number };
    uSrc?: { x: number; y: number };
    uTgt?: { x: number; y: number };
  }[],
  layout: {
    nodes: {
      table: { name: string };
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
  } | null,
) {
  const staggers: Record<string, number> = {};
  if (!layout) return staggers;

  layout.nodes.forEach((node) => {
    const tableName = node.table.name;

    interface Connection {
      edgeId: string;
      role: "source" | "target";
      pt: { x: number; y: number };
      u: { x: number; y: number };
    }

    const conns: Connection[] = [];

    diamonds.forEach((d) => {
      if (d.edge.sourceTable === tableName && d.srcBorder && d.uSrc) {
        conns.push({
          edgeId: d.edge.id,
          role: "source",
          pt: d.srcBorder,
          u: d.uSrc,
        });
      }
      if (d.edge.targetTable === tableName && d.tgtBorder && d.uTgt) {
        conns.push({
          edgeId: d.edge.id,
          role: "target",
          pt: d.tgtBorder,
          u: d.uTgt,
        });
      }
    });

    const sides: Record<string, Connection[]> = {
      top: [],
      bottom: [],
      left: [],
      right: [],
    };

    conns.forEach((c) => {
      if (c.u.y < -0.7) sides.top.push(c);
      else if (c.u.y > 0.7) sides.bottom.push(c);
      else if (c.u.x < -0.7) sides.left.push(c);
      else if (c.u.x > 0.7) sides.right.push(c);
    });

    const processSide = (sideConns: Connection[], sortByX: boolean) => {
      if (sortByX) {
        sideConns.sort((a, b) => a.pt.x - b.pt.x);
      } else {
        sideConns.sort((a, b) => a.pt.y - b.pt.y);
      }

      let prevCoord = -9999;
      let level = 0;

      sideConns.forEach((c) => {
        const coord = sortByX ? c.pt.x : c.pt.y;
        if (Math.abs(coord - prevCoord) < 16) {
          level++;
        } else {
          level = 0;
        }
        staggers[`${c.edgeId}-${c.role}`] = level;
        prevCoord = coord;
      });
    };

    processSide(sides.top, true);
    processSide(sides.bottom, true);
    processSide(sides.left, false);
    processSide(sides.right, false);
  });

  return staggers;
}
