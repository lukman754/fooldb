import { parseSqlSchema } from '../lib/parser/sqlParser';
import { computeLayout } from '../lib/layout/elkLayout';
import { generateDrawioXml } from '../lib/xml/drawioGenerator';

const testSql = `
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE profiles (
  user_id INT PRIMARY KEY,
  first_name VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES users (id)
);
`;

async function run() {
  const schema = parseSqlSchema(testSql);
  const layout = await computeLayout(schema);
  const xml = generateDrawioXml(layout);
  console.log('--- GENERATED DRAW.IO XML ---');
  console.log(xml.substring(0, 1500)); // Print first 1500 chars to verify
  console.log('...\n[XML content truncated for display]');
}

run().catch(console.error);
