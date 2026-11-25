import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import {
  toDefinitions,
  type GroupDefinition,
  type IamService,
  type ManagedPolicyDefinition,
  type RoleDefinition,
  type UserDefinition,
} from './iamService.js';
import type { PolicyService } from './policyService.js';

type IamResource =
  | { type: 'policy'; data: ManagedPolicyDefinition }
  | { type: 'group'; data: GroupDefinition }
  | { type: 'user'; data: UserDefinition }
  | { type: 'role'; data: RoleDefinition };

/**
 * O IAM vem primeiro na restauração: outros serviços validam que as funções existem.
 * Dentro dele, a ordem de gravação já é a de dependência: políticas, grupos (que
 * recebem políticas), usuários (que entram nos grupos) e funções.
 * Chaves de acesso não são salvas: o emulador não aceita recriá-las com o mesmo segredo.
 */
export class IamSync implements SyncAdapter {
  readonly service = 'iam' as const;

  constructor(
    private readonly iam: IamService,
    private readonly policies: PolicyService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const details = await this.iam.authorizationDetails(['User', 'Group', 'Role', 'LocalManagedPolicy']);
    const { policies, groups, users, roles } = toDefinitions(details);
    const resources: StoredResource[] = [
      ...policies.map((data) => ({ type: 'policy', name: data.name, data })),
      ...groups.map((data) => ({ type: 'group', name: data.name, data })),
      ...users.map((data) => ({ type: 'user', name: data.name, data })),
      ...roles.map((data) => ({ type: 'role', name: data.name, data })),
    ];
    await this.store.replace(tx, 'iam', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const resource of (await this.store.list(db, 'iam')) as IamResource[]) {
      switch (resource.type) {
        case 'policy':
          await createIfMissing(() => this.policies.create(resource.data));
          break;
        case 'group':
          await createIfMissing(() => this.iam.createGroup(resource.data));
          break;
        case 'user':
          await createIfMissing(() => this.iam.createUser(resource.data));
          break;
        case 'role':
          await createIfMissing(() => this.iam.createRole(resource.data));
          break;
      }
    }
  }
}
