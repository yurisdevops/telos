import { db } from './index';
import { userProfile } from './schema';

// Single-user: sempre a mesma linha, nunca uma segunda.
export const USER_PROFILE_ID = 1;

/**
 * Garante que a linha única do perfil (id fixo = 1) existe — idempotente,
 * equivalente a `INSERT OR IGNORE INTO user_profile (id) VALUES (1)`. Chamado
 * no boot depois que as migrações terminam (mesmo timing de seedDatabase()
 * em src/app/_layout.tsx), nunca antes — a tabela só existe depois que a
 * migração 0008 rodar.
 */
export function ensureUserProfileRow() {
  db.insert(userProfile).values({ id: USER_PROFILE_ID }).onConflictDoNothing().run();
}
