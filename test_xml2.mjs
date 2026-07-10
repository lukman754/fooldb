import { parseSqlSchema } from './lib/parser/sqlParser.ts';
import { computeLayout } from './lib/layout/elkLayout.ts';
import { generateDrawioXml } from './lib/xml/drawioGenerator.ts';

const testSql = `
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100)
);
`;

const schema = parseSqlSchema(testSql);
console.log('Tables:', schema.tables.length);
for (const t of schema.tables) {
  for (const c of t.columns) {
    console.log(`  ${t.name}.${c.name}: isPrimaryKey=${c.isPrimaryKey}`);
  }
}
const layout = await computeLayout(schema);
console.log('Layout nodes:', layout.nodes.length);
const xml = generateDrawioXml(layout);
// Find the PK attribute cell
const lines = xml.split('\n');
for (const line of lines) {
  if (line.includes('id') && line.includes('fontStyle=6')) {
    console.log('PK cell:', line.trim());
  }
}