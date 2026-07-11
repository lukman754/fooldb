"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDbStore } from "@/store/dbStore";
import { Column } from "@/types";
import { visualSchemaToSql } from "@/lib/parser/visualToSql";
import {
  Plus,
  Trash2,
  Check,
  X,
  Link,
  Unlink,
  Code,
  Copy,
  ChevronDown,
  ChevronUp,
  Database,
} from "lucide-react";

const COLUMN_TYPES = [
  "INT",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "VARCHAR(255)",
  "VARCHAR(100)",
  "CHAR(36)",
  "TEXT",
  "MEDIUMTEXT",
  "LONGTEXT",
  "BOOLEAN",
  "TINYINT(1)",
  "DECIMAL(10,2)",
  "FLOAT",
  "DOUBLE",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
  "JSON",
];

// ────────────────────────────────────────────────
// Inline Editable Label
// ────────────────────────────────────────────────
function InlineEdit({
  value,
  onCommit,
  className = "",
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onCommit(draft.trim());
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs outline-none text-zinc-100 w-full ${className}`}
      />
    );
  }

  return (
    <span
      className={`cursor-pointer hover:text-blue-400 transition-colors ${className}`}
      onDoubleClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Double-click to rename"
    >
      {value}
    </span>
  );
}

// ────────────────────────────────────────────────
// Column Row
// ────────────────────────────────────────────────
function ColumnRow({
  col,
  onUpdate,
  onRemove,
  isLocked,
  autoFocus = false,
}: {
  tableName: string;
  col: Column;
  onUpdate: (patch: Partial<Column>) => void;
  onRemove: () => void;
  isLocked: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Local state for the name input — avoids losing focus on every keystroke
  const [localName, setLocalName] = useState(col.name);
  // Sync if col.name changes externally (e.g. FK rename from store)
  useEffect(() => {
    setLocalName(col.name);
  }, [col.name]);

  // Auto-focus & select-all when this row is newly created
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  const commitName = useCallback(() => {
    const trimmed = localName.trim();
    if (trimmed && trimmed !== col.name) onUpdate({ name: trimmed });
    else setLocalName(col.name); // revert if empty
  }, [localName, col.name, onUpdate]);

  return (
    <div className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors">
      {/* Name — local state, sync on blur/Enter */}
      <input
        ref={inputRef}
        value={localName}
        onChange={(e) => {
          const nextValue = e.target.value;
          const nextName = nextValue.trim();
          setLocalName(nextValue);

          // Keep the schema and preview synchronized as the user types.
          // Empty names stay local until blur, where they revert to the last valid name.
          if (nextName && nextName !== col.name) onUpdate({ name: nextName });
        }}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        disabled={isLocked}
        placeholder="col_name"
        className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-300 border-b border-transparent hover:border-zinc-600 focus:border-blue-500 outline-none py-0.5 disabled:cursor-not-allowed disabled:opacity-60 font-mono"
      />

      {/* Type — instant update (click, no focus issue) */}
      <select
        value={col.type}
        onChange={(e) => onUpdate({ type: e.target.value })}
        disabled={isLocked}
        className="bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 px-1 py-0.5 outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed max-w-[110px]"
      >
        {COLUMN_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {/* Toggles — instant update (click, no focus issue) */}
      <div className="flex items-center gap-1">
        {(["isPrimaryKey", "isNullable", "isUnique"] as const).map((flag) => {
          const labels = {
            isPrimaryKey: "PK",
            isNullable: "NN",
            isUnique: "UQ",
          };
          const active = flag === "isNullable" ? !col[flag] : col[flag]; // NN = inverse of isNullable
          const activeColor =
            flag === "isPrimaryKey"
              ? "bg-yellow-500/20 text-yellow-400 border-yellow-600/40"
              : flag === "isUnique"
                ? "bg-purple-500/20 text-purple-400 border-purple-600/40"
                : "bg-sky-500/20 text-sky-400 border-sky-600/40";
          return (
            <button
              key={flag}
              disabled={isLocked}
              onClick={() => {
                if (flag === "isNullable")
                  onUpdate({ isNullable: !col.isNullable });
                else onUpdate({ [flag]: !col[flag] } as Partial<Column>);
              }}
              className={`rounded border px-1 py-0.5 text-[9px] font-bold transition-colors disabled:cursor-not-allowed ${
                active
                  ? activeColor
                  : "bg-transparent border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400"
              }`}
              title={
                flag === "isPrimaryKey"
                  ? "Primary Key"
                  : flag === "isNullable"
                    ? "Not Null"
                    : "Unique"
              }
            >
              {labels[flag]}
            </button>
          );
        })}
      </div>

      {/* Delete */}
      {!isLocked && (
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 ml-0.5 text-zinc-600 hover:text-red-400 transition-all"
          title="Remove column"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      {isLocked && <div className="w-3" />}
    </div>
  );
}

// ────────────────────────────────────────────────
// Table Card
// ────────────────────────────────────────────────
function TableCard({
  tableName,
  onAddTable,
  isFkMenuOpen,
  onToggleFkMenu,
}: {
  tableName: string;
  onAddTable: () => void;
  isFkMenuOpen: boolean;
  onToggleFkMenu: () => void;
}) {
  const {
    visualSchema,
    renameVisualTable,
    removeVisualTable,
    addVisualColumn,
    removeVisualColumn,
    updateVisualColumn,
    addVisualFK,
    removeVisualRelation,
    updateVisualRelationCardinality,
  } = useDbStore();

  const [collapsed, setCollapsed] = useState(false);
  // Track name of the most recently added column to auto-focus its input
  const [justAddedColName, setJustAddedColName] = useState<string | null>(null);

  const table = visualSchema.tables.find((t) => t.name === tableName);
  if (!table) return null;

  const tableRelations = visualSchema.relationships.filter(
    (r) => r.sourceTable === tableName,
  );
  const fkTargets = visualSchema.tables
    .filter(
      (t) =>
        t.name !== tableName &&
        !tableRelations.some((r) => r.targetTable === t.name),
    )
    .map((t) => t.name);

  const handleAddColumn = () => {
    // Generate unique name (column, column_2, column_3, ...)
    const existingNames = new Set(table.columns.map((c) => c.name));
    let newName = "column";
    let counter = 2;
    while (existingNames.has(newName)) newName = `column_${counter++}`;

    const newCol: Column = {
      name: newName,
      type: "VARCHAR(255)",
      isPrimaryKey: false,
      isNullable: true,
      isUnique: false,
      isAutoIncrement: false,
      defaultValue: null,
      enumValues: null,
    };
    addVisualColumn(tableName, newCol);
    setJustAddedColName(newName);
  };

  return (
    <div
      className={`relative rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur shadow-md overflow-visible ${isFkMenuOpen ? "z-40" : "z-0"}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border-b border-zinc-800">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-600/80">
          <Database className="h-3 w-3 text-white" />
        </div>

        <InlineEdit
          value={tableName}
          onCommit={(newName) => renameVisualTable(tableName, newName)}
          className="flex-1 font-semibold text-xs text-zinc-100"
        />

        <div className="flex items-center gap-1 ml-auto">
          {/* Relations badge */}
          {tableRelations.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-900/50 text-blue-400 border border-blue-800/50">
              {tableRelations.length} FK
            </span>
          )}

          {/* FK relation button */}
          {fkTargets.length > 0 && (
            <div className="relative">
              <button
                onClick={() => onToggleFkMenu()}
                className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-blue-400 hover:border-blue-700 transition-colors"
                title="Add Foreign Key relation"
              >
                <Link className="h-3 w-3" />
                FK
              </button>
              {isFkMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={onToggleFkMenu}
                  />
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-lg z-50">
                    <div className="px-2 py-1 text-[10px] text-zinc-500 font-medium">
                      References table →
                    </div>
                    {fkTargets.map((target) => (
                      <button
                        key={target}
                        onClick={() => {
                          addVisualFK(tableName, target);
                          onToggleFkMenu();
                        }}
                        className="w-full text-left rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                      >
                        {target}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Collapse */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Delete table */}
          <button
            onClick={() => removeVisualTable(tableName)}
            className="p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors"
            title="Remove table"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div>
          {/* Columns */}
          <div className="py-1">
            {table.columns.map((col, index) => {
              const isFkCol = table.foreignKeys.some((fk) =>
                fk.columns.includes(col.name),
              );
              return (
                <ColumnRow
                  key={`${tableName}-column-${index}`}
                  tableName={tableName}
                  col={col}
                  onUpdate={(patch) =>
                    updateVisualColumn(tableName, col.name, patch)
                  }
                  onRemove={() => removeVisualColumn(tableName, col.name)}
                  isLocked={isFkCol}
                  autoFocus={col.name === justAddedColName}
                />
              );
            })}
          </div>

          {/* Add buttons */}
          <div className="grid grid-cols-2 gap-2 px-2 pb-2">
            <button
              onClick={handleAddColumn}
              className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 py-1 text-[10px] text-zinc-500 hover:border-blue-600 hover:text-blue-400 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add Column
            </button>
            <button
              onClick={onAddTable}
              className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 py-1 text-[10px] text-zinc-500 hover:border-blue-600 hover:text-blue-400 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add Table
            </button>
          </div>

          {/* Active Relations */}
          {tableRelations.length > 0 && (
            <div className="border-t border-zinc-800 px-2 py-1.5">
              <div className="text-[9px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">
                Relations
              </div>
              {tableRelations.map((rel) => (
                <div
                  key={rel.id}
                  className="flex items-center gap-1.5 text-[10px] text-zinc-400 py-0.5 group"
                >
                  <Link className="h-3 w-3 text-blue-500 shrink-0" />
                  <span className="font-mono">{rel.sourceColumns[0]}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="font-semibold text-zinc-300">
                    {rel.targetTable}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <select
                      value={rel.sourceCardinality ?? "one"}
                      onChange={(e) =>
                        updateVisualRelationCardinality(
                          rel.id,
                          e.target.value as "one" | "many",
                          rel.targetCardinality ??
                            (rel.type === "1:1" ? "one" : "many"),
                        )
                      }
                      className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-zinc-400 outline-none focus:border-blue-500"
                      title={`Cardinality for ${rel.sourceTable}`}
                    >
                      <option value="one">1</option>
                      <option value="many">N</option>
                    </select>
                    <select
                      value={
                        rel.targetCardinality ??
                        (rel.type === "1:1" ? "one" : "many")
                      }
                      onChange={(e) =>
                        updateVisualRelationCardinality(
                          rel.id,
                          rel.sourceCardinality ?? "one",
                          e.target.value as "one" | "many",
                        )
                      }
                      className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-zinc-400 outline-none focus:border-blue-500"
                      title={`Cardinality for ${rel.targetTable}`}
                    >
                      <option value="one">1</option>
                      <option value="many">N</option>
                    </select>
                  </div>
                  <button
                    onClick={() => removeVisualRelation(rel.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                    title="Remove relation"
                  >
                    <Unlink className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// SQL Export Modal
// ────────────────────────────────────────────────
function SqlExportModal({
  sql,
  onClose,
}: {
  sql: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[640px] max-h-[80vh] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-zinc-100">
              Export SQL DDL
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                copied
                  ? "bg-green-700 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* SQL Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">
            {sql}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Main VisualEditor Panel
// ────────────────────────────────────────────────
export default function VisualEditor() {
  const { visualSchema, addVisualTable } = useDbStore();
  const [newTableName, setNewTableName] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [openFkTable, setOpenFkTable] = useState<string | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddInput) inputRef.current?.focus();
  }, [showAddInput]);

  const handleAddTable = () => {
    if (newTableName.trim()) {
      addVisualTable(newTableName.trim());
      setNewTableName("");
      setShowAddInput(false);
    }
  };

  const sqlOutput = visualSchemaToSql(visualSchema);

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5 bg-zinc-950 shrink-0">
        <div className="flex-1">
          <span className="text-xs font-semibold text-zinc-300">
            ERD / LRS Builder
          </span>
          <span className="ml-2 text-[10px] text-zinc-600">
            {visualSchema.tables.length} table
            {visualSchema.tables.length !== 1 ? "s" : ""}
            {" · "}
            {visualSchema.relationships.length} relation
            {visualSchema.relationships.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Export SQL */}
        {visualSchema.tables.length > 0 && (
          <button
            onClick={() => setShowSqlModal(true)}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <Code className="h-3 w-3 text-blue-400" />
            Export SQL
          </button>
        )}

        {/* Add Table */}
        <button
          onClick={() => setShowAddInput(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Table
        </button>
      </div>

      {/* Add Table Input */}
      {showAddInput && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 bg-blue-950/20 shrink-0">
          <Database className="h-4 w-4 text-blue-400 shrink-0" />
          <input
            ref={inputRef}
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTable();
              if (e.key === "Escape") {
                setShowAddInput(false);
                setNewTableName("");
              }
            }}
            placeholder="table_name (Enter to confirm)"
            className="flex-1 bg-transparent text-xs text-zinc-100 border-b border-blue-500 outline-none py-0.5 placeholder-zinc-600"
          />
          <button
            onClick={handleAddTable}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setShowAddInput(false);
              setNewTableName("");
            }}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table List */}
      <div className="scrollbar-minimal flex-1 overflow-y-auto p-3 space-y-3">
        {visualSchema.tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
              <Database className="h-8 w-8 text-zinc-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-400">
                No tables yet
              </p>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                Click <strong className="text-zinc-400">+ Add Table</strong> to
                start building your ERD visually — no SQL needed!
              </p>
            </div>
            <button
              onClick={() => setShowAddInput(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create First Table
            </button>
          </div>
        ) : (
          visualSchema.tables.map((table) => (
            <TableCard
              key={table.name}
              tableName={table.name}
              onAddTable={() => setShowAddInput(true)}
              isFkMenuOpen={openFkTable === table.name}
              onToggleFkMenu={() =>
                setOpenFkTable((current) =>
                  current === table.name ? null : table.name,
                )
              }
            />
          ))
        )}
      </div>

      {/* SQL Export Modal */}
      {showSqlModal && (
        <SqlExportModal
          sql={sqlOutput}
          onClose={() => setShowSqlModal(false)}
        />
      )}
    </div>
  );
}
