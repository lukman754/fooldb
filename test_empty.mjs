import { parseSqlSchema } from './lib/parser/sqlParser.ts';
import { computeLayout } from './lib/layout/elkLayout.ts';
import { generateDrawioXml } from './lib/xml/drawioGenerator.ts';

const testSql = ``;

const schema = parseSqlSchema(testSql);
console.log('Tables:', schema.tables.length);
const layout = await computeLayout(schema);
console.log('Layout nodes:', layout.nodes.length);
const xml = generateDrawioXml(layout);
console.log(xml.substring(0, 800));