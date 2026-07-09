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

const COLUMN_HEIGHT = 26;
const HEADER_HEIGHT = 42;

export function generateLrsXml(layoutData: LayoutData): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram id="lrs-diagram" name="LRS Schema">\n';
  xml += '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  // 1. Generate Table Containers (Swimlanes)
  for (const node of layoutData.nodes) {
    const table = node.table;
    const tableId = `table_${table.name}`;
    const escapedTableName = escapeXml(table.name);

    // Dynamic height based on column rows
    const height = HEADER_HEIGHT + table.columns.length * COLUMN_HEIGHT + 8;

    const tableStyle = [
      'swimlane',
      'fontStyle=1',
      'align=center',
      'verticalAlign=top',
      'childLayout=stackLayout',
      'horizontal=1',
      `startSize=${HEADER_HEIGHT}`,
      'horizontalStack=0',
      'resizeParent=1',
      'resizeParentMax=0',
      'resizeLast=0',
      'collapsible=0',
      'marginBottom=0',
      'html=1',
      'whiteSpace=wrap',
      'fillColor=#1e293b',
      'strokeColor=#475569',
      'fontColor=#f8fafc',
      'separatorColor=#334155'
    ].join(';');

    // Place LRS tables at node.x, node.y (we use node.width = 240 in LRS preview)
    // Centered in the bounding box
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const tx = cx - 120; // width 240
    const ty = cy - height / 2;

    xml += `        <mxCell id="${tableId}" parent="1" style="${tableStyle}" value="${escapedTableName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="240" height="${height}" as="geometry" />\n`;
    xml += '        </mxCell>\n';

    // 2. Generate Column Rows
    let currentY = HEADER_HEIGHT;
    for (const col of table.columns) {
      const colId = `col_${table.name}_${col.name}`;
      const isFk = table.foreignKeys.some(fk => 
        fk.columns.map(c => c.toLowerCase()).includes(col.name.toLowerCase())
      );

      const escapedColName = escapeXml(col.name);
      const escapedColType = escapeXml(col.type);
      
      let label = '';
      if (col.isPrimaryKey) {
        label = `<i>${escapedColName}</i>`;
      } else {
        label = escapedColName;
      }
      label += ` : ${escapedColType}`;

      const indicators: string[] = [];
      if (col.isPrimaryKey) indicators.push('PK');
      if (isFk) indicators.push('FK');
      if (col.isUnique && !col.isPrimaryKey) indicators.push('UQ');

      if (indicators.length > 0) {
        label += ` (${indicators.join(', ')})`;
      }

      const escapedLabel = escapeXml(label);

      const colStyle = [
        'shape=partialRectangle',
        'top=0',
        'left=0',
        'bottom=0',
        'right=0',
        'strokeColor=none',
        'fillColor=none',
        'align=left',
        'verticalAlign=middle',
        'spacingLeft=8',
        'spacingRight=8',
        'overflow=hidden',
        'rotatable=0',
        'points=[]',
        'portConstraint=eastwest',
        'whiteSpace=wrap',
        'html=1',
        'fontColor=#94a3b8',
        col.isPrimaryKey ? 'fontStyle=2' : 'fontStyle=0'
      ].join(';');

      xml += `        <mxCell id="${colId}" parent="${tableId}" style="${colStyle}" value="${escapedLabel}" vertex="1">\n`;
      xml += `          <mxGeometry y="${currentY}" width="240" height="${COLUMN_HEIGHT}" as="geometry" />\n`;
      xml += '        </mxCell>\n';

      currentY += COLUMN_HEIGHT;
    }
  }

  // 3. Generate Edges (Direct Crow's Foot Connectors)
  for (const edge of layoutData.edges) {
    const rel = edge.relationship;
    const edgeId = `edge_rel_${rel.id}`;

    const sourceTableId = `table_${rel.sourceTable}`;
    const targetTableId = `table_${rel.targetTable}`;

    const startArrow = 'ERmandOne';
    const endArrow = rel.type === '1:1' ? 'ERmandOne' : 'ERmany';

    const edgeStyle = [
      'edgeStyle=orthogonalEdgeStyle',
      'rounded=1',
      'orthogonalLoop=1',
      'jettySize=auto',
      'html=1',
      `startArrow=${startArrow}`,
      'startFill=0',
      `endArrow=${endArrow}`,
      'endFill=0',
      'strokeColor=#6366f1',
      'strokeWidth=1.5'
    ].join(';');

    xml += `        <mxCell id="${edgeId}" edge="1" parent="1" source="${sourceTableId}" style="${edgeStyle}" target="${targetTableId}">\n`;
    xml += '          <mxGeometry relative="1" as="geometry">\n';
    
    if (edge.points.length > 0) {
      xml += '            <Array as="points">\n';
      for (const pt of edge.points.slice(1, -1)) {
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
