import { useState } from 'react';

import { ConfirmDialog, type ConfirmDialogProps } from '@/components/ui/confirm-dialog';

type ConfirmOptions = Omit<ConfirmDialogProps, 'visible' | 'onConfirm' | 'onCancel'>;

/**
 * `Alert.alert` estilizado (ver ConfirmDialog) por trás de uma Promise<boolean>
 * — `await confirm({...})` no lugar do array de botões com callbacks do
 * Alert nativo. `dialog` é o JSX do diálogo em si; quem chama só precisa
 * renderizá-lo uma vez em qualquer lugar da árvore da tela (a visibilidade
 * já vem controlada por dentro).
 *
 * Uso:
 *   const { confirm, dialog } = useConfirmDialog();
 *   const ok = await confirm({ title: 'Excluir plano?', variant: 'destructive' });
 *   if (ok) { ... }
 *   return <View>...{dialog}</View>;
 */
export function useConfirmDialog() {
  const [state, setState] = useState<{
    visible: boolean;
    props: ConfirmOptions;
    resolve: (confirmed: boolean) => void;
  }>({ visible: false, props: { title: '' }, resolve: () => {} });

  const confirm = (options: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) => setState({ visible: true, props: options, resolve }));

  const handleConfirm = () => {
    state.resolve(true);
    setState((s) => ({ ...s, visible: false }));
  };

  const handleCancel = () => {
    state.resolve(false);
    setState((s) => ({ ...s, visible: false }));
  };

  const dialog = (
    <ConfirmDialog {...state.props} visible={state.visible} onConfirm={handleConfirm} onCancel={handleCancel} />
  );

  return { confirm, dialog };
}
