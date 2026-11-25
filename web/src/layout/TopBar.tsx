import Autosuggest from '@cloudscape-design/components/autosuggest';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { overviewApi } from '../api/overview';
import { usePolling, useRemote } from '../hooks/useRemote';
import { ACCOUNT_ID, REGION } from './services';
import { useServiceDirectory } from './serviceDirectory';

const STATUS_POLL_MS = 5_000;

export function TopBar() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { services } = useServiceDirectory();
  const status = useRemote((signal) => overviewApi.status(signal), []);
  usePolling(status.reload, STATUS_POLL_MS);

  const emulator = status.data?.emulator;
  const emulatorLabel =
    emulator === 'online' ? 'Emulador online' : emulator === 'offline' ? 'Emulador offline' : 'Verificando emulador';

  return (
    <TopNavigation
      identity={{
        href: '/',
        title: 'Console AWS local',
        onFollow: (event) => {
          event.preventDefault();
          navigate('/');
        },
      }}
      search={
        <Autosuggest
          value={search}
          onChange={({ detail }) => setSearch(detail.value)}
          onSelect={({ detail }) => {
            const service = services.find((s) => s.id === detail.value);
            const href = service?.links[0]?.href;
            if (href) navigate(href);
            setSearch('');
          }}
          options={services.map((s) => ({ value: s.id, label: s.name, description: s.description }))}
          filteringType="auto"
          placeholder="Pesquisar serviços"
          ariaLabel="Pesquisar serviços"
          enteredTextLabel={(value) => `Pesquisar "${value}"`}
          empty="Nenhum serviço encontrado"
        />
      }
      utilities={[
        {
          type: 'button',
          text: emulatorLabel,
          iconName: emulator === 'online' ? 'status-positive' : emulator === 'offline' ? 'status-negative' : 'status-pending',
          ariaLabel: emulatorLabel,
          onClick: () => navigate('/'),
        },
        {
          type: 'menu-dropdown',
          text: REGION,
          description: 'O emulador atende uma única região',
          items: [{ id: REGION, text: `Leste dos EUA (Norte da Virgínia) ${REGION}`, disabled: true }],
        },
        {
          type: 'menu-dropdown',
          text: `Conta ${ACCOUNT_ID}`,
          description: 'Conta fixa do AWS Emulator',
          items: [{ id: 'user', text: 'arn:aws:iam::000000000000:user/emulator', disabled: true }],
        },
      ]}
      i18nStrings={{ overflowMenuTriggerText: 'Mais', overflowMenuTitleText: 'Todos', searchIconAriaLabel: 'Pesquisar', searchDismissIconAriaLabel: 'Fechar pesquisa' }}
    />
  );
}
