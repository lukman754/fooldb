import { SequenceDiagram } from '@/types';

// Helper to escape XML characters
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSequenceXml(diagram: SequenceDiagram): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<mxfile host="app.diagrams.net">\n';
  xml += '  <diagram id="sequence-diagram" name="Sequence Diagram">\n';
  xml += '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n';
  xml += '      <root>\n';
  xml += '        <mxCell id="0" />\n';
  xml += '        <mxCell id="1" parent="0" />\n';

  const totalParticipants = diagram.participants.length;
  const totalMessages = diagram.messages.length;

  const startX = 100;
  const spacingX = 220;
  const startY = 60;
  
  // Dynamic height of lifelines based on number of messages
  const lifelineHeight = Math.max(300, totalMessages * 60 + 100);

  // 1. Draw Lifelines (Participants)
  for (let i = 0; i < totalParticipants; i++) {
    const part = diagram.participants[i];
    const partId = `part_${part.id}`;
    const escapedPartName = escapeXml(part.name);
    
    // Draw.io umlLifeline style
    const lifelineStyle = [
      'shape=umlLifeline',
      'perimeter=lifelinePerimeter',
      'whiteSpace=wrap',
      'html=1',
      'container=1',
      'collapsible=0',
      'recursiveResize=0',
      'outlineConnect=0',
      'fillColor=#1e293b',
      'strokeColor=#475569',
      'fontColor=#f8fafc',
      'strokeWidth=1.5',
      'align=center'
    ].join(';');

    const px = startX + i * spacingX;

    xml += `        <mxCell id="${partId}" parent="1" style="${lifelineStyle}" value="${escapedPartName}" vertex="1">\n`;
    xml += `          <mxGeometry x="${px}" y="${startY}" width="100" height="${lifelineHeight}" as="geometry" />\n`;
    xml += '        </mxCell>\n';
  }

  // 2. Draw Messages (Horizontal arrows connecting lifelines)
  for (let j = 0; j < totalMessages; j++) {
    const msg = diagram.messages[j];
    const msgId = `msg_${msg.id}`;
    
    const fromIdx = diagram.participants.findIndex(p => p.id === msg.from);
    const toIdx = diagram.participants.findIndex(p => p.id === msg.to);

    if (fromIdx !== -1 && toIdx !== -1) {
      const fromPartId = `part_${msg.from}`;
      const toPartId = `part_${msg.to}`;

      // X coordinate centers of lifelines
      const fromCenterX = startX + fromIdx * spacingX + 50;
      const toCenterX = startX + toIdx * spacingX + 50;
      
      const messageY = startY + 80 + j * 60;

      const escapedLabel = escapeXml(msg.label);

      // Arrow pointing to the right or left depending on positions
      const messageStyle = [
        'html=1',
        'verticalAlign=bottom',
        'endArrow=block',
        'strokeColor=#6366f1',
        'strokeWidth=1.5',
        'fontColor=#cbd5e1',
        'fontSize=10',
        'edgeStyle=none'
      ].join(';');

      xml += `        <mxCell id="${msgId}" edge="1" parent="1" source="${fromPartId}" style="${messageStyle}" target="${toPartId}" value="${escapedLabel}">\n`;
      xml += '          <mxGeometry relative="1" as="geometry">\n';
      xml += `            <mxPoint as="sourcePoint" x="${fromCenterX}" y="${messageY}" />\n`;
      xml += `            <mxPoint as="targetPoint" x="${toCenterX}" y="${messageY}" />\n`;
      xml += '          </mxGeometry>\n';
      xml += '        </mxCell>\n';
    }
  }

  xml += '      </root>\n';
  xml += '    </mxGraphModel>\n';
  xml += '  </diagram>\n';
  xml += '</mxfile>';

  return xml;
}
