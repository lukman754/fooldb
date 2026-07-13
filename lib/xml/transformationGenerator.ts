import { LayoutData } from '@/types';
import { formatLrsColumn } from './lrsGenerator';

// Helper to escape XML characters
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hueToHex(hue: number, s = 70, l = 50): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
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
  };
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
  if (s === 'qr_scan_logs' && t === 'qr_codes') return 'Tercacat';
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
  if (s === 'users' && t === 'qr_codes') return 'Membuat';
  if (s === 'orders' && t === 'order_items') return 'Memiliki';
  if (s === 'products' && t === 'order_items') return 'Dipesan';
  
  return 'Memiliki';
}

export function generateTransformationXml(layoutData: LayoutData, lrsKeyNotation: 'stars' | 'letters' = 'stars'): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram id="transformation-diagram" name="ERD to LRS Transformation">\n';
  xml += '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  // Pre-calculate node coordinates for easy lookup
  const nodeCoords = new Map<string, { tx: number; ty: number; width: number; height: number }>();
  for (const node of layoutData.nodes) {
    const table = node.table;
    const numCols = table.columns.length;
    const boxHeight = 40 + 10 + numCols * 20 + 10;
    const boxWidth = 140;

    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const tx = cx - boxWidth / 2;
    const ty = cy - boxHeight / 2;

    nodeCoords.set(table.name, { tx, ty, width: boxWidth, height: boxHeight });
  }

  // Pre-calculate diamonds
  const diamonds = layoutData.edges.map((edge) => {
    const rel = edge.relationship;
    const pts = edge.points;
    
    let midX = 0;
    let midY = 0;
    if (pts.length > 0) {
      const midIdx = Math.floor(pts.length / 2);
      if (pts.length % 2 === 0 && pts.length > 1) {
        midX = (pts[midIdx - 1].x + pts[midIdx].x) / 2;
        midY = (pts[midIdx - 1].y + pts[midIdx].y) / 2;
      } else {
        midX = pts[midIdx].x;
        midY = pts[midIdx].y;
      }
    }

    return {
      edgeId: edge.id,
      relationship: rel,
      x: midX,
      y: midY,
      points: pts
    };
  });

  // Identify weak/child tables and map them to their relationship
  const childTables = new Set<string>();
  const relToChildTable = new Map<string, string>();
  for (const d of diamonds) {
    const rel = d.relationship;
    let childTable = rel.targetTable;
    if (rel.sourceCardinality === 'many' && rel.targetCardinality !== 'many') {
      childTable = rel.sourceTable;
    }
    childTables.add(childTable);
    relToChildTable.set(rel.id, childTable);
  }

  // 1. Generate Dashed Boxes FIRST (so they are positioned at the BACK)
  // 1a. Dashed boxes wrapping identifying relationships and weak entities (using weak entity color)
  for (const d of diamonds) {
    const rel = d.relationship;
    const childTable = relToChildTable.get(rel.id)!;
    const coords = nodeCoords.get(childTable);
    const diamondWidth = 120;
    const diamondHeight = 60;
    const dx = d.x - diamondWidth / 2;
    const dy = d.y - diamondHeight / 2;

    if (coords) {
      const minX = Math.min(coords.tx, dx) - 15;
      const minY = Math.min(coords.ty, dy) - 15;
      const maxX = Math.max(coords.tx + coords.width, dx + diamondWidth) + 15;
      const maxY = Math.max(coords.ty + coords.height, dy + diamondHeight) + 15;
      const w = maxX - minX;
      const h = maxY - minY;

      const colors = getTableColors(childTable);
      const dashedBoxId = `dashed_box_rel_${rel.id}`;
      const dashedStyle = `rounded=0;whiteSpace=wrap;html=1;fillColor=none;dashed=1;strokeColor=${colors.stroke};strokeWidth=1.5;`;
      xml += `        <mxCell id="${dashedBoxId}" parent="1" style="${dashedStyle}" value="" vertex="1">\n`;
      xml += `          <mxGeometry x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" as="geometry" />\n`;
      xml += '        </mxCell>\n';
    }
  }

  // 1b. Dashed boxes wrapping regular/strong entities (header + attributes only)
  for (const node of layoutData.nodes) {
    const table = node.table;
    if (!childTables.has(table.name)) {
      const coords = nodeCoords.get(table.name)!;
      const minX = coords.tx - 10;
      const minY = coords.ty - 10;
      const w = coords.width + 20;
      const h = coords.height + 20;

      const colors = getTableColors(table.name);
      const dashedBoxId = `dashed_box_table_${table.name}`;
      const dashedStyle = `rounded=0;whiteSpace=wrap;html=1;fillColor=none;dashed=1;strokeColor=${colors.stroke};strokeWidth=1.5;`;
      xml += `        <mxCell id="${dashedBoxId}" parent="1" style="${dashedStyle}" value="" vertex="1">\n`;
      xml += `          <mxGeometry x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" as="geometry" />\n`;
      xml += '        </mxCell>\n';
    }
  }

  // 2. Generate Entity headers and attributes (on top of dashed boxes, color-coded)
  for (const node of layoutData.nodes) {
    const table = node.table;
    const headerId = `header_${table.name}`;
    const attrsId = `attrs_${table.name}`;

    const coords = nodeCoords.get(table.name)!;
    const colors = getTableColors(table.name);

    // Entity Header
    const escapedTableName = escapeXml(table.name);
    const headerStyle = `rounded=1;arcSize=10;whiteSpace=wrap;html=1;align=center;fillColor=${colors.stroke};strokeColor=${colors.stroke};fontColor=#ffffff;fontStyle=1;`;
    xml += `        <mxCell id="${headerId}" parent="1" style="${headerStyle}" value="${escapedTableName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${coords.tx.toFixed(1)}" y="${coords.ty.toFixed(1)}" width="${coords.width}" height="40" as="geometry" />\n`;
    xml += '        </mxCell>\n';

    // Attributes List Box
    let attrLines = '';
    for (const col of table.columns) {
      const isFk = table.foreignKeys.some(fk => 
        fk.columns.map(c => c.toLowerCase()).includes(col.name.toLowerCase())
      );
      
      const formattedLabel = formatLrsColumn(col.name, col.isPrimaryKey, isFk, lrsKeyNotation);
      if (col.isUnique && !col.isPrimaryKey) {
        // Unique key additional label
        attrLines += `- ${escapeXml(formattedLabel)} (UQ)&lt;br&gt;`;
      } else {
        attrLines += `- ${escapeXml(formattedLabel)}&lt;br&gt;`;
      }
    }

    const attrsStyle = `text;whiteSpace=wrap;html=1;fontColor=${colors.text};`;
    xml += `        <mxCell id="${attrsId}" parent="1" style="${attrsStyle}" value="${attrLines}" vertex="1">\n`;
    xml += `          <mxGeometry x="${coords.tx.toFixed(1)}" y="${(coords.ty + 45).toFixed(1)}" width="${coords.width}" height="${coords.height - 45}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 3. Generate Relationship Diamonds
  for (const d of diamonds) {
    const rel = d.relationship;
    const diamondId = `diamond_${rel.id}`;
    const relLabel = rel.verb ? rel.verb : getRelationshipLabel(rel.sourceTable, rel.targetTable);
    const escapedRelLabel = escapeXml(relLabel.replace(/<div>/g, '').replace(/<\/div>/g, ''));

    const diamondWidth = 120;
    const diamondHeight = 60;
    const dx = d.x - diamondWidth / 2;
    const dy = d.y - diamondHeight / 2;

    const childTable = relToChildTable.get(rel.id)!;
    const colors = getTableColors(childTable);

    const diamondStyle = `shape=rhombus;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;align=center;fillColor=${colors.fill};strokeColor=${colors.stroke};fontColor=${colors.text};strokeWidth=1.5;fontSize=10;`;
    xml += `        <mxCell id="${diamondId}" parent="1" style="${diamondStyle}" value="${escapedRelLabel}" vertex="1">\n`;
    xml += `          <mxGeometry x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" width="${diamondWidth}" height="${diamondHeight}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 4. Generate Edges (Split at diamond, color-coded to match the weak entity)
  for (const edge of layoutData.edges) {
    const rel = edge.relationship;
    const edgeId = `edge_rel_${rel.id}`;
    const diamondId = `diamond_${rel.id}`;

    const sourceHeaderId = `header_${rel.sourceTable}`;
    const targetHeaderId = `header_${rel.targetTable}`;

    const sourceCardinality = rel.sourceCardinality ?? 'one';
    const targetCardinality = rel.targetCardinality ?? (rel.type === '1:1' ? 'one' : 'many');

    const startArrow = sourceCardinality === 'many' ? 'ERmany' : 'ERone';
    const endArrow = targetCardinality === 'many' ? 'ERmany' : 'ERone';

    const pts = edge.points;
    const midIdx = Math.floor(pts.length / 2);
    
    const edge1Pts = pts.slice(0, midIdx + 1);
    const edge2Pts = pts.slice(midIdx);

    const childTable = relToChildTable.get(rel.id)!;
    const colors = getTableColors(childTable);

    // Edge 1: Source Table -> Diamond
    const edge1Style = [
      'edgeStyle=orthogonalEdgeStyle',
      'rounded=0',
      'orthogonalLoop=1',
      'jettySize=auto',
      'html=1',
      `startArrow=${startArrow}`,
      'startFill=0',
      'endArrow=none',
      `strokeColor=${colors.stroke}`,
      'strokeWidth=1.5'
    ].join(';');

    xml += `        <mxCell id="${edgeId}_1" edge="1" parent="1" source="${sourceHeaderId}" style="${edge1Style}" target="${diamondId}">\n`;
    xml += '          <mxGeometry relative="1" as="geometry">\n';
    if (edge1Pts.length > 2) {
      xml += '            <Array as="points">\n';
      for (const pt of edge1Pts.slice(1, -1)) {
        xml += `              <mxPoint x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" />\n`;
      }
      xml += '            </Array>\n';
    }
    xml += '          </mxGeometry>\n';
    xml += '        </mxCell>\n';

    // Edge 2: Diamond -> Target Table
    const edge2Style = [
      'edgeStyle=orthogonalEdgeStyle',
      'rounded=0',
      'orthogonalLoop=1',
      'jettySize=auto',
      'html=1',
      'startArrow=none',
      `endArrow=${endArrow}`,
      'endFill=0',
      `strokeColor=${colors.stroke}`,
      'strokeWidth=1.5'
    ].join(';');

    xml += `        <mxCell id="${edgeId}_2" edge="1" parent="1" source="${diamondId}" style="${edge2Style}" target="${targetHeaderId}">\n`;
    xml += '          <mxGeometry relative="1" as="geometry">\n';
    if (edge2Pts.length > 2) {
      xml += '            <Array as="points">\n';
      for (const pt of edge2Pts.slice(1, -1)) {
        xml += `              <mxPoint x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" />\n`;
      }
      xml += '            </Array>\n';
    }
    xml += '          </mxGeometry>\n';
    xml += '        </mxCell>\n';
  }

  xml += '      </root>\n';
  xml += '    </mxGraphModel>\n';
  xml += '  </diagram>\n';
  xml += '</mxfile>';

  return xml;
}
