import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { catalogApi, type ActionMeta, type ServiceMeta, type TypeMeta } from '../../api/catalog';
import { CodeArea } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { useAction } from '../../hooks/useAction';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { useServiceDirectory } from '../../layout/serviceDirectory';
import { catalogEntry, catalogHref, catalogToolsHref } from '../../layout/services';
import { attributeLabel, formatAttribute } from './fields';
import { ActionModal, RunForm } from './RunForm';
import { itemHref, ResourceList } from './ResourceList';

/** Resolve o serviço da URL, esperando o catálogo carregar. */
function useCatalogService(): { service?: ServiceMeta; pending: JSX.Element | null } {
  const { service: id } = useParams();
  const directory = useServiceDirectory();
  if (directory.catalogError && !directory.catalog.length) {
    return { pending: <LoadError error={directory.catalogError} onRetry={directory.reloadCatalog} /> };
  }
  if (directory.catalogLoading && !directory.catalog.length) return { pending: <Spinner size="large" /> };
  const service = directory.catalogService(id ?? '');
  return service ? { service, pending: null } : { pending: <Navigate to="/" replace /> };
}

const serviceCrumb = (service: ServiceMeta) => ({ text: service.name, href: catalogEntry(service).links[0]?.href ?? '/' });

function ServiceNotes({ service, type }: { service: ServiceMeta; type?: TypeMeta }) {
  const notes = [service.notes, type?.notes].filter(Boolean);
  if (!notes.length) return null;
  return (
    <Alert type="info" header="No emulador">
      {notes.join(' ')}
    </Alert>
  );
}

/** /c/:service: abre o primeiro link do serviço. */
export function CatalogServiceRedirect() {
  const { service, pending } = useCatalogService();
  if (!service) return pending;
  return <Navigate to={catalogEntry(service).links[0]?.href ?? '/'} replace />;
}

export function CatalogTypePage() {
  const { service, pending } = useCatalogService();
  const { type: typeKey } = useParams();
  const type = service?.types.find((t) => t.key === typeKey && !t.parent);
  useBreadcrumbs(service && type ? [serviceCrumb(service), { text: type.label, href: catalogHref(service.id, type.key) }] : []);
  if (!service) return pending;
  if (!type) return <Navigate to={catalogEntry(service).links[0]?.href ?? '/'} replace />;

  return (
    <SpaceBetween size="l">
      <ServiceNotes service={service} type={type} />
      {/* A chave recria a tabela ao trocar de tipo pela navegação lateral. */}
      <ResourceList key={`${service.id}/${type.key}`} service={service.id} type={type} variant="full-page" />
    </SpaceBetween>
  );
}

export function CatalogItemPage() {
  const { service, pending } = useCatalogService();
  const { type: typeKey } = useParams();
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const parentId = params.get('parent') ?? undefined;
  const type = service?.types.find((t) => t.key === typeKey);
  const parentType = type?.parent ? service?.types.find((t) => t.key === type.parent) : undefined;

  const detail = useRemote(
    (signal) => (service && type ? catalogApi.detail(service.id, type.key, id, parentId, signal) : Promise.resolve(null)),
    [service?.id, type?.key, id, parentId],
  );
  const name = detail.data?.row.name ?? id;
  useBreadcrumbs(
    service && type
      ? [
          serviceCrumb(service),
          parentType
            ? { text: parentType.label, href: catalogHref(service.id, parentType.key) }
            : { text: type.label, href: catalogHref(service.id, type.key) },
          ...(parentType && parentId ? [{ text: parentId, href: itemHref(service.id, parentType.key, parentId) }] : []),
          { text: name, href: itemHref(service.id, type.key, id, parentId) },
        ]
      : [],
  );

  if (!service) return pending;
  if (!type) return <Navigate to={catalogEntry(service).links[0]?.href ?? '/'} replace />;
  if (detail.error) return <LoadError error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Spinner size="large" />;

  return <ItemView service={service} type={type} parentId={parentId} data={detail.data} onChanged={detail.reload} />;
}

interface ItemViewProps {
  service: ServiceMeta;
  type: TypeMeta;
  parentId?: string;
  data: NonNullable<Awaited<ReturnType<typeof catalogApi.detail>>>;
  onChanged: () => void;
}

