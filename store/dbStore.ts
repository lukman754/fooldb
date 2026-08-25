import { create } from 'zustand';
import { 
  DatabaseSchema, 
  LayoutData, 
  UseCaseDiagram, 
  Column,
  Table
} from '@/types';
import { parseSqlSchema } from '@/lib/parser/sqlParser';
import { computeLayout } from '@/lib/layout/elkLayout';
import { parseUseCase } from '@/lib/parser/umlParser';
import { generateRelationshipVerbs } from '@/lib/ai/geminiClient';
import { visualSchemaToSql } from '@/lib/parser/visualToSql';

export type AppMode = 'erd' | 'lrs' | 'transformation' | 'usecase' | 'visual' | 'uml' | 'class';

// Debounce timer for visual layout — prevents spamming ELK.js on rapid store updates
let visualLayoutTimer: ReturnType<typeof setTimeout> | null = null;
const BUILDER_CACHE_KEY = 'fooldb_builder_state';
function scheduleVisualLayout(fn: () => void, delay = 120) {
  if (visualLayoutTimer !== null) clearTimeout(visualLayoutTimer);
  visualLayoutTimer = setTimeout(() => { visualLayoutTimer = null; fn(); }, delay);
}

export interface UmlActor {
  id: string;
  name: string;
  side: 'left' | 'right';
}

export interface UmlUsecase {
  id: string;
  name: string;
}

export interface UmlLink {
  id: string;
  actorId: string;
  usecaseId: string;
}

export interface UmlRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'include' | 'extend';
}

interface DbState {
  isInitialized: boolean;
  umlActors: UmlActor[];
  umlUsecases: UmlUsecase[];
  umlLinks: UmlLink[];
  umlRelations: UmlRelation[];
  setUmlActors: (actors: UmlActor[] | ((prev: UmlActor[]) => UmlActor[])) => void;
  setUmlUsecases: (usecases: UmlUsecase[] | ((prev: UmlUsecase[]) => UmlUsecase[])) => void;
  setUmlLinks: (links: UmlLink[] | ((prev: UmlLink[]) => UmlLink[])) => void;
  setUmlRelations: (relations: UmlRelation[] | ((prev: UmlRelation[]) => UmlRelation[])) => void;
  mode: AppMode;
  sqlCode: string;
  usecaseCode: string;
  selectedUsecaseId: string | null;
  setSelectedUsecaseId: (id: string | null) => void;
  excludedTables: string[];
  apiKey: string;
  isAiLoading: boolean;
  
  // Parsed diagrams
  schema: DatabaseSchema;
  layout: LayoutData | null; // ERD & LRS layouts
  usecaseDiagram: UseCaseDiagram | null;
  
  renderTime: number;
  zoom: number;
  error: string | null;
  selectedEntityName: string | null;
  setSelectedEntityName: (name: string | null) => void;

  // Visual ERD Builder
  visualSchema: DatabaseSchema;
  visualSchemaActive: boolean;
  addVisualTable: (name: string) => void;
  removeVisualTable: (name: string) => void;
  renameVisualTable: (oldName: string, newName: string) => void;
  addVisualColumn: (tableName: string, column: Column) => void;
  removeVisualColumn: (tableName: string, colName: string) => void;
  updateVisualColumn: (tableName: string, colName: string, patch: Partial<Column>) => void;
  updateVisualRelationCardinality: (relId: string, sourceCardinality: 'one' | 'many', targetCardinality: 'one' | 'many') => void;
  updateRelationshipVerb: (relId: string, verb: string) => void;
  updateNodePosition: (tableName: string, x: number, y: number) => void;
  addVisualFK: (fromTable: string, toTable: string) => void;
  removeVisualRelation: (relId: string) => void;
  triggerVisualLayout: () => Promise<void>;
  hasClearedVisualSchema: boolean;
  importSqlToVisual: () => void;
  clearVisualSchema: () => void;
  
  setMode: (mode: AppMode) => void;
  setCode: (mode: AppMode, code: string) => void;
  triggerParse: (mode?: AppMode, code?: string) => Promise<void>;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  resetZoom: () => void;
  fitTrigger: number;
  triggerFit: () => void;
  toggleTableExclusion: (tableName: string) => void;
  clearExcludedTables: () => void;
  setApiKey: (key: string) => void;
  triggerAiLabeling: () => Promise<void>;
  initializeStore: (currentProjectId?: string | null) => void;
  attrPositions: { [key: string]: { angle: number; radius: number } };
  setAttrPosition: (key: string, pos: { angle: number; radius: number }) => void;
  resetAttrPosition: (key: string) => void;
  resetTableAttrPositions: (tableName: string, colNames: string[]) => void;
  resetAllAttrPositions: () => void;
  relNotation: 'crowsfoot' | 'label';
  setRelNotation: (notation: 'crowsfoot' | 'label') => void;
  lrsKeyNotation: 'stars' | 'letters';
  setLrsKeyNotation: (notation: 'stars' | 'letters') => void;
  lineStyle: 'sharp' | 'rounded' | 'curved' | 'straight';
  setLineStyle: (style: 'sharp' | 'rounded' | 'curved' | 'straight') => void;
  relPositions: { [relId: string]: { x: number; y: number } };
  updateRelPosition: (relId: string, x: number, y: number) => void;
  diamondSize: number;
  setDiamondSize: (size: number) => void;
  customWaypoints: { [edgeId: string]: { sourceWaypoints: { x: number; y: number }[]; targetWaypoints: { x: number; y: number }[] } };
  updateWaypoints: (edgeId: string, side: 'source' | 'target', waypoints: { x: number; y: number }[]) => void;
  classMethods: { [tableName: string]: string[] };
  addClassMethod: (tableName: string, methodSignature: string) => void;
  removeClassMethod: (tableName: string, index: number) => void;
  updateClassMethod: (tableName: string, index: number, methodSignature: string) => void;
  setClassMethods: (methods: { [tableName: string]: string[] }) => void;
  clearCache: () => void;

