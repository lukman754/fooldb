import { LayoutData } from '@/types';

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

export function generateDrawioXml(layoutData: LayoutData): string {
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
    
    // Dynamically size radius to prevent overlapping attributes
    const R = 85 + N * 5;

    for (let i = 0; i < N; i++) {
      const col = table.columns[i];
      const colId = `col_${table.name}_${col.name}`;
      const edgeColId = `edge_col_${table.name}_${col.name}`;
      
      const angle = (2 * Math.PI * i) / N;
      
      // Calculate width of ellipse based on column name length
      const w_attr = Math.max(60, col.name.length * 8 + 16);
      const h_attr = 30;
      
      const ax = cx + R * Math.cos(angle) - w_attr / 2;
      const ay = cy + R * Math.sin(angle) - h_attr / 2;

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
      xml += `          <mxGeometry x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" width="${w_attr}" height="${h_attr}" as="geometry" />\n`;
      xml += '        </mxCell>\n';

      // 1b. Connection Edge from Table to Attribute (Simple solid line)
      const edgeColStyle = 'rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;endFill=0;strokeColor=#334155;strokeWidth=1;';
      xml += `        <mxCell id="${edgeColId}" edge="1" parent="1" source="${tableId}" style="${edgeColStyle}" target="${colId}">\n`;
      xml += '          <mxGeometry relative="1" as="geometry" />\n';
      xml += '        </mxCell>\n';
    }
  }

  // 2. Generate Relationships (Edges connecting Tables & Diamonds placed at midpoints)
  for (const edge of layoutData.edges) {
    const rel = edge.relationship;
    const edgeId = `edge_rel_${rel.id}`;
    const diamondId = `diamond_${rel.id}`;

    const sourceTableId = `table_${rel.sourceTable}`;
    const targetTableId = `table_${rel.targetTable}`;

    // Crow foot arrowheads
    // Start Arrow: 1 side (ERone)
    const startArrow = 'ERone';
    // End Arrow: Many (ERmany) unless it's a 1:1 relationship
    const endArrow = rel.type === '1:1' ? 'ERone' : 'ERmany';

    // Relationship Edge Style
    const edgeStyle = [
      'edgeStyle=orthogonalEdgeStyle',
      'rounded=0',
      'orthogonalLoop=1',
      'jettySize=auto',
      'html=1',
      `startArrow=${startArrow}`,
      'startFill=0',
      `endArrow=${endArrow}`,
      'endFill=0',
      'strokeColor=#6366f1', // Beautiful Indigo connector
      'strokeWidth=1.5'
    ].join(';');

    xml += `        <mxCell id="${edgeId}" edge="1" parent="1" source="${sourceTableId}" style="${edgeStyle}" target="${targetTableId}">\n`;
    xml += '          <mxGeometry relative="1" as="geometry">\n';
    
    // Add computed bend points from layout
    if (edge.points.length > 0) {
      xml += '            <Array as="points">\n';
      for (const pt of edge.points.slice(1, -1)) {
        xml += `              <mxPoint x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" />\n`;
      }
      xml += '            </Array>\n';
    }
    
    xml += '          </mxGeometry>\n';
    xml += '        </mxCell>\n';

    // 3. Generate Diamond Relationship Labels (Placed at edge midpoint)
    let midX = 0;
    let midY = 0;

    if (edge.points.length >= 2) {
      const len = edge.points.length;
      if (len % 2 === 0) {
        const idx1 = len / 2 - 1;
        const idx2 = len / 2;
        midX = (edge.points[idx1].x + edge.points[idx2].x) / 2;
        midY = (edge.points[idx1].y + edge.points[idx2].y) / 2;
      } else {
        const idx = Math.floor(len / 2);
        midX = edge.points[idx].x;
        midY = edge.points[idx].y;
      }
    } else {
      // Fallback midpoint between nodes
      const sourceNode = layoutData.nodes.find(n => n.id === rel.sourceTable);
      const targetNode = layoutData.nodes.find(n => n.id === rel.targetTable);
      if (sourceNode && targetNode) {
        midX = (sourceNode.x + targetNode.x) / 2;
        midY = (sourceNode.y + targetNode.y) / 2;
      }
    }

    const relLabel = rel.verb ? rel.verb : getRelationshipLabel(rel.sourceTable, rel.targetTable);
    const escapedRelLabel = escapeXml(relLabel);

    const diamondWidth = 120;
    const diamondHeight = 60;
    const dx = midX - diamondWidth / 2;
    const dy = midY - diamondHeight / 2;

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
