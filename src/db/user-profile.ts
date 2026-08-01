import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from './index';
import { userProfile, type UserProfile } from './schema';

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

/** Leitura reativa da linha única do perfil. `undefined` só antes da primeira
 * emissão do useLiveQuery — depois de ensureUserProfileRow() rodar no boot,
 * a linha sempre existe. */
export function useUserProfile() {
  const { data } = useLiveQuery(db.select().from(userProfile).where(eq(userProfile.id, USER_PROFILE_ID)));
  return data?.[0];
}

export type UserProfilePatch = Partial<Pick<UserProfile, 'nome' | 'alturaCm' | 'experiencia' | 'fotoUri'>>;

/** Grava só os campos passados na linha id=1 — nunca cria uma linha nova
 * (ensureUserProfileRow já garante que ela existe). */
export async function updateUserProfile(patch: UserProfilePatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db.update(userProfile).set(patch).where(eq(userProfile.id, USER_PROFILE_ID));
}
