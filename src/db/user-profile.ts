import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

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
  Pick<
    UserProfile,
    | 'nome'
    | 'alturaCm'
    | 'experiencia'
    | 'fotoUri'
    | 'lastSeenChangelogVersion'
    | 'sexo'
    | 'lastCelebrationMonth'
    | 'metaCardioMinutosSemana'
  >
>;

// Fundação do boneco 2D (Fase 2, futura) — mesmo padrão de AssistantExperience
// (assistant-profile.ts): união de strings, sem enum nativo no SQLite. Nullable
// na coluna (ver schema.ts) — usuário pode nunca escolher; o boneco pede
// depois, não é forçado agora.
export type Sexo = 'masculino' | 'feminino';

export const SEXO_OPTIONS: { value: Sexo; label: string }[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
];

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

/** "YYYY-MM" do último mês em que o modal de celebração mensal
 * (lib/monthly-celebration.ts) foi mostrado — `null` se nunca (linha
 * existente de antes da coluna, ou usuário que ainda não viu nenhuma). */
export async function getLastCelebrationMonth(): Promise<string | null> {
  const rows = await db
    .select({ value: userProfile.lastCelebrationMonth })
    .from(userProfile)
    .where(eq(userProfile.id, USER_PROFILE_ID));
  return rows[0]?.value ?? null;
}

/** Grava o mês ("YYYY-MM") em que a celebração acabou de ser mostrada — ou
 * `null` pra limpar o registro (só usado por `clearCelebrationRecord`,
 * lib/monthly-celebration.ts, ferramenta de debug pra testar sem esperar o
 * mês virar). */
export async function setLastCelebrationMonth(month: string | null): Promise<void> {
  await updateUserProfile({ lastCelebrationMonth: month });
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

export type ProfilePhotoSource = 'library' | 'camera';

/** Extensão do arquivo escolhido, preferindo `fileName` (mais confiável que
 * `uri`, que em alguns Android pode vir sem extensão clara) — cai pra
 * `.jpg` (formato padrão de câmera/galeria) se nenhum dos dois tiver uma. */
function extensionFromAsset(asset: ImagePicker.ImagePickerAsset): string {
  const match = (asset.fileName ?? asset.uri).match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0] : '.jpg';
}

async function requestPickerPermission(source: ProfilePhotoSource): Promise<boolean> {
  const response =
    source === 'library'
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
  return response.granted;
}

/**
 * Abre a galeria de fotos ou a câmera nativa (via `expo-image-picker`) e
 * salva a foto escolhida como foto de perfil. Cancelamento é tratado como
 * no-op silencioso; permissão negada lança um erro com mensagem amigável
 * (capturado e exibido pelo `reportError` de quem chama, mesmo padrão do
 * resto do app — não duplica lógica de alerta aqui).
 *
 * A partir daqui o pipeline é IDÊNTICO ao que já existia com
 * `File.pickFileAsync`: copia pra `Paths.document` (diretório persistente,
 * nunca `Paths.cache`, que o sistema pode limpar sozinho) com nome ÚNICO
 * (`profile-photo-<timestamp><extensão>`) — necessário porque o `expo-image`
 * cacheia por URI, e um nome fixo faria a tela mostrar a foto antiga do
 * cache mesmo com o arquivo já sobrescrito no disco.
 */
export async function pickAndSaveProfilePhoto(source: ProfilePhotoSource): Promise<void> {
  const granted = await requestPickerPermission(source);
  if (!granted) {
    throw new Error(
      source === 'library'
        ? 'Permita o acesso à galeria nas configurações do aparelho pra escolher uma foto.'
        : 'Permita o acesso à câmera nas configurações do aparelho pra tirar uma foto.'
    );
  }

  const result =
    source === 'library'
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return;

  const picked = result.assets[0];
  if (!picked) return;

  const destination = new File(Paths.document, `${PROFILE_PHOTO_BASENAME}-${Date.now()}${extensionFromAsset(picked)}`);
  await new File(picked.uri).copy(destination, { overwrite: true });

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
