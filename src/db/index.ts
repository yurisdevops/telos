import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';
import journal from './migrations/meta/_journal.json';

export const expoDb = openDatabaseSync('telos.db', { enableChangeListener: true });

export const db = drizzle(expoDb, { schema });

/**
 * drizzle's useMigrations só pula uma migração se a tabela de bookkeeping
 * `__drizzle_migrations` tiver um registro pra ela — ele não confere o
 * schema real. Se a coluna `nivel` já existir em `exercises` (ex: migração
 * 0006 rodou parcialmente numa tentativa anterior, ou foi aplicada fora do
 * fluxo normal) mas o bookkeeping não sabe disso, o próximo migrate() tenta
 * rodar `ALTER TABLE exercises ADD nivel` de novo e quebra com "duplicate
 * column name" — travando o app na tela de erro pra sempre, já que a
 * transação falha e o bookkeeping nunca é atualizado.
 *
 * Reconcilia os dois antes de rodar qualquer migração: se a coluna já
 * existe mas o bookkeeping está desatualizado, registra a migração 0006
 * como aplicada. Idempotente e não toca em dado nenhum — só bookkeeping.
 */
function reconcileMigrationBookkeeping() {
  const exercisesTable = expoDb.getFirstSync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'exercises'`
  );
  if (!exercisesTable) return;

  const columns = expoDb.getAllSync<{ name: string }>(`PRAGMA table_info(exercises)`);
  const hasNivel = columns.some((column) => column.name === 'nivel');
  if (!hasNivel) return;

  const nivelEntry = journal.entries.find((entry) => entry.tag === '0006_violet_iron_lad');
  if (!nivelEntry) return;

  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const lastMigration = expoDb.getFirstSync<{ created_at: number }>(
    `SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1`
  );
  const alreadyRecorded = lastMigration != null && Number(lastMigration.created_at) >= nivelEntry.when;
  if (alreadyRecorded) return;

  expoDb.runSync(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`, ['', nivelEntry.when]);
}

reconcileMigrationBookkeeping();
