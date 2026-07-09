import { ActivityLayoutData } from '@/types';

// Helper to escape XML characters
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateActivityXml(layoutData: ActivityLayoutData): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram id="activity-diagram" name="Activity Diagram">\n';
  xml += '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  // 1. Generate Nodes
  for (const node of layoutData.nodes) {
    const nodeId = `act_node_${node.id}`;
    const escapedLabel = escapeXml(node.label);
    
    let style = '';
    if (node.type === 'start') {
      style = 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#22c55e;strokeColor=#15803d;strokeWidth=2;';
    } else if (node.type === 'end') {
      style = 'ellipse;html=1;shape=endState;fillColor=#ef4444;strokeColor=#b91c1c;strokeWidth=2;';
    } else if (node.type === 'decision') {
      style = 'rhombus;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#6366f1;fontColor=#f8fafc;strokeWidth=1.5;fontSize=10;';
    } else {
      style = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#475569;fontColor=#f8fafc;strokeWidth=1.5;fontSize=11;';
    }

    xml += `        <mxCell id="${nodeId}" parent="1" style="${style}" value="${node.type === 'start' || node.type === 'end' ? '' : escapedLabel}" vertex="1">\n`;
    xml += `          <mxGeometry x="${node.x.toFixed(1)}" y="${node.y.toFixed(1)}" width="${node.width}" height="${node.height}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 2. Generate Edges
  for (const edge of layoutData.edges) {
    const edgeId = `edge_${edge.id}`;
    const sourceId = `act_node_${edge.source}`;
    const targetId = `act_node_${edge.target}`;
    
    const edgeStyle = [
      'edgeStyle=orthogonalEdgeStyle',
      'rounded=1',
      'orthogonalLoop=1',
      'jettySize=auto',
      'html=1',
      'endArrow=block',
      'endFill=1',
      'strokeColor=#6366f1',
      'strokeWidth=1.5',
      'fontSize=10'
    ].join(';');

    const escapedLabel = edge.label ? escapeXml(edge.label) : '';

    xml += `        <mxCell id="${edgeId}" edge="1" parent="1" source="${sourceId}" style="${edgeStyle}" target="${targetId}" value="${escapedLabel}">\n`;
    xml += '          <mxGeometry relative="1" as="geometry">\n';
    
    if (edge.points && edge.points.length > 0) {
      xml += '            <Array as="points">\n';
      // Skip start and end points of the ELK edge to let Draw.io snap
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
