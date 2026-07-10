/**
 * Schema Validation Tests — Regressão Crítica
 * 
 * Valida que o código-fonte NÃO usa nomes de coluna incorretos
 * para a tabela cash_entries. Descoberta via REST API:
 *   - cash_register_id ✅ (coluna real no PostgreSQL)
 *   - register_id ❌ (PGRST204: coluna inexistente)
 *   - store_id ✅ (coluna real no PostgreSQL)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../');

// Recursively collect .tsx and .ts files from src, excluding test files and node_modules
function collectSourceFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'node_modules') continue;
      collectSourceFiles(fullPath, files);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes('.test.')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Schema Validation — cash_entries column names', () => {
  const sourceFiles = collectSourceFiles(SRC_DIR);

  it('should find source files to validate', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('should NOT use "register_id" (wrong column) in cash_entries operations', () => {
    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const file of sourceFiles) {
      // Skip the types.ts file — it's auto-generated and known to be wrong
      if (file.includes('types.ts')) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for direct usage of register_id in the context of cash_entries
        // Pattern: .eq("register_id" or register_id: registerId (in an insert near cash_entries)
        if (
          (line.includes('.eq("register_id"') || line.includes(".eq('register_id'")) &&
          !line.includes('cash_register_id')
        ) {
          // Check if the surrounding context mentions cash_entries
          const context = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
          if (context.includes('cash_entries')) {
            violations.push({
              file: path.relative(SRC_DIR, file),
              line: i + 1,
              content: line.trim(),
            });
          }
        }
        // Also check insert payloads: register_id: someVar (without cash_ prefix)
        if (
          /^\s*register_id\s*:/.test(line) &&
          !line.includes('cash_register_id')
        ) {
          const context = lines.slice(Math.max(0, i - 10), i + 1).join('\n');
          if (context.includes('cash_entries')) {
            violations.push({
              file: path.relative(SRC_DIR, file),
              line: i + 1,
              content: line.trim(),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.content}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} file(s) using incorrect column name "register_id" for cash_entries:\n${report}\n\n` +
        `The correct column name is "cash_register_id". The types.ts is known to be wrong.`
      );
    }
  });

  it('should use "cash_register_id" (correct column) in Caixa.tsx', () => {
    const caixaFile = sourceFiles.find((f) => f.endsWith('Caixa.tsx'));
    expect(caixaFile).toBeDefined();

    const content = fs.readFileSync(caixaFile!, 'utf-8');
    const hasCashRegisterId = content.includes('cash_register_id');
    expect(hasCashRegisterId).toBe(true);
  });

  it('should use "cash_register_id" (correct column) in Vendas.tsx', () => {
    const vendasFile = sourceFiles.find((f) => f.endsWith('Vendas.tsx'));
    expect(vendasFile).toBeDefined();

    const content = fs.readFileSync(vendasFile!, 'utf-8');
    const hasCashRegisterId = content.includes('cash_register_id');
    expect(hasCashRegisterId).toBe(true);
  });

  it('should use "cash_register_id" in OrdensServico.tsx', () => {
    const osFile = sourceFiles.find((f) => f.endsWith('OrdensServico.tsx'));
    expect(osFile).toBeDefined();

    const content = fs.readFileSync(osFile!, 'utf-8');
    const hasCashRegisterId = content.includes('cash_register_id');
    expect(hasCashRegisterId).toBe(true);
  });

  it('should use "cash_register_id" in Relatorios.tsx', () => {
    const relFile = sourceFiles.find((f) => f.endsWith('Relatorios.tsx'));
    expect(relFile).toBeDefined();

    const content = fs.readFileSync(relFile!, 'utf-8');
    const hasCashRegisterId = content.includes('cash_register_id');
    expect(hasCashRegisterId).toBe(true);
  });

  it('should use "cash_register_id" in Estoque.tsx', () => {
    const estoqueFile = sourceFiles.find((f) => f.endsWith('Estoque.tsx'));
    expect(estoqueFile).toBeDefined();

    const content = fs.readFileSync(estoqueFile!, 'utf-8');
    const hasCashRegisterId = content.includes('cash_register_id');
    expect(hasCashRegisterId).toBe(true);
  });

  it('should use "cash_register_id" in DeviceRepairModal.tsx', () => {
    const drmFile = sourceFiles.find((f) => f.endsWith('DeviceRepairModal.tsx'));
    expect(drmFile).toBeDefined();

    const content = fs.readFileSync(drmFile!, 'utf-8');
    const hasCashRegisterId = content.includes('cash_register_id');
    expect(hasCashRegisterId).toBe(true);
  });

  it('should use "cash_register_id" in OsParts.tsx', () => {
    const osPartsFile = sourceFiles.find((f) => f.endsWith('OsParts.tsx'));
    expect(osPartsFile).toBeDefined();

    const content = fs.readFileSync(osPartsFile!, 'utf-8');
    const hasCashRegisterId = content.includes('cash_register_id');
    expect(hasCashRegisterId).toBe(true);
  });
});

describe('Schema Validation — types.ts discrepancy detection', () => {
  it('should document that types.ts uses register_id (known wrong)', () => {
    const typesFile = path.join(SRC_DIR, 'integrations', 'supabase', 'types.ts');
    const content = fs.readFileSync(typesFile, 'utf-8');
    
    // This test documents the known discrepancy
    const hasWrongName = content.includes('register_id') && 
                          content.includes('cash_entries_register_id_fkey');
    
    // If this assertion fails, it means types.ts was regenerated/fixed — update this test
    expect(hasWrongName).toBe(true);
    // Log warning for visibility
    console.warn(
      '⚠️  types.ts declares "register_id" but the real DB column is "cash_register_id". ' +
      'This is a known discrepancy. The code correctly uses "cash_register_id" via "as any" casts.'
    );
  });
});