function ItemView({ service, type, parentId, data, onChanged }: ItemViewProps) {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const quick = useAction();
  const [openAction, setOpenAction] = useState<ActionMeta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { row, details } = data;
  const children = service.types.filter((t) => t.parent === type.key);

  // Ações sem campos que só alteram o recurso (iniciar, parar) rodam direto, como no console.
  const runAction = async (action: ActionMeta) => {
    if (action.fields.length === 0 && action.mutates && !action.description) {
      const ok = await quick.run(
        () => catalogApi.action(service.id, type.key, action.key, row.id, {}, parentId),
        `${action.label}: solicitado para "${row.name}".`,
        `Falha em "${action.label}"`,
      );
      if (ok) onChanged();
      return;
    }
    setOpenAction(action);
  };

  const attributes = Object.entries(row.attrs);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={row.id !== row.name ? row.id : undefined}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={onChanged} />
              {type.remove && <Button onClick={() => setDeleting(true)}>{type.remove.label ?? 'Excluir'}</Button>}
              {type.actions.length > 0 && (
                <ButtonDropdown
                  variant="primary"
                  loading={quick.running}
                  items={type.actions.map((a) => ({ id: a.key, text: a.label }))}
                  onItemClick={({ detail }) => void runAction(type.actions.find((a) => a.key === detail.id)!)}
                >
                  Ações
                </ButtonDropdown>
              )}
            </SpaceBetween>
          }
        >
          {row.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <ServiceNotes service={service} type={type} />
        {row.managedBy && (
          <Alert type="info">
            Recurso gerenciado por <b>{row.managedBy}</b>: ele é recriado por quem o gerencia e não é salvo à parte.
          </Alert>
        )}
        <Container header={<Header variant="h2" actions={type.persisted && !row.managedBy ? <Badge color="green">Salvo no banco</Badge> : undefined}>Detalhes</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'ID', value: row.id },
              ...(row.status ? [{ label: 'Status', value: <StatusIndicator type={row.status.tone}>{row.status.label}</StatusIndicator> }] : []),
              ...attributes.map(([key, value]) => ({ label: attributeLabel(key, type.columns), value: <span className="wrap-anywhere">{formatAttribute(value)}</span> })),
            ]}
          />
        </Container>
        {children.map((child) => (
          <ResourceList key={child.key} service={service.id} type={child} parentId={row.id} variant="container" />
        ))}
        {details !== null && details !== undefined && (
          <ExpandableSection headerText="Resposta completa da API (JSON)" variant="container">
            <CodeArea value={JSON.stringify(details, null, 2)} readOnly rows={18} ariaLabel="Resposta da API" />
          </ExpandableSection>
        )}
      </SpaceBetween>
      {openAction && (
        <ActionModal
          visible
          title={`${openAction.label}: ${row.name}`}
          description={openAction.description}
          fields={openAction.fields}
          submitLabel={openAction.submitLabel ?? 'Executar'}
          run={async (input) => (await catalogApi.action(service.id, type.key, openAction.key, row.id, input, parentId)).result}
          onSuccess={openAction.mutates ? onChanged : undefined}
          onDismiss={() => setOpenAction(null)}
        />
      )}
      {type.remove && (
        <DeleteModal
          visible={deleting}
          title={`${type.remove.label ?? 'Excluir'}: ${row.name}`}
          confirmationText="confirmar"
          actionLabel={type.remove.label ?? 'Excluir'}
          description={<>{type.remove.warning ?? `O(a) ${type.singular} será excluído(a).`}</>}
          onConfirm={async () => {
            await catalogApi.remove(service.id, type.key, row.id, parentId);
            notifications.success(`"${row.name}": ${(type.remove?.label ?? 'excluir').toLowerCase()} solicitado.`);
            const parent = type.parent;
            navigate(parent && parentId ? itemHref(service.id, parent, parentId) : catalogHref(service.id, type.key));
          }}
          onDismiss={() => setDeleting(false)}
        />
      )}
    </ContentLayout>
  );
}

export function CatalogToolsPage() {
  const { service, pending } = useCatalogService();
  useBreadcrumbs(service ? [serviceCrumb(service), { text: 'Ferramentas', href: catalogToolsHref(service.id) }] : []);
  if (!service) return pending;
  if (!service.tools.length) return <Navigate to={catalogEntry(service).links[0]?.href ?? '/'} replace />;

  return (
    <ContentLayout header={<Header variant="h1" description={service.description}>{service.name}</Header>}>
      <SpaceBetween size="l">
        <ServiceNotes service={service} />
        {service.tools.map((tool) => (
          <Container key={tool.key} header={<Header variant="h2" description={tool.description}>{tool.label}</Header>}>
            <RunForm fields={tool.fields} submitLabel={tool.submitLabel ?? tool.label} run={async (input) => (await catalogApi.tool(service.id, tool.key, input)).result} />
          </Container>
        ))}
      </SpaceBetween>
    </ContentLayout>
  );
}