  history: {
    schema: DatabaseSchema;
    visualSchema: DatabaseSchema;
    layout: LayoutData | null;
    attrPositions: { [key: string]: { angle: number; radius: number } };
    relPositions: { [relId: string]: { x: number; y: number } };
    customWaypoints: { [edgeId: string]: { sourceWaypoints: { x: number; y: number }[]; targetWaypoints: { x: number; y: number }[] } };
    sqlCode: string;
    usecaseCode: string;
    umlActors: UmlActor[];
    umlUsecases: UmlUsecase[];
    umlLinks: UmlLink[];
    umlRelations: UmlRelation[];
  }[];
  historyIndex: number;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const DEFAULT_SQL = `-- FoolDB E-commerce Sample Schema
-- Paste your SQL here or upload a .sql file!

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role ENUM('customer', 'admin', 'moderator') DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_id INT NULL,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  stock_quantity INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  status ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  shipping_address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_order_product (order_id, product_id)
);
`;

const DEFAULT_USECASE = `# E-commerce Use Case Diagram
# Write actor, system, usecase definitions and arrows!

actor Customer
actor Admin

system "E-commerce System"
usecase "Browse Products"
usecase "Manage Cart"
usecase "Checkout Order"
usecase "Manage Catalog"
usecase "Process Shipments"

Customer -> Browse Products
Customer -> Manage Cart
Customer -> Checkout Order
Admin -> Manage Catalog
Admin -> Process Shipments
`;

const DEFAULT_ACTIVITY = `# E-commerce Order Activity flow
# Syntax: start, action <id> "<label>", decision <id> "<label>", end, and edge <id1> -> <id2> [: label]

start
action checkout "Validate Checkout Cart"
decision check_stock "Are items in stock?"
action adjust_stock "Reduce inventory & create invoice"
action error_msg "Show Out-of-Stock error page"
end

start -> checkout
checkout -> check_stock
check_stock -> adjust_stock : yes
check_stock -> error_msg : no
adjust_stock -> end
error_msg -> end
`;

const DEFAULT_SEQUENCE = `# E-commerce Sequence Diagram
# Syntax: object <id> "<display_name>" and <id1> -> <id2> : message

object Customer "Customer User"
object Browser "Client Browser"
object Server "Web API Server"
object DB "MySQL Database"

Customer -> Browser : Fill cart & Click checkout
Browser -> Server : POST /api/orders (cart items)
Server -> DB : SELECT stock FROM products
DB -> Server : Product inventory counts
Server -> DB : INSERT INTO orders, order_items
DB -> Server : Order ID (e.g. 1042)
Server -> Browser : Order success JSON (201 Created)
Browser -> Customer : Display Order Success dashboard
`;

const DEFAULT_UML_ACTORS: UmlActor[] = [
  { id: 'uml_actor_1', name: 'Customer', side: 'left' },
  { id: 'uml_actor_2', name: 'Admin', side: 'left' },
];

const DEFAULT_UML_USECASES: UmlUsecase[] = [
  { id: 'uml_uc_1', name: 'Browse Products' },
  { id: 'uml_uc_2', name: 'Manage Cart' },
  { id: 'uml_uc_3', name: 'Checkout Order' },
  { id: 'uml_uc_4', name: 'Manage Catalog' },
  { id: 'uml_uc_5', name: 'Process Shipments' },
];

const DEFAULT_UML_LINKS: UmlLink[] = [
  { id: 'uml_link_1', actorId: 'uml_actor_1', usecaseId: 'uml_uc_1' },
  { id: 'uml_link_2', actorId: 'uml_actor_1', usecaseId: 'uml_uc_2' },
  { id: 'uml_link_3', actorId: 'uml_actor_1', usecaseId: 'uml_uc_3' },
  { id: 'uml_link_4', actorId: 'uml_actor_2', usecaseId: 'uml_uc_4' },
  { id: 'uml_link_5', actorId: 'uml_actor_2', usecaseId: 'uml_uc_5' },
];

const DEFAULT_UML_RELATIONS: UmlRelation[] = [];

function syncDslToInteractive(code: string) {
  const parsed = parseUseCase(code);
  const actors: UmlActor[] = parsed.actors.map(a => ({
    id: a.id,
    name: a.name,
    side: (a as any).side || 'left'
  }));
  const usecases: UmlUsecase[] = parsed.usecases.map(u => ({
    id: u.id,
    name: u.name
  }));
  const links: UmlLink[] = [];
  const relations: UmlRelation[] = [];
  parsed.connections.forEach((conn, index) => {
    const isLink = actors.some(a => a.id === conn.from) && usecases.some(u => u.id === conn.to);
    if (isLink) {
      links.push({
        id: conn.id || `uml_link_${index}`,
        actorId: conn.from,
        usecaseId: conn.to
      });
    } else {
      const type = conn.label?.includes('extend') ? 'extend' : 'include';
      relations.push({
        id: conn.id || `uml_rel_${index}`,
        sourceId: conn.from,
        targetId: conn.to,
        type
      });
    }
  });
  return { actors, usecases, links, relations };
}

export const useDbStore = create<DbState>((set, get) => {
  let initialAttrPositions = {};
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('fooldb_attr_positions');
      if (saved) initialAttrPositions = JSON.parse(saved);
    } catch {
      // ignore
    }
  }

