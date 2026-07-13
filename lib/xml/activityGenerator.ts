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

import { ActivityFormData } from '@/types';

export function generateActivityFormXml(formData: ActivityFormData): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram id="activity-form" name="Activity Diagram">\n';
  xml += '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  const containerId = 'activity_container';
  const escapedName = escapeXml(formData.name || 'Activity');
  
  // Calculate max level for heights
  const levels: Record<string, number> = {};
  const queue = formData.nodes.filter(n => n.type === 'start');
  if (queue.length === 0 && formData.nodes.length > 0) queue.push(formData.nodes[0]);
  
  queue.forEach(q => { levels[q.id] = 0; });
  let maxLevel = 0;
  let qIdx = 0;
  
  while (qIdx < queue.length) {
    const curr = queue[qIdx++];
    const currentLevel = levels[curr.id];
    maxLevel = Math.max(maxLevel, currentLevel);
    
    const targets: string[] = [];
    if (curr.nextIds) targets.push(...curr.nextIds);
    if (curr.branches) targets.push(...curr.branches.map(b => b.targetId).filter(Boolean));
    
    for (const target of targets) {
      if (levels[target] === undefined) {  // only visit each node once — prevents infinite loop
        levels[target] = currentLevel + 1;
        const targetNode = formData.nodes.find(n => n.id === target);
        if (targetNode) queue.push(targetNode);
      }
    }
  }

  // Handle disconnected nodes
  for (const node of formData.nodes) {
    if (levels[node.id] === undefined) {
      levels[node.id] = maxLevel + 1;
      maxLevel++;
    }
  }

  const SWIMLANE_WIDTH = 320;
  const LEVEL_HEIGHT = 120;
  const totalHeight = Math.max(600, (maxLevel + 1) * LEVEL_HEIGHT + 100);
  const totalWidth = Math.max(SWIMLANE_WIDTH, formData.swimlanes.length * SWIMLANE_WIDTH);

  xml += `        <mxCell id="${containerId}" parent="1" style="swimlane;childLayout=stackLayout;resizeParent=1;resizeParentMax=0;startSize=20;html=1;" value="${escapedName}" vertex="1">\n`;
  xml += `          <mxGeometry x="100" y="100" width="${totalWidth}" height="${totalHeight}" as="geometry" />\n`;
  xml += '        </mxCell>\n';

  // Swimlanes
  for (let i = 0; i < formData.swimlanes.length; i++) {
    const swimlane = formData.swimlanes[i];
    const swId = `sw_${swimlane.id}`;
    const escapedSwName = escapeXml(swimlane.name);
    xml += `        <mxCell id="${swId}" parent="${containerId}" style="swimlane;startSize=20;html=1;" value="${escapedSwName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${i * SWIMLANE_WIDTH}" y="20" width="${SWIMLANE_WIDTH}" height="${totalHeight - 20}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // Nodes
  for (const node of formData.nodes) {
    const nodeId = `node_${node.id}`;
    const escapedLabel = escapeXml(node.label);
    
    let style = '';
    let width = 120;
    let height = 40;

    if (node.type === 'start') {
      style = 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#22c55e;strokeColor=#15803d;strokeWidth=2;';
      width = 40; height = 40;
    } else if (node.type === 'end') {
      style = 'ellipse;html=1;shape=endState;fillColor=#ef4444;strokeColor=#b91c1c;strokeWidth=2;';
      width = 40; height = 40;
    } else if (node.type === 'decision') {
      style = 'rhombus;whiteSpace=wrap;html=1;fillColor=#f59e0b;strokeColor=#b45309;fontColor=#ffffff;strokeWidth=1.5;';
      width = 100; height = 60;
    } else if (node.type === 'fork' || node.type === 'join') {
      style = 'shape=rect;html=1;fillColor=#000000;strokeColor=none;';
      width = 120; height = 8;
    } else {
      style = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#3b82f6;strokeColor=#1d4ed8;fontColor=#ffffff;strokeWidth=1.5;';
    }

    const level = levels[node.id] || 0;
    const parentSw = node.swimlaneId ? `sw_${node.swimlaneId}` : '1';
    
    // Center in swimlane if it has one
    const localX = node.swimlaneId ? (SWIMLANE_WIDTH - width) / 2 : 150;
    const localY = (level * LEVEL_HEIGHT) + 40;

    xml += `        <mxCell id="${nodeId}" parent="${parentSw}" style="${style}" value="${node.type === 'start' || node.type === 'end' || node.type === 'fork' || node.type === 'join' ? '' : escapedLabel}" vertex="1">\n`;
    xml += `          <mxGeometry x="${localX}" y="${localY}" width="${width}" height="${height}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // Edges
  let edgeCounter = 1;
  const edgeStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#64748b;strokeWidth=1.5;fontSize=11;fontColor=#1e293b;';
  
  for (const node of formData.nodes) {
    const sourceId = `node_${node.id}`;
    
    // nextIds
    if (node.nextIds) {
      for (const target of node.nextIds) {
        if (!target) continue;
        const targetId = `node_${target}`;
        const edgeId = `edge_${edgeCounter++}`;
        xml += `        <mxCell id="${edgeId}" edge="1" parent="1" source="${sourceId}" target="${targetId}" style="${edgeStyle}">\n`;
        xml += '          <mxGeometry relative="1" as="geometry" />\n';
        xml += '        </mxCell>\n';
      }
    }
    
    // branches
    if (node.branches) {
      for (const branch of node.branches) {
        if (!branch.targetId) continue;
        const targetId = `node_${branch.targetId}`;
        const edgeId = `edge_${edgeCounter++}`;
        const escapedCond = escapeXml(branch.condition);
        xml += `        <mxCell id="${edgeId}" edge="1" parent="1" source="${sourceId}" target="${targetId}" style="${edgeStyle}" value="${escapedCond}">\n`;
        xml += '          <mxGeometry relative="1" as="geometry" />\n';
        xml += '        </mxCell>\n';
      }
    }
  }

  xml += '      </root>\n';
  xml += '    </mxGraphModel>\n';
  xml += '  </diagram>\n';
  xml += '</mxfile>';

  return xml;
}
