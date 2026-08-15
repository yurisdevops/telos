import { eq } from 'drizzle-orm';

import { db } from './index';
import { userProfile } from './schema';
import { USER_PROFILE_ID } from './user-profile';
import { randomSaltHex, sha256Hex } from '@/lib/sha256';

const PIN_PATTERN = /^\d{4}$/;

function assertValidPinFormat(pin: string) {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error('O PIN deve ter exatamente 4 dígitos numéricos.');
  }
}

// Salt ANTES do PIN — a ordem em si não importa pra segurança, só precisa
// ser sempre a mesma dos dois lados (createPin grava, verifyPin recalcula).
function hashPin(pin: string, salt: string): string {
  return sha256Hex(salt + pin);
}

/**
 * Sistema de PIN reutilizável (não específico do reset de histórico) — trava
 * local simples: 4 dígitos, hash SHA-256(salt + pin) com salt aleatório por
 * device, nunca o PIN em texto. Sem recuperação: perder o PIN significa criar
 * um novo (ver clearPin), não há como reverter o hash.
 */

/** true se já existe um PIN criado (user_profile.pinHash não é null). */
export async function hasPin(): Promise<boolean> {
  const rows = await db
    .select({ pinHash: userProfile.pinHash })
    .from(userProfile)
    .where(eq(userProfile.id, USER_PROFILE_ID));
  return rows[0]?.pinHash != null;
}

/**
 * Cria (ou substitui, se já existia) o PIN: gera um salt novo, calcula
 * hash(salt + pin) e grava os dois na linha única do perfil. Lança se o
 * formato não for exatamente 4 dígitos — quem chama (CreatePinFlow) já
 * garante isso via PinPad, mas a validação vive aqui também porque este
 * módulo é reutilizável e pode ganhar outro chamador no futuro.
 */
export async function createPin(pin: string): Promise<void> {
  assertValidPinFormat(pin);
  const salt = randomSaltHex();
  const hash = hashPin(pin, salt);
  await db.update(userProfile).set({ pinHash: hash, pinSalt: salt }).where(eq(userProfile.id, USER_PROFILE_ID));
}

/**
 * Confere um PIN digitado contra o hash guardado. `false` pra qualquer motivo
 * de não bater — formato inválido, PIN incorreto, ou nenhum PIN criado ainda
 * (nunca lança por "PIN errado": isso é o resultado normal esperado, não uma
 * condição excepcional). Quem chama que precisar distinguir "sem PIN" de
 * "PIN errado" deve checar `hasPin()` antes, se isso importar pro fluxo.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  if (!PIN_PATTERN.test(pin)) return false;

  const rows = await db
    .select({ pinHash: userProfile.pinHash, pinSalt: userProfile.pinSalt })
    .from(userProfile)
    .where(eq(userProfile.id, USER_PROFILE_ID));
  const row = rows[0];
  if (!row?.pinHash || !row.pinSalt) return false;

  return hashPin(pin, row.pinSalt) === row.pinHash;
}

/**
 * Zera pinHash/pinSalt — prepara terreno pra um futuro "remover PIN", NÃO
 * exposto em UI nenhuma ainda (nem o botão de teste temporário da Etapa B
 * chama isso). Depois de chamado, `hasPin()` volta a `false`.
 */
export async function clearPin(): Promise<void> {
  await db.update(userProfile).set({ pinHash: null, pinSalt: null }).where(eq(userProfile.id, USER_PROFILE_ID));
}
