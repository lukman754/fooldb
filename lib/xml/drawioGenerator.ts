import { LayoutData, Column } from '@/types';

// Helper to escape XML characters
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Maps Indonesian/English HR & Payroll relations to match hand-drawn schemas
export function getRelationshipLabel(source: string, target: string): string {
  const s = source.toLowerCase();
  const t = target.toLowerCase();

  // Exact mappings from the Indonesian schema
  if (s === 'payroll' && t === 'salary_slips') return 'Menghasilkan';
  if (s === 'payroll' && t === 'payroll_details') return 'Memiliki';
  if (s === 'payroll' && t === 'employees') return 'Menerima';
  if (s === 'attendance' && t === 'employees') return 'Melakukan';
  if (s === 'qr_scan_logs' && t === 'qr_codes') return 'Tercatat';
  if (s === 'qr_scan_logs' && t === 'employees') return 'Melakukan Pemindaian';
  if (s === 'employees' && t === 'positions') return 'Menerima';
  if (s === 'employees' && t === 'leave_requests') return 'Mengajukan';
  if (s === 'employees' && t === 'payroll') return 'Menerima';
  if (s === 'employees' && t === 'overtime') return 'Melakukan';
  if (s === 'employees' && t === 'attendance') return 'Melakukan';
  if (s === 'positions' && t === 'employees') return 'Dimiliki oleh';
  if (s === 'office_locations' && t === 'qr_codes') return 'Menyediakan';
  if (s === 'users' && t === 'leave_requests') return 'Menyetujui<div>/ Menolak</div>';
  if (s === 'users' && t === 'overtime') return 'Menambahkan';
  if (s === 'leave_requests' && t === 'users') return 'Menyetujui<div>/ Menolak</div>';
  if (s === 'overtime' && t === 'users') return 'Menambahkan';
  if (s === 'leave_requests' && t === 'employees') return 'Mengajukan';
  if (s === 'overtime' && t === 'employees') return 'Melakukan';
  if (s === 'attendance' && t === 'qr_codes') return 'Digunakan';

  // Fallbacks
  if (s === 'users' && t === 'profiles') return 'Memiliki';
  if (s === 'users' && t === 'employees') return 'Memiliki Profil';
  if (s === 'users' && t === 'orders') return 'Membuat';
  if (s === 'orders' && t === 'order_items') return 'Memiliki';
  if (s === 'products' && t === 'order_items') return 'Dipesan';
  
  return 'Memiliki';
}

