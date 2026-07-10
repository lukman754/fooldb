import { create } from 'zustand';
import { 
  DatabaseSchema, 
  LayoutData, 
  UseCaseDiagram, 
  ActivityDiagram, 
  ActivityLayoutData, 
  SequenceDiagram 
} from '@/types';
import { parseSqlSchema } from '@/lib/parser/sqlParser';
import { computeLayout, computeActivityLayout } from '@/lib/layout/elkLayout';
import { parseUseCase, parseActivity, parseSequence } from '@/lib/parser/umlParser';
import { generateRelationshipVerbs } from '@/lib/ai/geminiClient';

export type AppMode = 'erd' | 'lrs' | 'transformation' | 'usecase' | 'activity' | 'sequence';

interface DbState {
  mode: AppMode;
  sqlCode: string;
  usecaseCode: string;
  activityCode: string;
  sequenceCode: string;
  excludedTables: string[];
  apiKey: string;
  isAiLoading: boolean;
  
  // Parsed diagrams
  schema: DatabaseSchema;
  layout: LayoutData | null; // ERD & LRS layouts
  usecaseDiagram: UseCaseDiagram | null;
  activityDiagram: ActivityLayoutData | null;
  sequenceDiagram: SequenceDiagram | null;
  
  renderTime: number;
  zoom: number;
  error: string | null;
  
  setMode: (mode: AppMode) => void;
  setCode: (mode: AppMode, code: string) => void;
  triggerParse: (mode?: AppMode, code?: string) => Promise<void>;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  resetZoom: () => void;
  toggleTableExclusion: (tableName: string) => void;
  clearExcludedTables: () => void;
  setApiKey: (key: string) => void;
  triggerAiLabeling: () => Promise<void>;
  initializeStore: () => void;
  attrPositions: { [key: string]: { angle: number; radius: number } };
  setAttrPosition: (key: string, pos: { angle: number; radius: number }) => void;
  resetAttrPosition: (key: string) => void;
  resetTableAttrPositions: (tableName: string, colNames: string[]) => void;
  resetAllAttrPositions: () => void;
  relNotation: 'crowsfoot' | 'label';
  setRelNotation: (notation: 'crowsfoot' | 'label') => void;
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
    mode: 'erd',
  sqlCode: DEFAULT_SQL,
  usecaseCode: DEFAULT_USECASE,
  activityCode: DEFAULT_ACTIVITY,
  sequenceCode: DEFAULT_SEQUENCE,
  excludedTables: [],
  apiKey: '',
  isAiLoading: false,
  
  schema: { tables: [], relationships: [] },
  layout: null,
  usecaseDiagram: null,
  activityDiagram: null,
  sequenceDiagram: null,
  
  renderTime: 0,
  zoom: 1,
  error: null,

  setMode: (mode) => {
    set({ mode });
    get().triggerParse(mode);
  },

  setCode: (mode, code) => {
    if (mode === 'erd' || mode === 'lrs' || mode === 'transformation') {
      set({ sqlCode: code });
    } else if (mode === 'usecase') {
      set({ usecaseCode: code });
    } else if (mode === 'activity') {
      set({ activityCode: code });
    } else if (mode === 'sequence') {
      set({ sequenceCode: code });
    }
  },

  triggerParse: async (modeArg, codeArg) => {
    const targetMode = modeArg !== undefined ? modeArg : get().mode;
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
        
        const duration = performance.now() - startTime;
        set({
          usecaseDiagram,
          renderTime: Math.round(duration),
          error: null
        });
      } else if (targetMode === 'activity') {
        const code = codeArg !== undefined ? codeArg : get().activityCode;
        const parsed = parseActivity(code);
        const activityDiagram = await computeActivityLayout(parsed);
        
        const duration = performance.now() - startTime;
        set({
          activityDiagram,
          renderTime: Math.round(duration),
          error: null
        });
      } else if (targetMode === 'sequence') {
        const code = codeArg !== undefined ? codeArg : get().sequenceCode;
        const sequenceDiagram = parseSequence(code);
        
        const duration = performance.now() - startTime;
        set({
          sequenceDiagram,
          renderTime: Math.round(duration),
          error: null
        });
      }
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

  initializeStore: () => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('fooldb_gemini_key') || '';
      set({ apiKey: savedKey });
      try {
        const saved = localStorage.getItem('fooldb_attr_positions');
        if (saved) {
          set({ attrPositions: JSON.parse(saved) });
        }
      } catch {
        // ignore
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
    }
    set({ attrPositions: {} });
  },
  relNotation: 'crowsfoot',
  setRelNotation: (notation) => set({ relNotation: notation }),
};
});