  return {
    isInitialized: false,
    history: [],
    historyIndex: -1,
    umlActors: DEFAULT_UML_ACTORS,
    umlUsecases: DEFAULT_UML_USECASES,
    umlLinks: DEFAULT_UML_LINKS,
    umlRelations: DEFAULT_UML_RELATIONS,
    setUmlActors: (actors) => set((state) => ({ umlActors: typeof actors === 'function' ? actors(state.umlActors) : actors })),
    setUmlUsecases: (usecases) => set((state) => ({ umlUsecases: typeof usecases === 'function' ? usecases(state.umlUsecases) : usecases })),
    setUmlLinks: (links) => set((state) => ({ umlLinks: typeof links === 'function' ? links(state.umlLinks) : links })),
    setUmlRelations: (relations) => set((state) => ({ umlRelations: typeof relations === 'function' ? relations(state.umlRelations) : relations })),
    mode: 'erd',
    sqlCode: DEFAULT_SQL,
    usecaseCode: DEFAULT_USECASE,
    selectedUsecaseId: null,
    setSelectedUsecaseId: (id) => {
      set({ selectedUsecaseId: id });
      const currentMode = get().mode;
    },
    excludedTables: [],
  apiKey: '',
  isAiLoading: false,
  
  schema: { tables: [], relationships: [] },
  layout: null,
  usecaseDiagram: null,
  
  renderTime: 0,
  zoom: 1,
  error: null,
  selectedEntityName: null,
  setSelectedEntityName: (name) => set({ selectedEntityName: name }),

  // Visual ERD Builder initial state
  visualSchema: { tables: [], relationships: [] },
  visualSchemaActive: false,
  hasClearedVisualSchema: false,

  importSqlToVisual: () => {
    const currentSchema = get().schema;
    const tables = JSON.parse(JSON.stringify(currentSchema.tables));
    const relationships = currentSchema.relationships.map((r, idx) => ({
      ...r,
      id: r.id || `rel_${idx}_${Math.random().toString(36).substring(2, 9)}`,
    }));
    set({
      visualSchema: { tables, relationships },
      visualSchemaActive: true,
      hasClearedVisualSchema: false,
    });
    get().triggerVisualLayout();
  },

  clearVisualSchema: () => {
    set({
      visualSchema: { tables: [], relationships: [] },
      visualSchemaActive: false,
      hasClearedVisualSchema: true,
    });
    get().triggerVisualLayout();
  },
 
  addVisualTable: (name) => {
    if (!name.trim()) return;
    const existing = get().visualSchema.tables.find(t => t.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return;
    const newTable: Table = {
      name: name.trim(),
      columns: [
        { name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false, isUnique: true, isAutoIncrement: true, defaultValue: null, enumValues: null }
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      uniqueKeys: [],
    };
    set((state) => ({ visualSchema: { ...state.visualSchema, tables: [...state.visualSchema.tables, newTable] } }));
    scheduleVisualLayout(() => get().triggerVisualLayout());
  },

  removeVisualTable: (name) => {
    set((state) => ({
      visualSchema: {
        tables: state.visualSchema.tables.filter(t => t.name !== name),
        relationships: state.visualSchema.relationships.filter(
          r => r.sourceTable !== name && r.targetTable !== name
        ),
      }
    }));
    scheduleVisualLayout(() => get().triggerVisualLayout());
  },

  renameVisualTable: (oldName, newName) => {
    if (!newName.trim() || oldName === newName.trim()) return;
    set((state) => ({
      visualSchema: {
        tables: state.visualSchema.tables.map(t =>
          t.name === oldName ? { ...t, name: newName.trim() } : t
        ),
        relationships: state.visualSchema.relationships.map(r => ({
          ...r,
          sourceTable: r.sourceTable === oldName ? newName.trim() : r.sourceTable,
          targetTable: r.targetTable === oldName ? newName.trim() : r.targetTable,
        })),
      }
    }));
    scheduleVisualLayout(() => get().triggerVisualLayout());
  },

  addVisualColumn: (tableName, column) => {
    set((state) => ({
      visualSchema: {
        ...state.visualSchema,
        tables: state.visualSchema.tables.map(t =>
          t.name === tableName
            ? {
                ...t,
                columns: [...t.columns, column],
                primaryKey: column.isPrimaryKey ? [...t.primaryKey, column.name] : t.primaryKey,
              }
            : t
        ),
      }
    }));
    scheduleVisualLayout(() => get().triggerVisualLayout());
  },

  removeVisualColumn: (tableName, colName) => {
    set((state) => ({
      visualSchema: {
        ...state.visualSchema,
        tables: state.visualSchema.tables.map(t =>
          t.name === tableName
            ? {
                ...t,
                columns: t.columns.filter(c => c.name !== colName),
                primaryKey: t.primaryKey.filter(pk => pk !== colName),
              }
            : t
        ),
      }
    }));
    scheduleVisualLayout(() => get().triggerVisualLayout());
  },

  updateVisualColumn: (tableName, colName, patch) => {
    set((state) => ({
      ...(() => {
        let updatedTable: Table | undefined;
        const newName = (patch as { name?: string }).name;
        const tables = state.visualSchema.tables.map(t => {
          if (t.name !== tableName) return t;
          const updatedCols = t.columns.map(c => c.name === colName ? { ...c, ...patch } : c);
          // Rebuild primary key list from updated columns
          const newPK = updatedCols.filter(c => c.isPrimaryKey).map(c => c.name);
          // Handle rename: if colName is being changed, update FK references
          const fks = newName && newName !== colName
            ? t.foreignKeys.map(fk => ({
                ...fk,
                columns: fk.columns.map(c => c === colName ? newName : c),
              }))
            : t.foreignKeys;
          updatedTable = { ...t, columns: updatedCols, primaryKey: newPK, foreignKeys: fks };
          return updatedTable;
        });
        const relationships = state.visualSchema.relationships.map(rel =>
          newName && newName !== colName && rel.sourceTable === tableName
            ? { ...rel, sourceColumns: rel.sourceColumns.map(c => c === colName ? newName : c) }
            : rel
        );
        const visualSchema = { ...state.visualSchema, tables, relationships };

        // The preview renders table data from `layout`. Mirror the changed table
        // there immediately so the diagram label updates on every keystroke.
        const layout = state.layout && updatedTable
          ? {
              ...state.layout,
              nodes: state.layout.nodes.map(node =>
                node.table.name === tableName ? { ...node, table: updatedTable! } : node
              ),
              edges: state.layout.edges.map(edge => ({
                ...edge,
                relationship: relationships.find(rel => rel.id === edge.relationship.id) ?? edge.relationship,
              })),
            }
          : state.layout;

        return { visualSchema, layout };
      })(),
    }));
    // Only trigger layout for structural changes (type, PK, nullable, unique)
    // Name-only changes don't affect layout geometry — skip to avoid focus loss
    const isNameOnlyPatch = Object.keys(patch).length === 1 && 'name' in patch;
    if (!isNameOnlyPatch) {
      scheduleVisualLayout(() => get().triggerVisualLayout());
    }
  },

  updateVisualRelationCardinality: (relId, sourceCardinality, targetCardinality) => {
    const type: '1:1' | '1:N' | 'M:N' = sourceCardinality === 'one' && targetCardinality === 'one'
      ? '1:1'
      : sourceCardinality === 'many' && targetCardinality === 'many'
        ? 'M:N'
        : '1:N';
    set((state) => {
      const updatedVisualRelationships = state.visualSchema.relationships.map(rel =>
        rel.id === relId ? { ...rel, type, sourceCardinality, targetCardinality } : rel
      );
      const updatedRelationships = state.schema.relationships.map(rel =>
        rel.id === relId ? { ...rel, type, sourceCardinality, targetCardinality } : rel
      );
      const layout = state.layout
        ? {
            ...state.layout,
            edges: state.layout.edges.map(edge => {
              if (edge.relationship.id === relId) {
                return {
                  ...edge,
                  relationship: { ...edge.relationship, type, sourceCardinality, targetCardinality }
                };
              }
              return edge;
            })
          }
        : state.layout;

      return {
        visualSchema: { ...state.visualSchema, relationships: updatedVisualRelationships },
        schema: { ...state.schema, relationships: updatedRelationships },
        layout
      };
    });
  },

  updateRelationshipVerb: (relId, verb) => {
    set((state) => {
      const updatedVisualRelationships = state.visualSchema.relationships.map(rel =>
        rel.id === relId ? { ...rel, verb } : rel
      );
      const updatedRelationships = state.schema.relationships.map(rel =>
        rel.id === relId ? { ...rel, verb } : rel
      );
      const layout = state.layout
        ? {
            ...state.layout,
            edges: state.layout.edges.map(edge => {
              if (edge.relationship.id === relId) {
                return {
                  ...edge,
                  relationship: { ...edge.relationship, verb }
                };
              }
              return edge;
            })
          }
        : state.layout;

      return {
        visualSchema: { ...state.visualSchema, relationships: updatedVisualRelationships },
        schema: { ...state.schema, relationships: updatedRelationships },
        layout
      };
    });
  },

  updateNodePosition: (tableName, x, y) => {
    set((state) => {
      if (!state.layout) return {};

      // 1. Update the table node coordinates
      const nodes = state.layout.nodes.map((node) => {
        if (node.table.name === tableName) {
          return { ...node, x, y };
        }
        return node;
      });

      const movedNode = nodes.find((n) => n.table.name === tableName);
      if (!movedNode) return {};

      const cx = movedNode.x + movedNode.width / 2;
      const cy = movedNode.y + movedNode.height / 2;

      // 2. Update connecting edge endpoints
      const edges = state.layout.edges.map((edge) => {
        const points = [...edge.points];
        let updated = false;

        if (edge.sourceTable === tableName && points.length > 0) {
          points[0] = { x: cx, y: cy };
          updated = true;
        }
        if (edge.targetTable === tableName && points.length > 0) {
          points[points.length - 1] = { x: cx, y: cy };
          updated = true;
        }

        if (updated) {
          return { ...edge, points };
        }
        return edge;
      });

      return {
        layout: {
          ...state.layout,
          nodes,
          edges,
        }
      };
    });
  },

  addVisualFK: (fromTable, toTable) => {
    const state = get();
    const targetTableDef = state.visualSchema.tables.find(t => t.name === toTable);
    if (!targetTableDef) return;
    // Use the first PK of target table as the referenced column, fallback to 'id'
    const referencedCol = targetTableDef.primaryKey[0] || 'id';
    const fkColName = `${toTable}_${referencedCol}`;
    // Avoid duplicating FK column
    const fromTableDef = state.visualSchema.tables.find(t => t.name === fromTable);
    if (!fromTableDef) return;
    const alreadyExists = fromTableDef.columns.some(c => c.name === fkColName);
    if (!alreadyExists) {
      const fkCol: Column = {
        name: fkColName,
        type: 'INT',
        isPrimaryKey: false,
        isNullable: true,
        isUnique: false,
        isAutoIncrement: false,
        defaultValue: null,
        enumValues: null,
      };
      const relId = `${fromTable}_${toTable}_fk_${Date.now()}`;
      set((s) => ({
        visualSchema: {
          tables: s.visualSchema.tables.map(t =>
            t.name === fromTable
              ? {
                  ...t,
                  columns: [...t.columns, fkCol],
                  foreignKeys: [
                    ...t.foreignKeys,
                    { columns: [fkColName], referencedTable: toTable, referencedColumns: [referencedCol] }
                  ],
                }
              : t
          ),
          relationships: [
            ...s.visualSchema.relationships,
            {
              id: relId,
              sourceTable: fromTable,
              sourceColumns: [fkColName],
              targetTable: toTable,
              targetColumns: [referencedCol],
              type: '1:N' as const,
            },
          ],
        }
      }));
      scheduleVisualLayout(() => get().triggerVisualLayout());
    }
  },

  removeVisualRelation: (relId) => {
    const state = get();
    const rel = state.visualSchema.relationships.find(r => r.id === relId);
    if (!rel) return;
    // Remove the FK column from the source table
    set((s) => ({
      visualSchema: {
        tables: s.visualSchema.tables.map(t =>
          t.name === rel.sourceTable
            ? {
                ...t,
                columns: t.columns.filter(c => !rel.sourceColumns.includes(c.name)),
                foreignKeys: t.foreignKeys.filter(
                  fk => !(fk.referencedTable === rel.targetTable && fk.columns.some(c => rel.sourceColumns.includes(c)))
                ),
              }
            : t
        ),
        relationships: s.visualSchema.relationships.filter(r => r.id !== relId),
      }
    }));
    scheduleVisualLayout(() => get().triggerVisualLayout());
  },

  triggerVisualLayout: async () => {
    const { visualSchema } = get();
    if (visualSchema.tables.length === 0) {
      set({ layout: null, schema: visualSchema, error: null });
      get().saveHistory();
      return;
    }
    try {
      const layout = await computeLayout(visualSchema);
      // Ignore an outdated async layout result if the schema changed while ELK ran.
      if (get().visualSchema !== visualSchema) return;
      set({ layout, schema: visualSchema, error: null });
      get().saveHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
    }
  },

  setMode: (mode) => {
    const hasVisualSchema = get().visualSchema.tables.length > 0;
    const isDatabaseMode = mode === 'erd' || mode === 'lrs' || mode === 'transformation';

    if (isDatabaseMode && hasVisualSchema) {
      set({
        mode,
        sqlCode: visualSchemaToSql(get().visualSchema),
        visualSchemaActive: true,
      });
      get().triggerVisualLayout();
    } else if (mode === 'visual' || mode === 'uml') {
      set({ mode });
      if (mode === 'visual') {
        const hasVisualSchema = get().visualSchema.tables.length > 0;
        const cleared = get().hasClearedVisualSchema;
        if (!hasVisualSchema && !cleared && get().schema.tables.length > 0) {
          get().importSqlToVisual();
          return;
        }
      }
      get().triggerVisualLayout();
    } else {
      set({ mode });
      get().triggerParse(mode);
    }
  },

  setCode: (mode, code) => {
    if (mode === 'erd' || mode === 'lrs' || mode === 'transformation') {
      set({ sqlCode: code, visualSchemaActive: false });
    } else if (mode === 'usecase') {
      set({ usecaseCode: code });
    }
  },

  triggerParse: async (modeArg, codeArg) => {
    // Visual mode uses triggerVisualLayout instead
    if ((modeArg ?? get().mode) === 'visual' || (modeArg ?? get().mode) === 'uml') {
      await get().triggerVisualLayout();
      return;
    }
    const targetMode = modeArg !== undefined ? modeArg : get().mode;
    if (
      (targetMode === 'erd' || targetMode === 'lrs' || targetMode === 'transformation') &&
      get().visualSchemaActive &&
      get().visualSchema.tables.length > 0
    ) {
      await get().triggerVisualLayout();
      return;
    }
    const startTime = performance.now();

    try {
      if (targetMode === 'erd' || targetMode === 'lrs' || targetMode === 'transformation') {
        const code = codeArg !== undefined ? codeArg : get().sqlCode;
        const rawSchema = parseSqlSchema(code);

        // Filter tables and relationships based on exclusions checklist
        const excluded = get().excludedTables;
        const filteredTables = rawSchema.tables.filter(t => !excluded.includes(t.name.toLowerCase()));
        const filteredRelationships = rawSchema.relationships.filter(r => 
          !excluded.includes(r.sourceTable.toLowerCase()) && 
          !excluded.includes(r.targetTable.toLowerCase())
        );

        const schema = {
          tables: filteredTables,
          relationships: filteredRelationships
        };

        const layout = await computeLayout(schema);
        
        const duration = performance.now() - startTime;
        set({
          schema: rawSchema, // Store the full parsed schema so the checklist remains complete
          layout,
          renderTime: Math.round(duration),
          error: null
        });
      } else if (targetMode === 'usecase') {
        const code = codeArg !== undefined ? codeArg : get().usecaseCode;
        const usecaseDiagram = parseUseCase(code);
        const synced = syncDslToInteractive(code);
        
        const duration = performance.now() - startTime;
        set({
          usecaseDiagram,
          umlActors: synced.actors,
          umlUsecases: synced.usecases,
          umlLinks: synced.links,
          umlRelations: synced.relations,
          renderTime: Math.round(duration),
          error: null
        });
      }
      get().saveHistory();
    } catch (err: unknown) {
      console.error('Parsing failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      set({
        error: msg || 'An error occurred while parsing and laying out the diagram.'
      });
    }
  },

  setZoom: (zoom) => {
    if (typeof zoom === 'function') {
      set((state) => ({ zoom: Math.max(0.1, Math.min(3, zoom(state.zoom))) }));
    } else {
      set({ zoom: Math.max(0.1, Math.min(3, zoom)) });
    }
  },

  resetZoom: () => {
    set({ zoom: 1 });
  },

  fitTrigger: 0,
  triggerFit: () => set((state) => ({ fitTrigger: state.fitTrigger + 1 })),

  toggleTableExclusion: (tableName) => {
    const lowerName = tableName.toLowerCase();
    set((state) => {
      const excluded = state.excludedTables.includes(lowerName)
        ? state.excludedTables.filter(t => t !== lowerName)
        : [...state.excludedTables, lowerName];
      return { excludedTables: excluded };
    });
    get().triggerParse();
  },

  clearExcludedTables: () => {
    set({ excludedTables: [] });
    get().triggerParse();
  },

  setApiKey: (key) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('fooldb_gemini_key', key);
    }
    set({ apiKey: key });
  },

