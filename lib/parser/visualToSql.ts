import { DatabaseSchema } from '@/types';

/**
 * Converts a visual DatabaseSchema into a SQL DDL string.
 */
export function visualSchemaToSql(schema: DatabaseSchema): string {
  const parts: string[] = [];

  for (const table of schema.tables) {
    const colDefs: string[] = [];

    for (const col of table.columns) {
      let def = `  \`${col.name}\` ${col.type}`;
      if (col.isAutoIncrement) def += ' AUTO_INCREMENT';
      if (!col.isNullable) def += ' NOT NULL';
      if (col.isUnique && !col.isPrimaryKey) def += ' UNIQUE';
      if (col.defaultValue !== null) def += ` DEFAULT ${col.defaultValue}`;
      colDefs.push(def);
    }

    if (table.primaryKey.length > 0) {
      colDefs.push(`  PRIMARY KEY (${table.primaryKey.map(k => `\`${k}\``).join(', ')})`);
    }

    for (const fk of table.foreignKeys) {
      const cols = fk.columns.map(c => `\`${c}\``).join(', ');
      const refCols = fk.referencedColumns.map(c => `\`${c}\``).join(', ');
      colDefs.push(
        `  FOREIGN KEY (${cols}) REFERENCES \`${fk.referencedTable}\` (${refCols})`
      );
    }

    parts.push(
      `CREATE TABLE \`${table.name}\` (\n${colDefs.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  }

  return parts.join('\n\n');
}
