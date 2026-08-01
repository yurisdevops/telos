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

export type UserProfilePatch = Partial<
  Pick<UserProfile, 'nome' | 'alturaCm' | 'experiencia' | 'fotoUri' | 'lastSeenChangelogVersion'>
>;

/** Grava só os campos passados na linha id=1 — nunca cria uma linha nova
 * (ensureUserProfileRow já garante que ela existe). */
export async function updateUserProfile(patch: UserProfilePatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db.update(userProfile).set(patch).where(eq(userProfile.id, USER_PROFILE_ID));
}

/** Maior versão do changelog (src/lib/changelog.ts) já vista pelo usuário —
 * `null` se a coluna ainda não foi preenchida (linha existente de antes
 * dessa feature, ou migração ainda não rodou). Quem consome trata `null`
 * como `0` (ver getUnseenChangelog), nunca como "já viu tudo". */
export async function getLastSeenChangelogVersion(): Promise<number | null> {
  const rows = await db
    .select({ value: userProfile.lastSeenChangelogVersion })
    .from(userProfile)
    .where(eq(userProfile.id, USER_PROFILE_ID));
  return rows[0]?.value ?? null;
}

/** Grava a versão mais alta do changelog já vista. */
export async function markChangelogSeen(version: number): Promise<void> {
  await updateUserProfile({ lastSeenChangelogVersion: version });
}

const PROFILE_PHOTO_BASENAME = 'profile-photo';

// Apaga toda foto de perfil anterior em Paths.document (qualquer arquivo com
// o prefixo, sobra de trocas passadas), exceto (se passado) a que acabou de
// ser gravada — o prefixo compartilhado (`profile-photo`) casa com qualquer
// `profile-photo-<timestamp><ext>`, então continua pegando a anterior mesmo
// com nome único por troca. Sem isso, cada troca de foto deixaria a anterior
// órfã pra sempre (nunca mais referenciada, nunca apagada).
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
 * sistema pode limpar sozinho, o que apagaria a foto sem aviso). Nome ÚNICO
 * a cada troca (`profile-photo-<timestamp><extensão>`), não fixo: o
 * `expo-image` cacheia por URI, e um nome fixo faz a URI ficar idêntica
 * quando a extensão não muda — a tela então mostra a foto antiga do cache,
 * mesmo com o arquivo já sobrescrito no disco. Nome único garante que toda
 * troca produz uma URI genuinamente nova, então o cache nunca serve a antiga.
 */
export async function pickAndSaveProfilePhoto(): Promise<void> {
  const pick = await File.pickFileAsync({ mimeTypes: 'image/*' });
  if (pick.canceled) return;

  const picked = pick.result;
  const destination = new File(Paths.document, `${PROFILE_PHOTO_BASENAME}-${Date.now()}${picked.extension}`);
  await picked.copy(destination, { overwrite: true });

  // Grava o caminho novo ANTES de limpar o(s) antigo(s): se algo falhar entre
  // os dois passos, o perfil aponta pro arquivo novo (válido) — nunca fica
  // apontando pra um arquivo que acabou de ser apagado.
  await updateUserProfile({ fotoUri: destination.uri });

  cleanupOldProfilePhotos(destination.name);
}

/** Apaga o arquivo de foto (se existir) e limpa `fotoUri` no perfil. */
export async function removeProfilePhoto(): Promise<void> {
  cleanupOldProfilePhotos();
  await updateUserProfile({ fotoUri: null });
}
