import { 
  UseCaseDiagram, 
  UseCaseActor, 
  UseCaseNode, 
  UseCaseSystem, 
  UseCaseConnection,
  ActivityDiagram,
  ActivityNode,
  ActivityEdge,
  SequenceDiagram,
  SequenceParticipant,
  SequenceMessage
} from '@/types';

// Helper to strip quotes from a string
function cleanQuotes(str: string): string {
  const trimmed = str.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.substring(1, trimmed.length - 1);
  }
  return trimmed;
}

// 1. USE CASE DIAGRAM PARSER
export function parseUseCase(code: string): UseCaseDiagram {
  const lines = code.split('\n');
  
  const actors: UseCaseActor[] = [];
  const usecases: UseCaseNode[] = [];
  const systems: UseCaseSystem[] = [];
  const connections: UseCaseConnection[] = [];
  
  let currentSystem: UseCaseSystem | null = null;
  let connIdCounter = 1;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('--')) continue;

    // actor ActorName
    if (/^actor\s+/i.test(line)) {
      const match = line.match(/^actor\s+(.+)$/i);
      if (match) {
        let namePart = match[1].trim();
        let side: 'left' | 'right' = 'left';
        if (/\s+right$/i.test(namePart)) {
          side = 'right';
          namePart = namePart.replace(/\s+right$/i, '').trim();
        } else if (/\s+left$/i.test(namePart)) {
          side = 'left';
          namePart = namePart.replace(/\s+left$/i, '').trim();
        }
        const name = cleanQuotes(namePart);
        const id = name.toLowerCase().replace(/\s+/g, '_');
        if (!actors.some(a => a.id === id)) {
          actors.push({ id, name, side });
        }
      }
      continue;
    }

    // usecase UseCaseName
    if (/^usecase\s+/i.test(line)) {
      const match = line.match(/^usecase\s+(.+)$/i);
      if (match) {
        const name = cleanQuotes(match[1]);
        const id = name.toLowerCase().replace(/\s+/g, '_');
        if (!usecases.some(u => u.id === id)) {
          usecases.push({ id, name });
          if (currentSystem) {
            currentSystem.usecaseIds.push(id);
          }
        }
      }
      continue;
    }

    // system SystemName
    if (/^system\s+/i.test(line)) {
      const match = line.match(/^system\s+(.+)$/i);
      if (match) {
        const name = cleanQuotes(match[1]);
        currentSystem = { name, usecaseIds: [] };
        systems.push(currentSystem);
      }
      continue;
    }

    // Connection: Source -> Target
    if (line.includes('->')) {
      const parts = line.split('->');
      if (parts.length === 2) {
        let targetStr = parts[1].trim();
        let label = undefined;
        const matchLabel = targetStr.match(/<<(.*?)>>/);
        if (matchLabel) {
          label = matchLabel[1];
          targetStr = targetStr.replace(/<<.*?>>/, '').trim();
        }
        const fromName = cleanQuotes(parts[0]);
        const toName = cleanQuotes(targetStr);
        
        const fromId = fromName.toLowerCase().replace(/\s+/g, '_');
        const toId = toName.toLowerCase().replace(/\s+/g, '_');

        connections.push({
          id: `uc_conn_${connIdCounter++}`,
          from: fromId,
          to: toId,
          label
        });
      }
    }
  }

  return { actors, usecases, systems, connections };
}

// 2. ACTIVITY DIAGRAM PARSER
export function parseActivity(code: string): ActivityDiagram {
  const lines = code.split('\n');
  
  const nodes: ActivityNode[] = [];
  const edges: ActivityEdge[] = [];
  let edgeIdCounter = 1;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('--')) continue;

    // start node
    if (/^start$/i.test(line)) {
      if (!nodes.some(n => n.id === 'start')) {
        nodes.push({ id: 'start', label: 'Start', type: 'start' });
      }
      continue;
    }

    // end node
    if (/^end$/i.test(line)) {
      if (!nodes.some(n => n.id === 'end')) {
        nodes.push({ id: 'end', label: 'End', type: 'end' });
      }
      continue;
    }

    // action id "label"
    if (/^action\s+/i.test(line)) {
      const match = line.match(/^action\s+(\w+)\s+(.+)$/i);
      if (match) {
        const id = match[1];
        const label = cleanQuotes(match[2]);
        if (!nodes.some(n => n.id === id)) {
          nodes.push({ id, label, type: 'action' });
        }
      }
      continue;
    }

    // decision id "label"
    if (/^decision\s+/i.test(line)) {
      const match = line.match(/^decision\s+(\w+)\s+(.+)$/i);
      if (match) {
        const id = match[1];
        const label = cleanQuotes(match[2]);
        if (!nodes.some(n => n.id === id)) {
          nodes.push({ id, label, type: 'decision' });
        }
      }
      continue;
    }

    // flow connection: id1 -> id2 [: Label]
    if (line.includes('->')) {
      const parts = line.split('->');
      if (parts.length === 2) {
        const source = parts[0].trim();
        const targetPart = parts[1].trim();
        
        let target = targetPart;
        let edgeLabel: string | undefined;

        if (targetPart.includes(':')) {
          const colonIdx = targetPart.indexOf(':');
          target = targetPart.substring(0, colonIdx).trim();
          edgeLabel = cleanQuotes(targetPart.substring(colonIdx + 1));
        }

        edges.push({
          id: `act_edge_${edgeIdCounter++}`,
          source,
          target,
          label: edgeLabel
        });

        // Implicitly register nodes if not declared beforehand
        if (!nodes.some(n => n.id === source)) {
          nodes.push({ id: source, label: source, type: 'action' });
        }
        if (!nodes.some(n => n.id === target)) {
          nodes.push({ id: target, label: target, type: 'action' });
        }
      }
    }
  }

  return { nodes, edges };
}

// 3. SEQUENCE DIAGRAM PARSER
export function parseSequence(code: string): SequenceDiagram {
  const lines = code.split('\n');
  
  const participants: SequenceParticipant[] = [];
  const messages: SequenceMessage[] = [];
  let msgIdCounter = 1;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('--')) continue;

    // object ParticipantId "Display Name"
    if (/^object\s+/i.test(line)) {
      const match = line.match(/^object\s+(\w+)(?:\s+(.+))?$/i);
      if (match) {
        const id = match[1];
        const name = match[2] ? cleanQuotes(match[2]) : id;
        if (!participants.some(p => p.id === id)) {
          participants.push({ id, name });
        }
      }
      continue;
    }

    // message connection: id1 -> id2 : label
    if (line.includes('->') && line.includes(':')) {
      const arrowIdx = line.indexOf('->');
      const colonIdx = line.indexOf(':');
      
      if (arrowIdx !== -1 && colonIdx > arrowIdx) {
        const from = line.substring(0, arrowIdx).trim();
        const to = line.substring(arrowIdx + 2, colonIdx).trim();
        const label = cleanQuotes(line.substring(colonIdx + 1));

        messages.push({
          id: `seq_msg_${msgIdCounter++}`,
          from,
          to,
          label
        });

        // Implicitly register participants if not declared
        if (!participants.some(p => p.id === from)) {
          participants.push({ id: from, name: from });
        }
        if (!participants.some(p => p.id === to)) {
          participants.push({ id: to, name: to });
        }
      }
    }
  }

  return { participants, messages };
}
