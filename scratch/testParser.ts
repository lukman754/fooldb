import { parseSqlSchema } from '../lib/parser/sqlParser';

const testSql = `
-- Create users table
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active' COMMENT 'User account status',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

/* Create profiles table
   with 1:1 relationship to users
*/
CREATE TABLE profiles (
  user_id INT PRIMARY KEY,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  bio TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create roles table
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

-- Create junction table for many-to-many
CREATE TABLE user_roles (
  user_id INT,
  role_id INT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Add some other tables to test ALTER TABLE
CREATE TABLE products (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  price DECIMAL(10,2) DEFAULT 0.00
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT,
  product_id INT,
  ordered_at DATETIME
);

ALTER TABLE orders ADD FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE orders ADD CONSTRAINT fk_order_product FOREIGN KEY (product_id) REFERENCES products(id);
`;

const schema = parseSqlSchema(testSql);
console.log('--- TABLES ---');
schema.tables.forEach(t => {
  console.log(`Table: ${t.name} (Junction: ${t.isJunctionTable ? 'YES' : 'NO'})`);
  console.log(`  PK: ${t.primaryKey.join(', ')}`);
  console.log('  Columns:');
  t.columns.forEach(c => {
    console.log(`    - ${c.name} : ${c.type} (Nullable: ${c.isNullable}, AutoInc: ${c.isAutoIncrement}, Default: ${c.defaultValue}, Enum: ${c.enumValues ? JSON.stringify(c.enumValues) : 'N/A'}, Comment: ${c.comment || ''})`);
  });
  console.log('  Foreign Keys:');
  t.foreignKeys.forEach(fk => {
    console.log(`    - (${fk.columns.join(', ')}) -> ${fk.referencedTable} (${fk.referencedColumns.join(', ')})`);
  });
  console.log('');
});

console.log('--- RELATIONSHIPS ---');
schema.relationships.forEach(r => {
  console.log(`${r.sourceTable} (${r.sourceColumns.join(', ')}) --[${r.type}]--> ${r.targetTable} (${r.targetColumns.join(', ')})`);
});
