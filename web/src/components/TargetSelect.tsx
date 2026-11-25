import Select from '@cloudscape-design/components/select';
import { lambdaApi } from '../api/lambda';
import { snsApi } from '../api/sns';
import { sqsApi } from '../api/sqs';
import { sfnApi } from '../api/stepfunctions';
import { useRemote } from '../hooks/useRemote';

const ACCOUNT_PREFIX = 'arn:aws:sqs:us-east-1:000000000000:';

/** Destinos possíveis para regras e agendamentos: recursos existentes, agrupados por serviço. */
async function loadTargets(signal: AbortSignal) {
  const [functions, queues, topics, machines] = await Promise.allSettled([
    lambdaApi.list(signal),
    sqsApi.listQueues(signal),
    snsApi.topics(signal),
    sfnApi.list(signal),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  return [
    { label: 'Funções Lambda', options: (ok(functions)?.functions ?? []).map((f) => ({ value: f.arn, label: f.name })) },
    { label: 'Filas SQS', options: (ok(queues)?.queues ?? []).map((q) => ({ value: `${ACCOUNT_PREFIX}${q.name}`, label: q.name })) },
    { label: 'Tópicos SNS', options: (ok(topics)?.topics ?? []).map((t) => ({ value: t.arn, label: t.name })) },
    { label: 'Máquinas de estado', options: (ok(machines)?.stateMachines ?? []).map((m) => ({ value: m.arn, label: m.name })) },
  ].filter((group) => group.options.length > 0);
}

export function TargetSelect({ value, onChange }: { value: string; onChange: (arn: string) => void }) {
  const targets = useRemote((signal) => loadTargets(signal), []);
  const all = (targets.data ?? []).flatMap((g) => g.options);
  return (
    <Select
      selectedOption={value ? { value, label: all.find((o) => o.value === value)?.label ?? value, description: value } : null}
      onChange={({ detail }) => onChange(detail.selectedOption.value!)}
      options={(targets.data ?? []).map((g) => ({ label: g.label, options: g.options.map((o) => ({ ...o, description: o.value })) }))}
      statusType={targets.loading ? 'loading' : targets.error ? 'error' : 'finished'}
      loadingText="Carregando destinos"
      errorText="Falha ao carregar destinos"
      empty="Crie uma função, fila, tópico ou máquina de estado primeiro."
      filteringType="auto"
      placeholder="Escolha um destino"
    />
  );
}
