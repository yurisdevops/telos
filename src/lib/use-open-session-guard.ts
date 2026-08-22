import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db';
import { cardioLogs, cardioSessions, sessions, setLogs } from '@/db/schema';
import { getTodayDateString } from '@/lib/date';

/**
 * true quando a sessão de hoje (musculação OU cardio separado) existe, não
 * foi concluída e já tem pelo menos um registro (série ou bloco de cardio)
 * — o caso em que sair sem perceber faria sentido avisar. Sessão vazia (nada
 * preenchido ainda) ou já concluída não geram aviso, nos dois casos. Cardio
 * DENTRO de um treino de força (modo A) não precisa de checagem própria —
 * já está coberto pela sessão de força que o contém.
 */
export function useOpenSessionNeedsConfirm(): boolean {
  const todayStr = getTodayDateString();

  const { data: todaySessions } = useLiveQuery(
    db.select({ id: sessions.id, concluida: sessions.concluida }).from(sessions).where(eq(sessions.data, todayStr))
  );
  const session = todaySessions?.[0];

  const { data: logCountRows } = useLiveQuery(
    db
      .select({ count: sql<number>`count(*)` })
      .from(setLogs)
      .where(eq(setLogs.sessionId, session?.id ?? -1)),
    [session?.id]
  );
  const hasLogs = Number(logCountRows?.[0]?.count ?? 0) > 0;

  const { data: todayCardioSessions } = useLiveQuery(
    db
      .select({ id: cardioSessions.id, concluida: cardioSessions.concluida })
      .from(cardioSessions)
      .where(eq(cardioSessions.data, todayStr))
  );
  const cardioSession = todayCardioSessions?.[0];

  const { data: cardioLogCountRows } = useLiveQuery(
    db
      .select({ count: sql<number>`count(*)` })
      .from(cardioLogs)
      .where(eq(cardioLogs.cardioSessionId, cardioSession?.id ?? -1)),
    [cardioSession?.id]
  );
  const hasCardioLogs = Number(cardioLogCountRows?.[0]?.count ?? 0) > 0;

  return (
    (!!session && !session.concluida && hasLogs) ||
    (!!cardioSession && !cardioSession.concluida && hasCardioLogs)
  );
}
