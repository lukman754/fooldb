import { UseCaseDiagram } from '@/types';

// Helper to escape XML characters
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateUseCaseXml(diagram: UseCaseDiagram): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram id="usecase-diagram" name="Use Case Diagram">\n';
  xml += '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  // Coordinate Calculations
  const actorX = 80;
  const systemX = 260;
  const systemY = 60;
  const systemWidth = 340;
  
  // Calculate heights
  const usecasesCount = diagram.usecases.length;
  const systemHeight = Math.max(320, usecasesCount * 90 + 80);

  // 1. Draw Systems (System boundaries)
  if (diagram.systems.length > 0) {
    for (let i = 0; i < diagram.systems.length; i++) {
      const sys = diagram.systems[i];
      const sysId = `sys_${i}`;
      const escapedSysName = escapeXml(sys.name);
      const sysStyle = 'shape=rect;html=1;whiteSpace=wrap;align=center;verticalAlign=top;fillColor=none;strokeColor=#475569;strokeWidth=2;dashed=1;fontColor=#94a3b8;fontStyle=1;fontSize=12;';
      
      const sy = systemY + i * (systemHeight + 50);

      xml += `        <mxCell id="${sysId}" parent="1" style="${sysStyle}" value="${escapedSysName}" vertex="1">\n`;
      xml += `          <mxGeometry x="${systemX}" y="${sy}" width="${systemWidth}" height="${systemHeight}" as="geometry" />\n`;
      xml += '        </mxCell>\n';
    }
  } else {
    // Default system boundary if none declared
    const sysStyle = 'shape=rect;html=1;whiteSpace=wrap;align=center;verticalAlign=top;fillColor=none;strokeColor=#475569;strokeWidth=2;dashed=1;fontColor=#94a3b8;fontStyle=1;';
    xml += `        <mxCell id="sys_default" parent="1" style="${sysStyle}" value="System Boundary" vertex="1">\n`;
    xml += `          <mxGeometry x="${systemX}" y="${systemY}" width="${systemWidth}" height="${systemHeight}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 2. Draw Actors (Stick figures on the left)
  const totalActors = diagram.actors.length;
  const actorSpacing = Math.max(120, systemHeight / (totalActors || 1));
  
  for (let i = 0; i < totalActors; i++) {
    const act = diagram.actors[i];
    const actId = `act_${act.id}`;
    const escapedActName = escapeXml(act.name);
    const actorStyle = 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fillColor=#1e293b;strokeColor=#6366f1;fontColor=#f8fafc;strokeWidth=2;';
    
    const ay = systemY + 40 + i * actorSpacing;

    xml += `        <mxCell id="${actId}" parent="1" style="${actorStyle}" value="${escapedActName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${actorX}" y="${ay}" width="30" height="60" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 3. Draw Use Cases (Ellipses inside the system boundary)
  for (let i = 0; i < usecasesCount; i++) {
    const uc = diagram.usecases[i];
    const ucId = `uc_${uc.id}`;
    const escapedUcName = escapeXml(uc.name);
    const ucStyle = 'ellipse;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#475569;fontColor=#e2e8f0;strokeWidth=1.5;fontSize=11;';

    // Find which system this usecase belongs to, or place in default system
    let sy = systemY;
    let sysIdx = 0;
    
    for (let sIdx = 0; sIdx < diagram.systems.length; sIdx++) {
      if (diagram.systems[sIdx].usecaseIds.includes(uc.id)) {
        sysIdx = sIdx;
        sy = systemY + sysIdx * (systemHeight + 50);
        break;
      }
    }

    // Distribute usecases inside its system
    const localIdx = diagram.systems.length > 0 
      ? diagram.systems[sysIdx].usecaseIds.indexOf(uc.id)
      : i;
    
    const ux = systemX + (systemWidth - 160) / 2;
    const uy = sy + 50 + (localIdx >= 0 ? localIdx : 0) * 85;

    xml += `        <mxCell id="${ucId}" parent="1" style="${ucStyle}" value="${escapedUcName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${ux}" y="${uy}" width="160" height="60" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 4. Draw Connections (Lines Actor -> Use Case, or Use Case -> Use Case)
  for (const conn of diagram.connections) {
    const connId = conn.id;
    
    // Check if source/target are actors or usecases
    const sourceId = diagram.actors.some(a => a.id === conn.from) ? `act_${conn.from}` : `uc_${conn.from}`;
    const targetId = diagram.usecases.some(u => u.id === conn.to) ? `uc_${conn.to}` : `act_${conn.to}`;

    const hasLabel = conn.label != null;
    const arrow = hasLabel ? 'endArrow=open;' : 'endArrow=none;';
    const dashed = hasLabel ? 'dashed=1;' : '';
    const connStyle = `endArrow=none;html=1;rounded=1;strokeColor=#64748b;strokeWidth=1.5;edgeStyle=orthogonalEdgeStyle;${arrow}${dashed}`;
    const labelAttr = hasLabel ? ` value="${escapeXml(conn.label || '')}"` : '';

    xml += `        <mxCell id="${connId}" edge="1" parent="1" source="${sourceId}" style="${connStyle}" target="${targetId}"${labelAttr}>\n`;
    xml += '          <mxGeometry relative="1" as="geometry" />\n';
    xml += '        </mxCell>\n';
  }

  xml += '      </root>\n';
  xml += '    </mxGraphModel>\n';
  xml += '  </diagram>\n';
  xml += '</mxfile>';

  return xml;
}
