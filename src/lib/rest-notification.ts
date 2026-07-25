import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const REST_TIMER_CHANNEL_ID = 'rest-timer';
const REST_NOTIFICATION_ID = 'rest-timer-done';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReadyPromise: Promise<void> | null = null;

// Se setNotificationChannelAsync falhar uma vez, o cache NÃO guarda a promise
// rejeitada — senão toda tentativa futura de agendar reusaria essa mesma
// promise já falha, e o timer de descanso pararia de notificar pro resto da
// sessão do app (o erro só aparece no console, então passaria despercebido).
function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReadyPromise) {
    channelReadyPromise = Notifications.setNotificationChannelAsync(REST_TIMER_CHANNEL_ID, {
      name: 'Timer de descanso',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 700, 400, 700],
      // Android 8+ ignora o `sound` do conteúdo da notificação — quem manda é
      // o canal (documentado no tipo `NotificationContentInput.sound`).
      sound: 'default',
    })
      .then(() => undefined)
      .catch((err) => {
        channelReadyPromise = null;
        throw err;
      });
  }
  return channelReadyPromise;
}

/** Pede permissão só quando o usuário de fato usa o timer pela primeira vez —
 * se já foi concedida ou negada antes, o SO resolve na hora sem novo prompt. */
export async function ensureRestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.error('Falha ao verificar permissão de notificação:', err);
    return false;
  }
}

export async function scheduleRestEndNotification(secondsFromNow: number): Promise<void> {
  try {
    await ensureChannel();
    await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID).catch(() => {});
    const seconds = Math.max(1, Math.round(secondsFromNow));
    await Notifications.scheduleNotificationAsync({
      identifier: REST_NOTIFICATION_ID,
      content: {
        title: 'Descanso concluído',
        body: 'Hora de voltar pro treino.',
        sound: true,
        // Redundante com a importância do canal no Android 8+, mas é o que
        // decide o comportamento em versões mais antigas e no iOS.
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: REST_TIMER_CHANNEL_ID,
      },
    });

    // Não gateado por __DEV__ de propósito: builds preview/release ainda
    // encaminham console.log pro logcat nativo (visível via `adb logcat`), e é
    // justamente nesses builds que o timer de descanso importa de verdade.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const found = scheduled.some((n) => n.identifier === REST_NOTIFICATION_ID);
    console.log(
      `[rest-notification] agendada pra ${seconds}s a partir de agora — confirmada no SO: ${found}`
    );
  } catch (err) {
    console.error('Falha ao agendar notificação de descanso:', err);
  }
}

export async function cancelRestEndNotification(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID);
  } catch (err) {
    console.error('Falha ao cancelar notificação de descanso:', err);
  }
}
