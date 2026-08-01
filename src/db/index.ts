import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';
import journal from './migrations/meta/_journal.json';

export const expoDb = openDatabaseSync('telos.db', { enableChangeListener: true });

export const db = drizzle(expoDb, { schema });

/**
 * drizzle's useMigrations só pula uma migração se a tabela de bookkeeping
 * `__drizzle_migrations` tiver um registro pra ela — ele não confere o
 * schema real. Se uma coluna já existir (ex: a migração rodou parcialmente
 * numa tentativa anterior, ou foi aplicada fora do fluxo normal) mas o
 * bookkeeping não sabe disso, o próximo migrate() tenta rodar o mesmo
 * `ALTER TABLE ... ADD ...` de novo e quebra com "duplicate column name" —
 * travando o app na tela de erro pra sempre, já que a transação falha e o
 * bookkeeping nunca é atualizado.
 *
 * Reconcilia os dois antes de rodar qualquer migração, pra cada
 * {table, column, tag} desta lista: se a coluna já existe mas o bookkeeping
 * está desatualizado, registra a migração correspondente como aplicada.
 * Idempotente e não toca em dado nenhum — só bookkeeping. Um novo caso entra
 * nesta lista sempre que uma migração adicionar coluna a uma tabela já
 * existente. Migração que cria uma tabela nova (`CREATE TABLE`, sem coluna
 * pra checar) sofre do mesmo risco por outro sintoma ("table already
 * exists") — esse caso entra em `MIGRATION_TABLE_RECONCILE_CASES`, logo
 * abaixo.
 */
const MIGRATION_COLUMN_RECONCILE_CASES: { table: string; column: string; tag: string }[] = [
  { table: 'exercises', column: 'nivel', tag: '0006_violet_iron_lad' },
  { table: 'set_logs', column: 'peso_corporal', tag: '0007_cooing_thor' },
  { table: 'user_profile', column: 'last_seen_changelog_version', tag: '0009_sparkling_silver_fox' },
];

/**
 * Mesmo risco de cima, mas para uma migração que CRIA uma tabela inteira
 * (`CREATE TABLE`, sem coluna nenhuma pra checar via `PRAGMA table_info`) —
 * se a tabela já existir no disco (mesma classe de "aplicada mas bookkeeping
 * não sabe") o próximo `migrate()` tenta o mesmo `CREATE TABLE` de novo e
 * quebra com "table already exists", travando o app do mesmo jeito que o
 * "duplicate column name" do caso de coluna. Aqui a checagem é só a
 * existência da tabela em `sqlite_master` — não há coluna pra inspecionar.
 */
const MIGRATION_TABLE_RECONCILE_CASES: { table: string; tag: string }[] = [
  { table: 'user_profile', tag: '0008_little_maginty' },
];

function tableExists(table: string): boolean {
  const tableRow = expoDb.getFirstSync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table]
  );
  return tableRow != null;
}

function recordMigrationAppliedIfNeeded(tag: string) {
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) return;

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
  const alreadyRecorded = lastMigration != null && Number(lastMigration.created_at) >= entry.when;
  if (alreadyRecorded) return;

  expoDb.runSync(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`, ['', entry.when]);
}

function reconcileMigrationBookkeeping() {
  for (const { table, column, tag } of MIGRATION_COLUMN_RECONCILE_CASES) {
    if (!tableExists(table)) continue;

    const columns = expoDb.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
    const hasColumn = columns.some((c) => c.name === column);
    if (!hasColumn) continue;

    recordMigrationAppliedIfNeeded(tag);
  }

  for (const { table, tag } of MIGRATION_TABLE_RECONCILE_CASES) {
    if (!tableExists(table)) continue;

    recordMigrationAppliedIfNeeded(tag);
  }
}

reconcileMigrationBookkeeping();
