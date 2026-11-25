import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/http';
import { DeleteModal } from '../src/components/DeleteModal';

function setup(onConfirm: () => Promise<void>) {
  const onDismiss = vi.fn();
  render(
    <DeleteModal
      visible
      title="Excluir bucket"
      description="Não pode ser desfeito."
      confirmationText="meu-bucket"
      onConfirm={onConfirm}
      onDismiss={onDismiss}
    />,
  );
  return { onDismiss, user: userEvent.setup() };
}

describe('DeleteModal', () => {
  it('só libera a exclusão depois de digitar o nome exato', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const { user, onDismiss } = setup(onConfirm);
    const button = screen.getByRole('button', { name: 'Excluir' });

    expect(button).toBeDisabled();
    await user.type(screen.getByPlaceholderText('meu-bucket'), 'meu-buck');
    expect(button).toBeDisabled();
    await user.type(screen.getByPlaceholderText('meu-bucket'), 'et');
    expect(button).toBeEnabled();

    await user.click(button);
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('mostra o erro do emulador e continua aberto', async () => {
    const onConfirm = vi.fn(async () => {
      throw new ApiError(409, 'BucketNotEmpty', 'O bucket não está vazio');
    });
    const { user, onDismiss } = setup(onConfirm);

    await user.type(screen.getByPlaceholderText('meu-bucket'), 'meu-bucket{Enter}');

    expect(await screen.findByText('BucketNotEmpty: O bucket não está vazio')).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
