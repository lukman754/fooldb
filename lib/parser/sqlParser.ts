import { Table, Column, Relationship, DatabaseSchema } from '@/types';

// Helper to strip backticks from identifiers while preserving them in quotes
function stripBackticks(sql: string): string {
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'" && (i === 0 || sql[i - 1] !== '\\')) {
      if (!inDoubleQuote) inSingleQuote = !inSingleQuote;
    } else if (char === '"' && (i === 0 || sql[i - 1] !== '\\')) {
      if (!inSingleQuote) inDoubleQuote = !inDoubleQuote;
    }

    if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      continue;
    }
    result += char;
  }
  return result;
}

// Helper to split a block by commas only at parenthesis depth 0
function splitByCommaAtDepth0(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === "'" && (i === 0 || text[i - 1] !== '\\')) {
      if (!inDoubleQuote) inSingleQuote = !inSingleQuote;
    } else if (char === '"' && (i === 0 || text[i - 1] !== '\\')) {
      if (!inSingleQuote) inDoubleQuote = !inDoubleQuote;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      }

      if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

// Clean comments from SQL
export function cleanSqlComments(sql: string): string {
  // Remove block comments /* ... */
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove single line comments starting with -- or #
  cleaned = cleaned.replace(/(?:--|#).*$/gm, ' ');
  return cleaned;
}

// Split SQL into individual statements
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (char === "'" && (i === 0 || sql[i - 1] !== '\\')) {
      if (!inDoubleQuote) inSingleQuote = !inSingleQuote;
    } else if (char === '"' && (i === 0 || sql[i - 1] !== '\\')) {
      if (!inSingleQuote) inDoubleQuote = !inDoubleQuote;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

export function parseSqlSchema(sql: string): DatabaseSchema {
  const fkVerbMap: Record<string, string> = {};
  let currentTableForComments = '';
  const lines = sql.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const createMatch = trimmed.match(/^CREATE\s+TABLE\s+(\w+)/i);
    if (createMatch) {
      currentTableForComments = createMatch[1];
    }

    if (/FOREIGN\s+KEY/i.test(trimmed) && (trimmed.includes('--') || trimmed.includes('#'))) {
      const fkMatch = trimmed.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s*(\w+)/i);
      if (fkMatch) {
        const colsKey = fkMatch[1].split(',').map(c => c.trim().toLowerCase()).join(',');
        const commentPart = trimmed.includes('--') ? trimmed.split('--')[1] : trimmed.split('#')[1];
        let verb = commentPart.trim();
        if (verb.toLowerCase().startsWith('relation:')) {
          verb = verb.substring(9).trim();
        }
        if (verb) {
          const mapKey = `${currentTableForComments.toLowerCase()}.${colsKey}`;
          fkVerbMap[mapKey] = verb;
        }
      }
    }

    if (/ALTER\s+TABLE/i.test(trimmed) && (trimmed.includes('--') || trimmed.includes('#'))) {
      const alterMatch = trimmed.match(/^ALTER\s+TABLE\s+(\w+)/i);
      const fkMatch = trimmed.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s*(\w+)/i);
      if (alterMatch && fkMatch) {
        const table = alterMatch[1];
        const colsKey = fkMatch[1].split(',').map(c => c.trim().toLowerCase()).join(',');
        const commentPart = trimmed.includes('--') ? trimmed.split('--')[1] : trimmed.split('#')[1];
        let verb = commentPart.trim();
        if (verb.toLowerCase().startsWith('relation:')) {
          verb = verb.substring(9).trim();
        }
        if (verb) {
          const mapKey = `${table.toLowerCase()}.${colsKey}`;
          fkVerbMap[mapKey] = verb;
        }
      }
    }
  }

  const cleanedSql = cleanSqlComments(sql);
  const normalizedSql = stripBackticks(cleanedSql);
  const statements = splitSqlStatements(normalizedSql);

  const tables: Table[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    // Handle CREATE TABLE
    if (/^CREATE\s+TABLE/i.test(trimmed)) {
      const startIdx = trimmed.indexOf('(');
      if (startIdx === -1) continue;

      let depth = 1;
      let endIdx = -1;

      for (let i = startIdx + 1; i < trimmed.length; i++) {
        const char = trimmed[i];
        if (char === '(') depth++;
        else if (char === ')') {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }

      if (endIdx === -1) continue;

      const header = trimmed.substring(0, startIdx);
      const body = trimmed.substring(startIdx + 1, endIdx);

      const nameMatch = header.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+(?:\.\w+)?)/i);
      if (!nameMatch) continue;

      // In case of schema name like "public.users", strip the schema prefix
      let tableName = nameMatch[1];
      if (tableName.includes('.')) {
        tableName = tableName.split('.').pop() || tableName;
      }

      const table: Table = {
        name: tableName,
        columns: [],
        primaryKey: [],
        foreignKeys: [],
        uniqueKeys: [],
      };

      const definitions = splitByCommaAtDepth0(body);

      for (const def of definitions) {
        const d = def.trim();
        if (!d) continue;

        // 1. Check for PRIMARY KEY table constraint (with optional CONSTRAINT name prefix)
        if (/^(?:CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY/i.test(d)) {
          const match = d.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
          if (match) {
            const cols = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
            table.primaryKey.push(...cols);
          }
          continue;
        }

        // 2. Check for FOREIGN KEY table constraint
        if (/FOREIGN\s+KEY/i.test(d)) {
          const match = d.match(/(?:CONSTRAINT\s+(\w+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s*(\w+(?:\.\w+)?)\s*\(([^)]+)\)/i);
          if (match) {
            const constraintName = match[1] || undefined;
            const columns = match[2].split(',').map(c => c.trim());
            let referencedTable = match[3];
            if (referencedTable.includes('.')) {
              referencedTable = referencedTable.split('.').pop() || referencedTable;
            }
            const referencedColumns = match[4].split(',').map(c => c.trim());

            // Look up verb from inline comment map
            const colsKey = columns.map(c => c.toLowerCase()).join(',');
            const mapKey = `${table.name.toLowerCase()}.${colsKey}`;
            let verb = fkVerbMap[mapKey];

            if (!verb) {
              const commentMatch = d.match(/COMMENT\s+'([^'\\]*)'/i) || d.match(/COMMENT\s+"([^"\\]*)"/i);
              if (commentMatch) {
                verb = commentMatch[1].trim();
              }
            }

            table.foreignKeys.push({
              constraintName,
              columns,
              referencedTable,
              referencedColumns,
              verb,
            });
          }
          continue;
        }

        // 3. Check for UNIQUE KEY table constraint
        if (/^UNIQUE/i.test(d)) {
          const match = d.match(/UNIQUE\s+(?:KEY|INDEX)?\s*(?:\w+\s*)?\(([^)]+)\)/i);
          if (match) {
            const cols = match[1].split(',').map(c => c.trim());
            table.uniqueKeys.push(cols);
          }
          continue;
        }

        // 4. Ignore other keys/indexes (e.g., KEY index_name (col))
        if (/^(?:KEY|INDEX|CONSTRAINT)/i.test(d)) {
          continue;
        }

        // 5. It must be a Column definition
        const colNameMatch = d.match(/^(\w+)/);
        if (!colNameMatch) continue;

        const colName = colNameMatch[1];
        const rest = d.substring(colNameMatch[0].length).trim();

        // Extract type
        const typeMatch = rest.match(/^(\w+(?:\s*\([^)]+\))?)/);
        if (!typeMatch) continue;

        const type = typeMatch[1];
        const restOfColumn = rest.substring(typeMatch[0].length).trim();

        const isPrimaryKey = /PRIMARY\s+KEY/i.test(restOfColumn);
        const isNullable = !/NOT\s+NULL/i.test(restOfColumn);
        const isUnique = /UNIQUE/i.test(restOfColumn);
        const isAutoIncrement = /AUTO_INCREMENT/i.test(restOfColumn);

        // Parse default value
        let defaultValue: string | null = null;
        const defaultMatch = restOfColumn.match(/DEFAULT\s+('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^\s,]+)/i);
        if (defaultMatch) {
          defaultValue = defaultMatch[1];
          // Strip quotes if any
          if ((defaultValue.startsWith("'") && defaultValue.endsWith("'")) ||
              (defaultValue.startsWith('"') && defaultValue.endsWith('"'))) {
            defaultValue = defaultValue.substring(1, defaultValue.length - 1);
          }
        }

        // Parse ENUM values
        let enumValues: string[] | null = null;
        if (/^ENUM/i.test(type)) {
          const enumMatch = type.match(/ENUM\s*\(([^)]+)\)/i);
          if (enumMatch) {
            enumValues = enumMatch[1]
              .split(',')
              .map(v => {
                const trimmedVal = v.trim();
                if ((trimmedVal.startsWith("'") && trimmedVal.endsWith("'")) ||
                    (trimmedVal.startsWith('"') && trimmedVal.endsWith('"'))) {
                  return trimmedVal.substring(1, trimmedVal.length - 1);
                }
                return trimmedVal;
              });
          }
        }

        // Parse inline foreign key references
        const inlineRefMatch = restOfColumn.match(/REFERENCES\s+(\w+(?:\.\w+)?)\s*\((\w+)\)/i);
        if (inlineRefMatch) {
          let referencedTable = inlineRefMatch[1];
          if (referencedTable.includes('.')) {
            referencedTable = referencedTable.split('.').pop() || referencedTable;
          }
          const referencedColumn = inlineRefMatch[2];

          // Look up inline comment map
          const mapKey = `${table.name.toLowerCase()}.${colName.toLowerCase()}`;
          let verb = fkVerbMap[mapKey];

          if (!verb) {
            const commentMatch = restOfColumn.match(/COMMENT\s+'([^'\\]*)'/i) || restOfColumn.match(/COMMENT\s+"([^"\\]*)"/i);
            if (commentMatch) {
              verb = commentMatch[1].trim();
            }
          }

          table.foreignKeys.push({
            columns: [colName],
            referencedTable,
            referencedColumns: [referencedColumn],
            verb,
          });
        }

        // Parse comments
        let comment: string | undefined;
        const commentMatch = restOfColumn.match(/COMMENT\s+('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/i);
        if (commentMatch) {
          comment = commentMatch[1];
          if ((comment.startsWith("'") && comment.endsWith("'")) ||
              (comment.startsWith('"') && comment.endsWith('"'))) {
            comment = comment.substring(1, comment.length - 1);
          }
        }

        const column: Column = {
          name: colName,
          type,
          isNullable,
          isPrimaryKey,
          isUnique,
          defaultValue,
          isAutoIncrement,
          enumValues,
          comment,
        };

        table.columns.push(column);

        if (isPrimaryKey) {
          table.primaryKey.push(colName);
        }
        if (isUnique) {
          table.uniqueKeys.push([colName]);
        }
      }

      tables.push(table);
    }

    // Handle ALTER TABLE ADD FOREIGN KEY / ADD PRIMARY KEY
    if (/^ALTER\s+TABLE/i.test(trimmed)) {
      const alterMatch = trimmed.match(/^ALTER\s+TABLE\s+(\w+(?:\.\w+)?)/i);
      if (alterMatch) {
        let tableName = alterMatch[1];
        if (tableName.includes('.')) {
          tableName = tableName.split('.').pop() || tableName;
        }
        const table = tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
        if (table) {
          // Handle ALTER TABLE ... ADD PRIMARY KEY
          const pkRegex = /ADD\s+(?:CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
          let pkMatch;
          while ((pkMatch = pkRegex.exec(trimmed)) !== null) {
            const cols = pkMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
            for (const col of cols) {
              if (!table.primaryKey.some(k => k.toLowerCase() === col.toLowerCase())) {
                table.primaryKey.push(col);
              }
            }
          }

          // Handle ALTER TABLE ... ADD FOREIGN KEY
          const fkRegex = /ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s*(\w+(?:\.\w+)?)\s*\(([^)]+)\)/gi;
          let match;
          while ((match = fkRegex.exec(trimmed)) !== null) {
            const columns = match[1].split(',').map(c => c.trim());
            let referencedTable = match[2];
            if (referencedTable.includes('.')) {
              referencedTable = referencedTable.split('.').pop() || referencedTable;
            }
            const referencedColumns = match[3].split(',').map(c => c.trim());

            // Look up inline comment map
            const colsKey = columns.map(c => c.toLowerCase()).join(',');
            const mapKey = `${tableName.toLowerCase()}.${colsKey}`;
            let verb = fkVerbMap[mapKey];

            if (!verb) {
              const stmtSuffix = trimmed.substring(match.index || 0);
              const commentMatch = stmtSuffix.match(/COMMENT\s+'([^'\\]*)'/i) || stmtSuffix.match(/COMMENT\s+"([^"\\]*)"/i);
              if (commentMatch) {
                verb = commentMatch[1].trim();
              }
            }

            // Check if constraint already added to avoid duplicates
            const exists = table.foreignKeys.some(fk => 
              fk.referencedTable.toLowerCase() === referencedTable.toLowerCase() &&
              fk.columns.join(',').toLowerCase() === columns.join(',').toLowerCase()
            );

            if (!exists) {
              table.foreignKeys.push({
                columns,
                referencedTable,
                referencedColumns,
                verb,
              });
            }
          }
        }
      }
    }
  }

  // Final sync: ensure isPrimaryKey flag matches primaryKey arrays for all tables
  for (const table of tables) {
    for (const col of table.columns) {
      if (table.primaryKey.some(pk => pk.toLowerCase() === col.name.toLowerCase())) {
        col.isPrimaryKey = true;
      }
    }
  }

  // Determine Junction Tables
  // A table is a junction table if:
  // 1. It has exactly 2 foreign keys.
  // 2. It has no other columns besides the columns participating in the foreign keys,
  //    or only a few metadata columns (like id, created_at, updated_at).
  for (const table of tables) {
    if (table.foreignKeys.length === 2) {
      const fkCols = new Set<string>();
      for (const fk of table.foreignKeys) {
        for (const col of fk.columns) {
          fkCols.add(col);
        }
      }

      // Check remaining columns
      let isJunction = true;
      for (const col of table.columns) {
        if (fkCols.has(col.name)) continue;
        // Allow typical metadata/PK columns in junction tables
        const lowerName = col.name.toLowerCase();
        if (lowerName === 'id' && col.isPrimaryKey) continue;
        if (lowerName.endsWith('_at') || lowerName.endsWith('_on') || lowerName.endsWith('_by')) continue;
        if (lowerName === 'created_at' || lowerName === 'updated_at' || lowerName === 'deleted_at') continue;
        if (lowerName === 'createdby' || lowerName === 'updatedby') continue;

        // If there's some other domain data column, it's not just a pure junction table
        isJunction = false;
        break;
      }

      if (isJunction) {
        table.isJunctionTable = true;
      }
    }
  }

  // Build relationships
  const relationships: Relationship[] = [];
  let relIdCounter = 1;

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      // Find the referenced table
      const refTable = tables.find(t => t.name.toLowerCase() === fk.referencedTable.toLowerCase());
      if (!refTable) continue;

      // Determine relationship type: 1:1 or 1:N
      // If the FK columns are unique in the current table (meaning they constitute the PK or a Unique constraint)
      let isUniqueFk = false;

      // Check if FK columns match PK exactly
      if (table.primaryKey.length === fk.columns.length) {
        const pkSet = new Set(table.primaryKey.map(k => k.toLowerCase()));
        isUniqueFk = fk.columns.every(c => pkSet.has(c.toLowerCase()));
      }

      // Check if FK columns match any Unique Key exactly
      if (!isUniqueFk) {
        for (const uk of table.uniqueKeys) {
          if (uk.length === fk.columns.length) {
            const ukSet = new Set(uk.map(k => k.toLowerCase()));
            const matches = fk.columns.every(c => ukSet.has(c.toLowerCase()));
            if (matches) {
              isUniqueFk = true;
              break;
            }
          }
        }
      }

      const relationshipType = isUniqueFk ? '1:1' : '1:N';

      relationships.push({
        id: `rel_${relIdCounter++}`,
        sourceTable: refTable.name,
        sourceColumns: fk.referencedColumns,
        targetTable: table.name,
        targetColumns: fk.columns,
        type: relationshipType,
        verb: fk.verb,
      });
    }
  }

  // Post-process relationships for M:N representation
  // If we wanted to merge two 1:N relationships into a single M:N relationship, we can do it.
  // But as decided, we keep the junction table visible and link them. However, we can also flag the type as M:N
  // for the relationships connecting to a junction table, or keep it as 1:N but note the junction status.
  // Keep it as 1:N which represents physical schema accurately.

  return {
    tables,
    relationships,
  };
}
