import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db';
import { sessions, setLogs } from '@/db/schema';
import { getTodayDateString } from '@/lib/date';

/**
 * true quando a sessão de hoje existe, não foi concluída e já tem pelo menos
 * uma série registrada — o caso em que sair sem perceber faria sentido avisar.
 * Sessão vazia (nada preenchido ainda) ou já concluída não geram aviso.
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

  return !!session && !session.concluida && hasLogs;
}
