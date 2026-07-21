import { useEffect, useRef, useState } from 'react';
import { addDatabaseChangeListener } from 'expo-sqlite';

/**
 * Runs an arbitrary async query against the db and re-runs it whenever one
 * of `watchTables` changes.
 *
 * drizzle's own `useLiveQuery` only watches the query's FROM table, so a
 * join (e.g. setLogs joined with sessions) never reacts to a sessions-only
 * change like marking a workout complete. This hook watches exactly the
 * tables the caller names, which is what every aggregate query in the
 * Progresso tab needs.
 *
 * Returns `undefined` until the first fetch resolves.
 */
export function useDbQuery<T>(
  queryFn: () => Promise<T>,
  watchTables: string[],
  deps: unknown[] = []
): T | undefined {
  const [data, setData] = useState<T>();
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      queryFnRef.current().then((result) => {
        if (!cancelled) setData(result);
      });
    };

    load();

    const listener = addDatabaseChangeListener(({ tableName }) => {
      if (watchTables.includes(tableName)) {
        load();
      }
    });

    return () => {
      cancelled = true;
      listener.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}
