import { 
  UseCaseDiagram, 
  UseCaseActor, 
  UseCaseNode, 
  UseCaseSystem, 
  UseCaseConnection,
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

        if (fromId === toId) continue;

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

