import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Ler o conteúdo do pdfDb.ts
const dbPath = new URL('../packages/server/db/pdfDb.ts', import.meta.url);
const dbContent = readFileSync(dbPath, 'utf-8');

// Criar um script de inicialização simplificado
const initScript = `import { open } from 'node:sqlite';\n${dbContent}`;

writeFileSync('dist-electron/init-database.ts', initScript);
console.log('✅ Database module created successfully');
