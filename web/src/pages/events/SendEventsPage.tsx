import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { eventsApi } from '../../api/events';
import { errorMessage } from '../../api/http';
import { CodeArea, jsonError } from '../../components/CodeArea';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { DEFAULT_BUS, EVENTS_BREADCRUMB } from './BusesPage';

export function SendEventsPage() {
  useBreadcrumbs([EVENTS_BREADCRUMB, { text: 'Enviar eventos', href: '/events/send' }]);
  const notifications = useNotifications();
  const buses = useRemote((signal) => eventsApi.buses(signal), []);
  const [bus, setBus] = useState(DEFAULT_BUS);
  const [source, setSource] = useState('minha.aplicacao');
  const [detailType, setDetailType] = useState('PedidoCriado');
  const [detail, setDetail] = useState(JSON.stringify({ pedidoId: 42, valor: 99.9 }, null, 2));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const detailError = jsonError(detail, true);

  const send = async () => {
    setSending(true);
    setError(undefined);
    try {
      const result = await eventsApi.putEvent({ bus, source, detailType, detail });
      const entry = result.entries[0];
      if (result.failed > 0) setError(entry?.error ?? 'O evento foi recusado.');
      else notifications.success(`Evento ${entry?.eventId ?? ''} enviado para "${bus}".`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <ContentLayout header={<Header variant="h1" description="Envie um evento personalizado para testar suas regras.">Enviar eventos</Header>}>
      <Container
        header={
          <Header variant="h2" actions={<Button variant="primary" onClick={send} loading={sending} disabled={!source || !detailType || !!detailError}>Enviar</Button>}>
            Entrada do evento
          </Header>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Barramento de eventos">
            <Select
              selectedOption={{ value: bus, label: bus }}
              onChange={({ detail: d }) => setBus(d.selectedOption.value!)}
              options={(buses.data?.buses ?? []).map((b) => ({ value: b.name, label: b.name }))}
            />
          </FormField>
          <FormField label="Origem do evento (source)">
            <Input value={source} onChange={({ detail: d }) => setSource(d.value)} />
          </FormField>
          <FormField label="Tipo de detalhe (detail-type)">
            <Input value={detailType} onChange={({ detail: d }) => setDetailType(d.value)} />
          </FormField>
          <FormField label="Detalhe do evento (JSON)" errorText={detailError} stretch>
            <CodeArea value={detail} onChange={setDetail} rows={8} ariaLabel="Detalhe do evento" />
          </FormField>
          {error && <Alert type="error">{error}</Alert>}
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