export function generateDrawioXml(
  layoutData: LayoutData,
  attrPositions?: { [key: string]: { angle: number; radius: number } },
  relNotation: 'crowsfoot' | 'label' = 'crowsfoot'
): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram name="Page-1" id="gHxV2qfAr26GcpHgv2kp">\n';
  xml += '    <mxGraphModel dx="2119" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  // 1. Generate Entity Tables (Rounded Rectangles) & Attributes (Ellipses Orbiting)
  for (const node of layoutData.nodes) {
    const table = node.table;
    const tableId = `table_${table.name}`;
    const escapedTableName = escapeXml(table.name);

    // Entity Box Style (rounded rectangle)
    const tableStyle = 'rounded=1;arcSize=10;whiteSpace=wrap;html=1;align=center;fillColor=#1e293b;strokeColor=#475569;fontColor=#f8fafc;strokeWidth=1.5;';
    
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const tx = cx - 60;
    const ty = cy - 22.5;

    xml += `        <mxCell id="${tableId}" parent="1" style="${tableStyle}" value="${escapedTableName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="120" height="45" as="geometry" />\n`;
    xml += '        </mxCell>\n';

    // Calculate orbiting positions for attributes
    const N = table.columns.length;

    // 1. Build initial list of attribute positions
    const attrs = table.columns.map((col, idx) => {
      const key = `${table.name}-${col.name}`;
      const defaultAngle = (2 * Math.PI * idx) / N;
      const defaultRadius = 85 + N * 5;
      const pos = (attrPositions && attrPositions[key]) || { angle: defaultAngle, radius: defaultRadius };
      const w_attr = Math.max(60, col.name.length * 8 + 16);
      const h_attr = 30;

      return {
        col,
        key,
        width: w_attr,
        height: h_attr,
        angle: pos.angle,
        radius: pos.radius,
        x: cx + pos.radius * Math.cos(pos.angle),
        y: cy + pos.radius * Math.sin(pos.angle)
      };
    });

    // 2. Resolve collisions so they don't overlap
    resolveCollisions(attrs, cx, cy);

    for (const item of attrs) {
      const col = item.col;
      const colId = `col_${table.name}_${col.name}`;
      const edgeColId = `edge_col_${table.name}_${col.name}`;

      const ax = item.x - item.width / 2;
      const ay = item.y - item.height / 2;

      // Primary Key: Italic + Underlined, otherwise Normal
      let label = '';
      if (col.isPrimaryKey) {
        label = escapeXml(`<u><i>${col.name}</i></u>`);
      } else {
        label = escapeXml(col.name);
      }

      // Attribute ellipse style (Gold stroke for PK, slate/zinc for normal)
      const attrStyle = col.isPrimaryKey
        ? 'ellipse;whiteSpace=wrap;html=1;align=center;fontStyle=6;fillColor=#1e293b;strokeColor=#eab308;fontColor=#f8fafc;strokeWidth=1.5;'
        : 'ellipse;whiteSpace=wrap;html=1;align=center;fillColor=#0f172a;strokeColor=#475569;fontColor=#94a3b8;';

      // 1a. Attribute Cell (Ellipse)
      xml += `        <mxCell id="${colId}" parent="1" style="${attrStyle}" value="${label}" vertex="1">\n`;
      xml += `          <mxGeometry x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" width="${item.width}" height="${item.height}" as="geometry" />\n`;
      xml += '        </mxCell>\n';

      // 1b. Connection Edge from Table to Attribute (Simple solid line)
      const edgeColStyle = 'rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;endFill=0;strokeColor=#334155;strokeWidth=1;';
      xml += `        <mxCell id="${edgeColId}" edge="1" parent="1" source="${tableId}" style="${edgeColStyle}" target="${colId}">\n`;
      xml += '          <mxGeometry relative="1" as="geometry" />\n';
      xml += '        </mxCell>\n';
    }
  }

  // ──── Pre-compute diamond positions for ALL edges ────
  const polyLength = (pts: { x: number; y: number }[]) => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  };

  const pointAtT = (pts: { x: number; y: number }[], t: number) => {
    const totalLen = polyLength(pts);
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

  const diamonds = layoutData.edges.map((edge) => {
    return { edge, rel: edge.relationship, t: 0.5, x: 0, y: 0, width: 120, height: 45 };
  });

  diamonds.forEach((d) => {
    const pt = pointAtT(d.edge.points, d.t);
    d.x = pt.x;
    d.y = pt.y;
  });

  // Resolve diamond collisions
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

  // 2. Generate Relationships (Edges connecting Tables & Diamonds)
  for (const d of diamonds) {
    const edge = d.edge;
    const rel = d.rel;
    const edgeId = `edge_rel_${rel.id}`;
    const diamondId = `diamond_${rel.id}`;
    const sourceTableId = `table_${rel.sourceTable}`;
    const targetTableId = `table_${rel.targetTable}`;

    const pts = edge.points;
    const len = pts.length;
    
    // Find segment containing the diamond
    const totalDist = d.t * polyLength(pts);
    let currentDist = 0;
    let diamondSegIdx = 1;
    for (let i = 1; i < len; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (currentDist + segLen >= totalDist) {
        diamondSegIdx = i;
        break;
      }
      currentDist += segLen;
    }

    const edge1Pts = pts.slice(1, diamondSegIdx);
    const edge2Pts = pts.slice(diamondSegIdx, -1);

    if (relNotation === 'label') {
      const edge1Style = [
        'edgeStyle=orthogonalEdgeStyle',
        'rounded=0',
        'orthogonalLoop=1',
        'jettySize=auto',
        'html=1',
        'endArrow=none',
        'startArrow=none',
        'strokeColor=#6366f1',
        'strokeWidth=1.5'
      ].join(';');

      const edge2Style = [
        'edgeStyle=orthogonalEdgeStyle',
        'rounded=0',
        'orthogonalLoop=1',
        'jettySize=auto',
        'html=1',
        'endArrow=none',
        'startArrow=none',
        'strokeColor=#6366f1',
        'strokeWidth=1.5'
      ].join(';');

      const srcLabel = '1';
      const tgtLabel = rel.type === 'M:N' ? 'N' : rel.type === '1:N' ? 'N' : '1';

      // Edge 1: Table A -> Diamond
      xml += `        <mxCell id="${edgeId}_1" edge="1" parent="1" source="${sourceTableId}" style="${edge1Style}" target="${diamondId}">\n`;
      xml += '          <mxGeometry relative="1" as="geometry">\n';
      if (edge1Pts.length > 0) {
        xml += '            <Array as="points">\n';
        for (const pt of edge1Pts) {
          xml += `              <mxPoint x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" />\n`;
        }
        xml += '            </Array>\n';
      }
      xml += '          </mxGeometry>\n';
      xml += '        </mxCell>\n';

      // Edge 2: Diamond -> Table B
      xml += `        <mxCell id="${edgeId}_2" edge="1" parent="1" source="${diamondId}" style="${edge2Style}" target="${targetTableId}">\n`;
      xml += '          <mxGeometry relative="1" as="geometry">\n';
      if (edge2Pts.length > 0) {
        xml += '            <Array as="points">\n';
        for (const pt of edge2Pts) {
          xml += `              <mxPoint x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" />\n`;
        }
        xml += '            </Array>\n';
      }
      xml += '          </mxGeometry>\n';
      xml += '        </mxCell>\n';

      // Source label child cell parented to Edge 1 (x="-1" near Table A)
      xml += `        <mxCell id="${edgeId}_src" value="${escapeXml(srcLabel)}" connectable="0" parent="${edgeId}_1" style="resizable=0;html=1;whiteSpace=wrap;align=left;verticalAlign=bottom;" vertex="1">\n`;
      xml += '          <mxGeometry relative="1" x="-1" as="geometry"/>\n';
      xml += '        </mxCell>\n';

      // Target label child cell parented to Edge 2 (x="1" near Table B)
      xml += `        <mxCell id="${edgeId}_tgt" value="${escapeXml(tgtLabel)}" connectable="0" parent="${edgeId}_2" style="resizable=0;html=1;whiteSpace=wrap;align=right;verticalAlign=bottom;" vertex="1">\n`;
      xml += '          <mxGeometry relative="1" x="1" as="geometry"/>\n';
      xml += '        </mxCell>\n';
    } else {
      // Crow's foot notation
      const edge1Style = [
        'edgeStyle=orthogonalEdgeStyle',
        'rounded=0',
        'orthogonalLoop=1',
        'jettySize=auto',
        'html=1',
        'startArrow=ERone',
        'startFill=0',
        'endArrow=none',
        'strokeColor=#6366f1',
        'strokeWidth=1.5'
      ].join(';');

      const endArrow = rel.type === '1:1' ? 'ERone' : 'ERmany';
      const edge2Style = [
        'edgeStyle=orthogonalEdgeStyle',
        'rounded=0',
        'orthogonalLoop=1',
        'jettySize=auto',
        'html=1',
        'startArrow=none',
        `endArrow=${endArrow}`,
        'endFill=0',
        'strokeColor=#6366f1',
        'strokeWidth=1.5'
      ].join(';');

      // Edge 1: Table A -> Diamond
      xml += `        <mxCell id="${edgeId}_1" edge="1" parent="1" source="${sourceTableId}" style="${edge1Style}" target="${diamondId}">\n`;
      xml += '          <mxGeometry relative="1" as="geometry">\n';
      if (edge1Pts.length > 0) {
        xml += '            <Array as="points">\n';
        for (const pt of edge1Pts) {
          xml += `              <mxPoint x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" />\n`;
        }
        xml += '            </Array>\n';
      }
      xml += '          </mxGeometry>\n';
      xml += '        </mxCell>\n';

      // Edge 2: Diamond -> Table B
      xml += `        <mxCell id="${edgeId}_2" edge="1" parent="1" source="${diamondId}" style="${edge2Style}" target="${targetTableId}">\n`;
      xml += '          <mxGeometry relative="1" as="geometry">\n';
      if (edge2Pts.length > 0) {
        xml += '            <Array as="points">\n';
        for (const pt of edge2Pts) {
          xml += `              <mxPoint x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" />\n`;
        }
        xml += '            </Array>\n';
      }
      xml += '          </mxGeometry>\n';
      xml += '        </mxCell>\n';
    }

    // 3. Generate Diamond Relationship Labels (Placed at edge midpoint)
    const relLabel = rel.verb ? rel.verb : getRelationshipLabel(rel.sourceTable, rel.targetTable);
    const escapedRelLabel = escapeXml(relLabel);

    const diamondWidth = 120;
    const diamondHeight = 60;
    const dx = d.x - diamondWidth / 2;
    const dy = d.y - diamondHeight / 2;

    const diamondStyle = 'shape=rhombus;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;align=center;fillColor=#0f172a;strokeColor=#6366f1;fontColor=#a5b4fc;strokeWidth=1.5;fontSize=10;';

    xml += `        <mxCell id="${diamondId}" parent="1" style="${diamondStyle}" value="${escapedRelLabel}" vertex="1">\n`;
    xml += `          <mxGeometry x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" width="${diamondWidth}" height="${diamondHeight}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  xml += '      </root>\n';
  xml += '    </mxGraphModel>\n';
  xml += '  </diagram>\n';
  xml += '</mxfile>';

  return xml;
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
