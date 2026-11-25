/** Códigos que significam "o recurso já existe", variando por serviço. */
const ALREADY_EXISTS = new Set([
  'ResourceConflictException',
  'ResourceAlreadyExistsException',
  'ResourceExistsException',
  'ConflictException',
  'StateMachineAlreadyExists',
  'ParameterAlreadyExists',
  'EntityAlreadyExistsException',
  'AlreadyExistsException',
  'DBInstanceAlreadyExists',
  'DBInstanceAlreadyExistsFault',
  'CacheClusterAlreadyExists',
  'CacheClusterAlreadyExistsFault',
  'ClusterAlreadyExists',
  'ClusterAlreadyExistsFault',
  'RepositoryAlreadyExistsException',
  'HostedZoneAlreadyExists',
  'InvalidKeyPair.Duplicate',
  'InvalidGroup.Duplicate',
  'InvalidLaunchTemplateName.AlreadyExistsException',
  'DuplicateLoadBalancerName',
  'DuplicateTargetGroupName',
  'WAFDuplicateItemException',
  'ResourceInUseException',
  // Fila recriada antes por uma stack do CloudFormation, com atributos da própria stack.
  'QueueNameExists',
]);

export const isAlreadyExists = (err: unknown): boolean => ALREADY_EXISTS.has((err as Error).name);

/** Executa uma criação da restauração aceitando que o recurso já exista. */
export async function createIfMissing(create: () => Promise<unknown>): Promise<void> {
  try {
    await create();
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }
}