  triggerAiLabeling: async () => {
    const apiKey = get().apiKey;
    if (!apiKey) {
      throw new Error('API Key is missing. Please click the Key icon in the header to set your Gemini API Key.');
    }

    set({ isAiLoading: true, error: null });

    try {
      const currentSchema = get().schema;
      if (!currentSchema || currentSchema.relationships.length === 0) {
        throw new Error('No relationships found in the active schema to label.');
      }

      // Query Gemini API to generate natural Indonesian verbs
      const verbs = await generateRelationshipVerbs(currentSchema, apiKey);

      // Map the generated verbs back to relationships in the full schema
      const updatedRelationships = currentSchema.relationships.map((r) => {
        if (verbs[r.id]) {
          return { ...r, verb: verbs[r.id] };
        }
        return r;
      });

      const rawSchema = {
        tables: currentSchema.tables,
        relationships: updatedRelationships,
      };

      // Filter and compute layout on the updated schema
      const excluded = get().excludedTables;
      const filteredTables = rawSchema.tables.filter((t) => !excluded.includes(t.name.toLowerCase()));
      const filteredRelationships = rawSchema.relationships.filter(
        (r) =>
          !excluded.includes(r.sourceTable.toLowerCase()) &&
          !excluded.includes(r.targetTable.toLowerCase())
      );

      const schema = {
        tables: filteredTables,
        relationships: filteredRelationships,
      };

      const layout = await computeLayout(schema);

      set({
        schema: rawSchema,
        layout,
        isAiLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      console.error('AI Auto-Labeling failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      set({
        isAiLoading: false,
        error: msg || 'AI Auto-Labeling failed.',
      });
    }
  },

  initializeStore: (currentProjectId?: string | null) => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('fooldb_gemini_key') || '';
      set({ apiKey: savedKey });

      if (currentProjectId) {
        const cachedProjectId = localStorage.getItem('fooldb_last_project_id');
        if (cachedProjectId && cachedProjectId !== currentProjectId) {
          localStorage.removeItem(BUILDER_CACHE_KEY);
          localStorage.removeItem('fooldb_attr_positions');
          localStorage.removeItem('fooldb_rel_positions');
          localStorage.removeItem('fooldb_custom_waypoints');
        }
        localStorage.setItem('fooldb_last_project_id', currentProjectId);
      }
      try {
        const saved = localStorage.getItem('fooldb_attr_positions');
        if (saved) {
          set({ attrPositions: JSON.parse(saved) });
        }
      } catch {
        // ignore
      }
      try {
        const savedRels = localStorage.getItem('fooldb_rel_positions');
        if (savedRels) {
          set({ relPositions: JSON.parse(savedRels) });
        }
      } catch {
        // ignore
      }
      try {
        const savedWaypoints = localStorage.getItem('fooldb_custom_waypoints');
        if (savedWaypoints) {
          set({ customWaypoints: JSON.parse(savedWaypoints) });
        }
      } catch {
        // ignore
      }
      try {
        const cachedBuilderState = localStorage.getItem(BUILDER_CACHE_KEY);
        if (cachedBuilderState) {
          const cached = JSON.parse(cachedBuilderState) as Partial<Pick<DbState,
            'visualSchema' | 'visualSchemaActive' | 'sqlCode' | 'usecaseCode' | 'relNotation' | 'lrsKeyNotation' | 'lineStyle' | 'classMethods' | 'mode' | 'excludedTables' | 'zoom' | 'umlActors' | 'umlUsecases' | 'umlLinks' | 'umlRelations' | 'selectedUsecaseId' | 'diamondSize'
          >>;
          set({
            ...cached,
            isInitialized: true
          });
          const targetMode = cached.mode || 'erd';
          if (cached.visualSchemaActive && cached.visualSchema?.tables?.length) {
            get().triggerVisualLayout();
          } else {
            const code = targetMode === 'erd' || targetMode === 'lrs' || targetMode === 'transformation' || targetMode === 'class'
              ? (cached.sqlCode || DEFAULT_SQL)
              : targetMode === 'usecase'
                ? (cached.usecaseCode || DEFAULT_USECASE)
                : (cached.sqlCode || DEFAULT_SQL);
            get().triggerParse(targetMode, code);
          }
        } else {
          set({ isInitialized: true });
          get().triggerParse('erd', DEFAULT_SQL);
        }
      } catch {
        set({ isInitialized: true });
      }
    }
  },

  attrPositions: initialAttrPositions,
  setAttrPosition: (key, pos) => {
    set((state) => {
      const updated = {
        ...state.attrPositions,
        [key]: pos
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('fooldb_attr_positions', JSON.stringify(updated));
      }
      return { attrPositions: updated };
    });
  },
  resetAttrPosition: (key) => {
    set((state) => {
      const updated = { ...state.attrPositions };
      delete updated[key];
      if (typeof window !== 'undefined') {
        localStorage.setItem('fooldb_attr_positions', JSON.stringify(updated));
      }
      return { attrPositions: updated };
    });
  },
  resetTableAttrPositions: (tableName, colNames) => {
    set((state) => {
      const updated = { ...state.attrPositions };
      colNames.forEach((name) => {
        delete updated[`${tableName}-${name}`];
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('fooldb_attr_positions', JSON.stringify(updated));
      }
      return { attrPositions: updated };
    });
  },
  resetAllAttrPositions: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fooldb_attr_positions');
      localStorage.removeItem('fooldb_rel_positions');
      localStorage.removeItem('fooldb_custom_waypoints');
    }
    set({ attrPositions: {}, relPositions: {}, customWaypoints: {} });
  },
  relPositions: {},
  updateRelPosition: (relId, x, y) => {
    set((state) => {
      const updated = {
        ...state.relPositions,
        [relId]: { x, y }
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('fooldb_rel_positions', JSON.stringify(updated));
      }
      return { relPositions: updated };
    });
  },
  diamondSize: 120,
  setDiamondSize: (size) => set({ diamondSize: size }),
  customWaypoints: {},
  updateWaypoints: (edgeId, side, waypoints) => {
    set((state) => {
      const existing = state.customWaypoints[edgeId] || { sourceWaypoints: [], targetWaypoints: [] };
      const updated = {
        ...state.customWaypoints,
        [edgeId]: {
          ...existing,
          [side === 'source' ? 'sourceWaypoints' : 'targetWaypoints']: waypoints,
        },
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('fooldb_custom_waypoints', JSON.stringify(updated));
      }
      return { customWaypoints: updated };
    });
  },
  relNotation: 'crowsfoot',
  setRelNotation: (notation) => set({ relNotation: notation }),
  lrsKeyNotation: 'stars',
  setLrsKeyNotation: (notation) => set({ lrsKeyNotation: notation }),
  lineStyle: 'sharp',
  setLineStyle: (style) => set({ lineStyle: style }),
  classMethods: {},
  addClassMethod: (tableName, methodSignature) => {
    set((state) => {
      const current = state.classMethods[tableName] || [];
      const updated = {
        ...state.classMethods,
        [tableName]: [...current, methodSignature]
      };
      return { classMethods: updated };
    });
  },
  removeClassMethod: (tableName, index) => {
    set((state) => {
      const current = state.classMethods[tableName] || [];
      const updated = {
        ...state.classMethods,
        [tableName]: current.filter((_, idx) => idx !== index)
      };
      return { classMethods: updated };
    });
  },
  updateClassMethod: (tableName, index, methodSignature) => {
    set((state) => {
      const current = state.classMethods[tableName] || [];
      const updated = {
        ...state.classMethods,
        [tableName]: current.map((m, idx) => idx === index ? methodSignature : m)
      };
      return { classMethods: updated };
    });
  },
  setClassMethods: (methods) => set({ classMethods: methods }),
  clearCache: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(BUILDER_CACHE_KEY);
      localStorage.removeItem('fooldb_attr_positions');
      localStorage.removeItem('fooldb_rel_positions');
      localStorage.removeItem('fooldb_custom_waypoints');
    }
    set({
      mode: 'erd',
      sqlCode: DEFAULT_SQL,
      usecaseCode: DEFAULT_USECASE,
      selectedUsecaseId: null,
      excludedTables: [],
      visualSchema: { tables: [], relationships: [] },
      visualSchemaActive: false,
      classMethods: {},
      attrPositions: {},
      relPositions: {},
      customWaypoints: {},
      zoom: 1,
      umlActors: DEFAULT_UML_ACTORS,
      umlUsecases: DEFAULT_UML_USECASES,
      umlLinks: DEFAULT_UML_LINKS,
      umlRelations: DEFAULT_UML_RELATIONS,
    });
    get().triggerParse('erd', DEFAULT_SQL);
  },

  saveHistory: () => {
    set((state) => {
      const snapshot = {
        schema: JSON.parse(JSON.stringify(state.schema)),
        visualSchema: JSON.parse(JSON.stringify(state.visualSchema)),
        layout: state.layout ? JSON.parse(JSON.stringify(state.layout)) : null,
        attrPositions: JSON.parse(JSON.stringify(state.attrPositions)),
        relPositions: JSON.parse(JSON.stringify(state.relPositions)),
        customWaypoints: JSON.parse(JSON.stringify(state.customWaypoints)),
        sqlCode: state.sqlCode,
        usecaseCode: state.usecaseCode,
        umlActors: JSON.parse(JSON.stringify(state.umlActors)),
        umlUsecases: JSON.parse(JSON.stringify(state.umlUsecases)),
        umlLinks: JSON.parse(JSON.stringify(state.umlLinks)),
        umlRelations: JSON.parse(JSON.stringify(state.umlRelations)),
      };

      if (state.history.length > 0 && state.historyIndex >= 0) {
        const current = state.history[state.historyIndex];
        if (JSON.stringify(current) === JSON.stringify(snapshot)) {
          return {};
        }
      }

      const newHistory = state.history.slice(0, state.historyIndex + 1);
      if (newHistory.length >= 50) {
        newHistory.shift();
      }
      newHistory.push(snapshot);

      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex <= 0) return {};
      const nextIndex = state.historyIndex - 1;
      const snapshot = state.history[nextIndex];
      return {
        historyIndex: nextIndex,
        schema: snapshot.schema,
        visualSchema: snapshot.visualSchema,
        layout: snapshot.layout,
        attrPositions: snapshot.attrPositions,
        relPositions: snapshot.relPositions ?? {},
        customWaypoints: snapshot.customWaypoints ?? {},
        sqlCode: snapshot.sqlCode,
        usecaseCode: snapshot.usecaseCode,
        umlActors: snapshot.umlActors,
        umlUsecases: snapshot.umlUsecases,
        umlLinks: snapshot.umlLinks,
        umlRelations: snapshot.umlRelations,
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return {};
      const nextIndex = state.historyIndex + 1;
      const snapshot = state.history[nextIndex];
      return {
        historyIndex: nextIndex,
        schema: snapshot.schema,
        visualSchema: snapshot.visualSchema,
        layout: snapshot.layout,
        attrPositions: snapshot.attrPositions,
        relPositions: snapshot.relPositions ?? {},
        customWaypoints: snapshot.customWaypoints ?? {},
        sqlCode: snapshot.sqlCode,
        usecaseCode: snapshot.usecaseCode,
        umlActors: snapshot.umlActors,
        umlUsecases: snapshot.umlUsecases,
        umlLinks: snapshot.umlLinks,
        umlRelations: snapshot.umlRelations,
      };
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
};
});

if (typeof window !== 'undefined') {
  useDbStore.subscribe((state) => {
    if (!state.isInitialized) return;
    const cache = {
      visualSchema: state.visualSchema,
      visualSchemaActive: state.visualSchemaActive,
      sqlCode: state.sqlCode,
      usecaseCode: state.usecaseCode,
      relNotation: state.relNotation,
      lrsKeyNotation: state.lrsKeyNotation,
      lineStyle: state.lineStyle,
      classMethods: state.classMethods,
      mode: state.mode,
      excludedTables: state.excludedTables,
      zoom: state.zoom,
      umlActors: state.umlActors,
      umlUsecases: state.umlUsecases,
      umlLinks: state.umlLinks,
      umlRelations: state.umlRelations,
      selectedUsecaseId: state.selectedUsecaseId,
      diamondSize: state.diamondSize,
    };
    localStorage.setItem(BUILDER_CACHE_KEY, JSON.stringify(cache));
  });
}

