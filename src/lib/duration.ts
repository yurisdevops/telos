import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` without accumulating state — callers always
 * recompute elapsed/remaining time from real timestamps, so the displayed
 * value is correct even after the app was closed/backgrounded and reopened. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

/** ms -> "1h07" (>=1h) or "42min" (<1h) or "38s" (<1min). */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours >= 1) {
    return `${hours}h${String(minutes).padStart(2, '0')}`;
  }
  if (minutes >= 1) {
    return `${minutes}min`;
  }
  return `${seconds}s`;
}

/** seconds -> "01:30" (mm:ss, zero-padded), for the rest timer countdown. */
export function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** ms -> "12:34" (mm:ss) ou "1:02:34" (h:mm:ss, só quando >= 1h) — cronômetro
 * progressivo com segundos sempre visíveis. Diferente de `formatElapsed`
 * (que arredonda pra "42min"/"1h07", sem segundos): bom pra um resumo
 * estático, mas não serve pra um cronômetro rodando ao vivo, que precisa
 * mostrar os segundos mudando a cada tick (ver cardio/sessao.tsx). */
export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours >= 1) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
