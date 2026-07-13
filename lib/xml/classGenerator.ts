import { LayoutData } from '@/types';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateClassXml(
  layoutData: LayoutData,
  classMethods: { [tableName: string]: string[] },
  relNotation: 'crowsfoot' | 'label' = 'crowsfoot'
): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram id="class-diagram" name="Class Diagram">\n';
  xml += '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  // 1. Generate Class Boxes
  for (const node of layoutData.nodes) {
    const table = node.table;
    const classId = `class_${table.name}`;
    const escapedClassName = escapeXml(table.name);

    const methods = classMethods[table.name] || [
      `+ insert(input: Data): void`,
      `+ delete(id: int): boolean`,
      `+ findById(id: int): Object`
    ];

    const headerHeight = 40;
    const attrsHeight = table.columns.length * 20 + 12;
    const methodsHeight = Math.max(1, methods.length) * 20 + 12;
    const height = headerHeight + attrsHeight + methodsHeight;
    const width = 240;

    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const tx = cx - 120;
    const ty = cy - height / 2;

    const classStyle = [
      'swimlane',
      'fontStyle=1',
      'align=center',
      'verticalAlign=top',
      'childLayout=stackLayout',
      'horizontal=1',
      `startSize=${headerHeight}`,
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

    xml += `        <mxCell id="${classId}" parent="1" style="${classStyle}" value="${escapedClassName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${width}" height="${height}" as="geometry" />\n`;
    xml += '        </mxCell>\n';

    // 2. Generate Attributes Compartment
    const attrsId = `attrs_comp_${table.name}`;
    let attrsText = '';
    for (const col of table.columns) {
      const vis = col.isPrimaryKey ? '+' : '-';
      const escapedColName = escapeXml(col.name);
      const escapedColType = escapeXml(col.type.toLowerCase());
      attrsText += `${vis} ${escapedColName}: ${escapedColType}&lt;br&gt;`;
    }

    const attrsCompStyle = [
      'shape=partialRectangle',
      'top=0',
      'left=0',
      'bottom=1', // divider line
      'right=0',
      'strokeColor=#334155',
      'fillColor=none',
      'align=left',
      'verticalAlign=top',
      'spacingTop=6',
      'spacingLeft=8',
      'spacingRight=8',
      'overflow=hidden',
      'rotatable=0',
      'points=[]',
      'portConstraint=eastwest',
      'whiteSpace=wrap',
      'html=1',
      'fontColor=#ffffff' // Pure white text
    ].join(';');

    xml += `        <mxCell id="${attrsId}" parent="${classId}" style="${attrsCompStyle}" value="${attrsText}" vertex="1">\n`;
    xml += `          <mxGeometry y="${headerHeight}" width="${width}" height="${attrsHeight}" as="geometry" />\n`;
    xml += '        </mxCell>\n';

    // 3. Generate Methods Compartment
    const methodsId = `methods_comp_${table.name}`;
    let methodsText = '';
    for (const method of methods) {
      methodsText += `${escapeXml(method)}&lt;br&gt;`;
    }

    const methodsCompStyle = [
      'shape=partialRectangle',
      'top=0',
      'left=0',
      'bottom=0',
      'right=0',
      'strokeColor=none',
      'fillColor=none',
      'align=left',
      'verticalAlign=top',
      'spacingTop=6',
      'spacingLeft=8',
      'spacingRight=8',
      'overflow=hidden',
      'rotatable=0',
      'points=[]',
      'portConstraint=eastwest',
      'whiteSpace=wrap',
      'html=1',
      'fontColor=#ffffff' // Pure white text
    ].join(';');

    xml += `        <mxCell id="${methodsId}" parent="${classId}" style="${methodsCompStyle}" value="${methodsText}" vertex="1">\n`;
    xml += `          <mxGeometry y="${headerHeight + attrsHeight}" width="${width}" height="${methodsHeight}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 4. Generate Edges
  for (const edge of layoutData.edges) {
    const rel = edge.relationship;
    const edgeId = `edge_rel_${rel.id}`;

    const sourceTableId = `class_${rel.sourceTable}`;
    const targetTableId = `class_${rel.targetTable}`;

    const startArrow = relNotation === 'crowsfoot' ? 'ERmandOne' : 'none';
    const endArrow = relNotation === 'crowsfoot'
      ? (rel.type === '1:1' ? 'ERmandOne' : 'ERmany')
      : 'none';

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

    if (relNotation === 'label') {
      const srcLabelId = `label_src_${rel.id}`;
      const tgtLabelId = `label_tgt_${rel.id}`;
      const tgtVal = rel.type === '1:1' ? '1' : '*';

      xml += `        <mxCell id="${srcLabelId}" value="1" vertex="1" connectable="0" parent="${edgeId}" style="edgeLabel;resizable=0;align=center;verticalAlign=middle;labelBackgroundColor=none;fontSize=10;fontColor=#ffffff;fontFamily=monospace;">\n`;
      xml += `          <mxGeometry relative="1" x="-0.8" as="geometry">\n`;
      xml += `            <mxPoint x="10" y="-10" as="offset" />\n`;
      xml += `          </mxGeometry>\n`;
      xml += `        </mxCell>\n`;

      xml += `        <mxCell id="${tgtLabelId}" value="${tgtVal}" vertex="1" connectable="0" parent="${edgeId}" style="edgeLabel;resizable=0;align=center;verticalAlign=middle;labelBackgroundColor=none;fontSize=10;fontColor=#ffffff;fontFamily=monospace;">\n`;
      xml += `          <mxGeometry relative="1" x="0.8" as="geometry">\n`;
      xml += `            <mxPoint x="-10" y="-10" as="offset" />\n`;
      xml += `          </mxGeometry>\n`;
      xml += `        </mxCell>\n`;
    }
  }

  xml += '      </root>\n';
  xml += '    </mxGraphModel>\n';
  xml += '  </diagram>\n';
  xml += '</mxfile>';

  return xml;
}
