import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { File, Paths } from 'expo-file-system';

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

const PROFILE_PHOTO_BASENAME = 'profile-photo';

// Apaga qualquer foto de perfil anterior em Paths.document, exceto (se
// passado) o arquivo que acabou de ser gravado — cobre o caso de trocar de
// foto com uma extensão diferente da anterior (ex: era .png, a nova é .jpg),
// que senão deixaria a antiga órfã pra sempre (nunca mais referenciada, nunca
// apagada).
function cleanupOldProfilePhotos(exceptFileName?: string) {
  for (const entry of Paths.document.list()) {
    if (entry instanceof File && entry.name.startsWith(PROFILE_PHOTO_BASENAME) && entry.name !== exceptFileName) {
      try {
        entry.delete();
      } catch {
        // Já pode ter sido removido por fora — não é um erro que importa aqui.
      }
    }
  }
}

/**
 * Abre o seletor de arquivo do sistema filtrado por imagem — via
 * `File.pickFileAsync` do `expo-file-system` (já instalado), não
 * `expo-image-picker` (exigiria módulo nativo novo e rebuild). Cancelamento
 * é tratado como no-op silencioso.
 *
 * A foto escolhida é copiada pra `Paths.document` — o diretório persistente
 * ("safe from being deleted by the system"), nunca `Paths.cache` (que o
 * sistema pode limpar sozinho, o que apagaria a foto sem aviso). Nome
 * estável (`profile-photo<extensão>`): trocar de foto sobrescreve a mesma
 * linha do banco e limpa qualquer arquivo anterior, nunca acumula lixo.
 */
export async function pickAndSaveProfilePhoto(): Promise<void> {
  const pick = await File.pickFileAsync({ mimeTypes: 'image/*' });
  if (pick.canceled) return;

  const picked = pick.result;
  const destination = new File(Paths.document, `${PROFILE_PHOTO_BASENAME}${picked.extension}`);
  await picked.copy(destination, { overwrite: true });

  // Só limpa depois que a cópia nova deu certo — se o copy() falhar, a foto
  // antiga (se houver) continua intacta em vez de o usuário ficar sem nenhuma.
  cleanupOldProfilePhotos(destination.name);

  await updateUserProfile({ fotoUri: destination.uri });
}

/** Apaga o arquivo de foto (se existir) e limpa `fotoUri` no perfil. */
export async function removeProfilePhoto(): Promise<void> {
  cleanupOldProfilePhotos();
  await updateUserProfile({ fotoUri: null });
}
