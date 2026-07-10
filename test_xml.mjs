import { parseSqlSchema } from './lib/parser/sqlParser.ts';
import { computeLayout } from './lib/layout/elkLayout.ts';
import { generateDrawioXml } from './lib/xml/drawioGenerator.ts';

const testSql = `
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE profiles (
  user_id INT PRIMARY KEY,
  first_name VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES users (id)
);
`;

const schema = parseSqlSchema(testSql);
const layout = await computeLayout(schema);
const xml = generateDrawioXml(layout);
console.log(xml.substring(0, 500));
console.log('---');
console.log('Root element starts with:', xml.trim().substring(0, 50));