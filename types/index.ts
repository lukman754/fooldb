export interface Column {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  isAutoIncrement: boolean;
  enumValues: string[] | null;
  comment?: string;
}

export interface ForeignKeyConstraint {
  constraintName?: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  verb?: string;
}

export interface Table {
  name: string;
  columns: Column[];
  primaryKey: string[];
  foreignKeys: ForeignKeyConstraint[];
  uniqueKeys: string[][];
  comment?: string;
  isJunctionTable?: boolean;
}

export interface Relationship {
  id: string;
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
  type: '1:1' | '1:N' | 'M:N';
  sourceCardinality?: 'one' | 'many';
  targetCardinality?: 'one' | 'many';
  verb?: string;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  table: Table;
}

export interface LayoutEdgePoint {
  x: number;
  y: number;
}

export interface LayoutEdge {
  id: string;
  relationship: Relationship;
  points: LayoutEdgePoint[];
  sourceTable: string;
  targetTable: string;
}

export interface LayoutData {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export interface DatabaseSchema {
  tables: Table[];
  relationships: Relationship[];
}

// UML Use Case Interfaces
export interface UseCaseActor {
  side?: 'left' | 'right';
  id: string;
  name: string;
}

export interface UseCaseNode {
  id: string;
  name: string;
}

export interface UseCaseSystem {
  name: string;
  usecaseIds: string[];
}

export interface UseCaseConnection {
  label?: string;
  id: string;
  from: string;
  to: string;
}

export interface UseCaseDiagram {
  actors: UseCaseActor[];
  usecases: UseCaseNode[];
  systems: UseCaseSystem[];
  connections: UseCaseConnection[];
}

// UML Activity Interfaces
export interface ActivityNode {
  id: string;
  label: string;
  type: 'start' | 'end' | 'action' | 'decision';
}

export interface ActivityEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ActivityDiagram {
  nodes: ActivityNode[];
  edges: ActivityEdge[];
}

export interface ActivitySwimlane {
  id: string;
  name: string;
}

export interface ActivityFormNode {
  id: string;
  type: 'start' | 'end' | 'action' | 'decision' | 'fork' | 'join';
  label: string;
  swimlaneId: string;
  nextIds: string[]; // For basic next steps or forks
  branches: { condition: string; targetId: string }[]; // For decisions
}

export interface ActivityFormData {
  name: string;
  swimlanes: ActivitySwimlane[];
  nodes: ActivityFormNode[];
}

// UML Sequence Interfaces
export interface SequenceParticipant {
  id: string;
  name: string;
}

export interface SequenceMessage {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface SequenceDiagram {
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
}

export interface ActivityLayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  type: 'start' | 'end' | 'action' | 'decision';
}

export interface ActivityLayoutEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  points: { x: number; y: number }[];
}

export interface ActivityLayoutData {
  width: number;
  height: number;
  nodes: ActivityLayoutNode[];
  edges: ActivityLayoutEdge[];
}
