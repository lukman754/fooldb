import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import { DatabaseSchema, LayoutData, LayoutNode, LayoutEdge, LayoutEdgePoint, ActivityDiagram, ActivityLayoutData, ActivityLayoutNode, ActivityLayoutEdge } from '@/types';

const elk = new ELK();

const TABLE_WIDTH = 120;
const TABLE_HEIGHT = 45;

export async function computeLayout(schema: DatabaseSchema): Promise<LayoutData> {
  const children: ElkNode[] = [];
  const edges: ElkExtendedEdge[] = [];

  // 1. Create nodes for each table
  for (const table of schema.tables) {
    const N = table.columns.length;
    const R = 85 + N * 5;
    // Account for attributes orbiting around the table plus spacing
    const bboxWidth = 2 * (R + 80);
    const bboxHeight = 2 * (R + 60);

    children.push({
      id: table.name,
      width: bboxWidth,
      height: bboxHeight,
      layoutOptions: {
        'elk.portConstraints': 'FREE',
      }
    });
  }

  // 2. Create edges for relationships
  for (const rel of schema.relationships) {
    edges.push({
      id: rel.id,
      sources: [rel.sourceTable],
      targets: [rel.targetTable],
    });
  }

  // 3. Define ELK Graph
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '100', // Small spacing since node dimensions already include orbits
      'elk.layered.spacing.edgeNode': '80',
      'elk.layered.spacing.edgeEdge': '60',
      'elk.edgeRouting': 'ORTHOGONAL', // Orthogonal routing for neat lines
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', // Balanced alignment
    },
    children,
    edges,
  };

  try {
    const laidOutGraph = await elk.layout(graph);

    const layoutNodes: LayoutNode[] = [];
    const layoutEdges: LayoutEdge[] = [];

    // 4. Map laid out nodes
    if (laidOutGraph.children) {
      for (const node of laidOutGraph.children) {
        const table = schema.tables.find(t => t.name === node.id);
        if (table) {
          layoutNodes.push({
            id: node.id,
            x: node.x || 0,
            y: node.y || 0,
            width: node.width || TABLE_WIDTH,
            height: node.height || TABLE_HEIGHT,
            table,
          });
        }
      }
    }

    // 5. Map laid out edges
    if (laidOutGraph.edges) {
      for (const edge of laidOutGraph.edges) {
        const relationship = schema.relationships.find(r => r.id === edge.id);
        if (relationship) {
          const points: LayoutEdgePoint[] = [];
          const sourceNode = layoutNodes.find(n => n.id === relationship.sourceTable);
          const targetNode = layoutNodes.find(n => n.id === relationship.targetTable);

            if (edge.sections && edge.sections.length > 0 && sourceNode && targetNode) {
              const section = edge.sections[0];
              
              const cx_src = sourceNode.x + sourceNode.width / 2;
              const cy_src = sourceNode.y + sourceNode.height / 2;
              const cx_tgt = targetNode.x + targetNode.width / 2;
              const cy_tgt = targetNode.y + targetNode.height / 2;

              // Add start point (source table center)
              points.push({ x: cx_src, y: cy_src });
              
              // Add bend points
              if (section.bendPoints) {
                for (const bp of section.bendPoints) {
                  points.push({ x: bp.x, y: bp.y });
                }
              }
              
              // Add end point (target table center)
              points.push({ x: cx_tgt, y: cy_tgt });
            }

          layoutEdges.push({
            id: edge.id,
            relationship,
            points,
            sourceTable: relationship.sourceTable,
            targetTable: relationship.targetTable,
          });
        }
      }
    }

    return {
      width: laidOutGraph.width || 800,
      height: laidOutGraph.height || 600,
      nodes: layoutNodes,
      edges: layoutEdges,
    };
  } catch (error) {
    console.error('ELK Layout failed:', error);
    // Return simple fallback layout in case of error
    let fallbackY = 50;
    const layoutNodes: LayoutNode[] = schema.tables.map((table, index) => {
      const N = table.columns.length;
      const R = 85 + N * 5;
      const bboxWidth = 2 * (R + 80);
      const bboxHeight = 2 * (R + 60);

      const node = {
        id: table.name,
        x: 50 + (index % 3) * 450,
        y: fallbackY,
        width: bboxWidth,
        height: bboxHeight,
        table,
      };
      if (index % 3 === 2) fallbackY += bboxHeight + 150;
      return node;
    });

    return {
      width: 1000,
      height: fallbackY + 300,
      nodes: layoutNodes,
      edges: [],
    };
  }
}

