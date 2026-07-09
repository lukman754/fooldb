import { parseSqlSchema } from '../lib/parser/sqlParser';
import { computeLayout } from '../lib/layout/elkLayout';

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

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE user_roles (
  user_id INT,
  role_id INT,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);
`;

async function run() {
  const schema = parseSqlSchema(testSql);
  console.log('Parsed schema. Computing layout...');
  const layout = await computeLayout(schema);
  console.log('--- LAYOUT RESULT ---');
  console.log(`Canvas Size: ${layout.width} x ${layout.height}`);
  console.log('Nodes (Tables):');
  layout.nodes.forEach(n => {
    console.log(`  - ${n.id}: position=(${n.x.toFixed(1)}, ${n.y.toFixed(1)}), size=${n.width}x${n.height}`);
  });
  console.log('Edges (Relationships):');
  layout.edges.forEach(e => {
    console.log(`  - ${e.id} (${e.sourceTable} -> ${e.targetTable}):`);
    console.log(`    Points: ${e.points.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' -> ')}`);
  });
}

run().catch(console.error);