export async function computeActivityLayout(diagram: ActivityDiagram): Promise<ActivityLayoutData> {
  if (!diagram || !diagram.nodes || diagram.nodes.length === 0) {
    return { nodes: [], edges: [], width: 100, height: 100 };
  }
  const children: ElkNode[] = [];
  const edges: ElkExtendedEdge[] = [];

  for (const node of diagram.nodes) {
    let width = 120;
    let height = 45;
    if (node.type === 'start' || node.type === 'end') {
      width = 30;
      height = 30;
    } else if (node.type === 'decision') {
      width = 80;
      height = 80;
    }
    children.push({
      id: node.id,
      width,
      height,
    });
  }

  for (const edge of diagram.edges) {
    edges.push({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    });
  }

  const graph: ElkNode = {
    id: 'root_activity',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.edgeNode': '40',
      'elk.layered.spacing.edgeEdge': '30',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children,
    edges,
  };

  try {
    const laidOutGraph = await elk.layout(graph);
    const layoutNodes: ActivityLayoutNode[] = [];
    const layoutEdges: ActivityLayoutEdge[] = [];

    if (laidOutGraph.children) {
      for (const child of laidOutGraph.children) {
        const origNode = diagram.nodes.find(n => n.id === child.id);
        if (origNode) {
          layoutNodes.push({
            id: child.id,
            x: child.x || 0,
            y: child.y || 0,
            width: child.width || 120,
            height: child.height || 45,
            label: origNode.label,
            type: origNode.type,
          });
        }
      }
    }

    if (laidOutGraph.edges) {
      for (const edge of laidOutGraph.edges) {
        const origEdge = diagram.edges.find(e => e.id === edge.id);
        if (origEdge) {
          const points: { x: number; y: number }[] = [];
          if (edge.sections && edge.sections.length > 0) {
            const section = edge.sections[0];
            points.push({ x: section.startPoint.x, y: section.startPoint.y });
            if (section.bendPoints) {
              for (const bp of section.bendPoints) {
                points.push({ x: bp.x, y: bp.y });
              }
            }
            points.push({ x: section.endPoint.x, y: section.endPoint.y });
          }
          layoutEdges.push({
            id: edge.id,
            source: origEdge.source,
            target: origEdge.target,
            label: origEdge.label,
            points,
          });
        }
      }
    }

    return {
      width: laidOutGraph.width || 800,
      height: laidOutGraph.height || 600,
      nodes: layoutNodes,
      edges: layoutEdges,
    };
  } catch (err) {
    console.error('ELK Activity Layout failed:', err);
    const layoutNodes: ActivityLayoutNode[] = [];
    let currentY = 50;

    diagram.nodes.forEach((node) => {
      let width = 120;
      let height = 45;
      if (node.type === 'start' || node.type === 'end') {
        width = 30;
        height = 30;
      } else if (node.type === 'decision') {
        width = 80;
        height = 80;
      }
      layoutNodes.push({
        id: node.id,
        x: 250 - width / 2,
        y: currentY,
        width,
        height,
        label: node.label,
        type: node.type,
      });
      currentY += height + 80;
    });

    const layoutEdges: ActivityLayoutEdge[] = diagram.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      points: [],
    }));

    return {
      width: 500,
      height: currentY + 100,
      nodes: layoutNodes,
      edges: layoutEdges,
    };
  }
}

