import { Navigate, Route, Routes } from 'react-router-dom';
import { ConsoleLayout } from './layout/ConsoleLayout';
import { NotificationsProvider } from './layout/notifications';
import { FidelityProvider } from './layout/fidelity';
import { ServiceDirectoryProvider } from './layout/serviceDirectory';
import { ActivityPage } from './pages/activity/ActivityPage';
import { CatalogItemPage, CatalogServiceRedirect, CatalogToolsPage, CatalogTypePage } from './pages/catalog/CatalogPages';
import { ModelsPage } from './pages/bedrock/ModelsPage';
import { PlaygroundPage } from './pages/bedrock/PlaygroundPage';
import { BusesPage } from './pages/events/BusesPage';
import { CreateRulePage } from './pages/events/CreateRulePage';
import { RuleDetailPage } from './pages/events/RuleDetailPage';
import { RulesPage } from './pages/events/RulesPage';
import { SendEventsPage } from './pages/events/SendEventsPage';
import { CreateFunctionPage } from './pages/lambda/CreateFunctionPage';
import { FunctionDetailPage } from './pages/lambda/FunctionDetailPage';
import { FunctionsPage } from './pages/lambda/FunctionsPage';
import { IamDashboardPage } from './pages/iam/IamDashboardPage';
import { UsersPage } from './pages/iam/UsersPage';
import { CreateUserPage } from './pages/iam/CreateUserPage';
import { UserDetailPage } from './pages/iam/UserDetailPage';
import { GroupsPage } from './pages/iam/GroupsPage';
import { CreateGroupPage } from './pages/iam/CreateGroupPage';
import { GroupDetailPage } from './pages/iam/GroupDetailPage';
import { RolesPage } from './pages/iam/RolesPage';
import { CreateRolePage } from './pages/iam/CreateRolePage';
import { RoleDetailPage } from './pages/iam/RoleDetailPage';
import { PoliciesPage } from './pages/iam/PoliciesPage';
import { CreatePolicyPage } from './pages/iam/CreatePolicyPage';
import { PolicyDetailPage } from './pages/iam/PolicyDetailPage';
import { LogGroupPage } from './pages/logs/LogGroupPage';
import { LogGroupsPage } from './pages/logs/LogGroupsPage';
import { LogStreamPage } from './pages/logs/LogStreamPage';
import { VectorBucketPage } from './pages/s3vectors/VectorBucketPage';
import { VectorBucketsPage } from './pages/s3vectors/VectorBucketsPage';
import { VectorIndexPage } from './pages/s3vectors/VectorIndexPage';
import { CreateSchedulePage } from './pages/scheduler/CreateSchedulePage';
import { ScheduleDetailPage } from './pages/scheduler/ScheduleDetailPage';
import { SchedulesPage } from './pages/scheduler/SchedulesPage';
import { SecretDetailPage } from './pages/secrets/SecretDetailPage';
import { SecretsPage } from './pages/secrets/SecretsPage';
import { TopicDetailPage } from './pages/sns/TopicDetailPage';
import { TopicsPage } from './pages/sns/TopicsPage';
import { ParameterDetailPage } from './pages/ssm/ParameterDetailPage';
import { ParametersPage } from './pages/ssm/ParametersPage';
import { CreateStateMachinePage } from './pages/stepfunctions/CreateStateMachinePage';
import { ExecutionPage } from './pages/stepfunctions/ExecutionPage';
import { StateMachineDetailPage } from './pages/stepfunctions/StateMachineDetailPage';
import { StateMachinesPage } from './pages/stepfunctions/StateMachinesPage';
import { CreateTablePage } from './pages/dynamodb/CreateTablePage';
import { TableDetailPage } from './pages/dynamodb/TableDetailPage';
import { TablesPage } from './pages/dynamodb/TablesPage';
import { ConsoleHome } from './pages/home/ConsoleHome';
import { BucketDetailPage } from './pages/s3/BucketDetailPage';
import { BucketsPage } from './pages/s3/BucketsPage';
import { CreateBucketPage } from './pages/s3/CreateBucketPage';
import { CreateQueuePage } from './pages/sqs/CreateQueuePage';
import { QueueDetailPage } from './pages/sqs/QueueDetailPage';
import { QueuesPage } from './pages/sqs/QueuesPage';

export function App() {
  return (
    <NotificationsProvider>
      <ServiceDirectoryProvider>
        <FidelityProvider>
          <ConsoleLayout>
            <Routes>
              <Route path="/" element={<ConsoleHome />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/iam" element={<Navigate to="/iam/home" replace />} />
              <Route path="/iam/home" element={<IamDashboardPage />} />
              <Route path="/iam/users" element={<UsersPage />} />
              <Route path="/iam/create-user" element={<CreateUserPage />} />
              <Route path="/iam/users/:name" element={<UserDetailPage />} />
              <Route path="/iam/groups" element={<GroupsPage />} />
              <Route path="/iam/create-group" element={<CreateGroupPage />} />
              <Route path="/iam/groups/:name" element={<GroupDetailPage />} />
              <Route path="/iam/roles" element={<RolesPage />} />
              <Route path="/iam/create-role" element={<CreateRolePage />} />
              <Route path="/iam/roles/:name" element={<RoleDetailPage />} />
              <Route path="/iam/policies" element={<PoliciesPage />} />
              <Route path="/iam/create-policy" element={<CreatePolicyPage />} />
              <Route path="/iam/policy" element={<PolicyDetailPage />} />
              <Route path="/s3" element={<Navigate to="/s3/buckets" replace />} />
              <Route path="/s3/buckets" element={<BucketsPage />} />
              <Route path="/s3/create-bucket" element={<CreateBucketPage />} />
              <Route path="/s3/buckets/:bucket" element={<BucketDetailPage />} />
              <Route path="/dynamodb" element={<Navigate to="/dynamodb/tables" replace />} />
              <Route path="/dynamodb/tables" element={<TablesPage />} />
              <Route path="/dynamodb/create-table" element={<CreateTablePage />} />
              <Route path="/dynamodb/tables/:table" element={<TableDetailPage />} />
              <Route path="/sqs" element={<Navigate to="/sqs/queues" replace />} />
              <Route path="/sqs/queues" element={<QueuesPage />} />
              <Route path="/sqs/create-queue" element={<CreateQueuePage />} />
              <Route path="/sqs/queues/:queue" element={<QueueDetailPage />} />
              <Route path="/lambda" element={<Navigate to="/lambda/functions" replace />} />
              <Route path="/lambda/functions" element={<FunctionsPage />} />
              <Route path="/lambda/create-function" element={<CreateFunctionPage />} />
              <Route path="/lambda/functions/:name" element={<FunctionDetailPage />} />
              <Route path="/logs" element={<Navigate to="/logs/groups" replace />} />
              <Route path="/logs/groups" element={<LogGroupsPage />} />
              <Route path="/logs/group" element={<LogGroupPage />} />
              <Route path="/logs/stream" element={<LogStreamPage />} />
              <Route path="/sns" element={<Navigate to="/sns/topics" replace />} />
              <Route path="/sns/topics" element={<TopicsPage />} />
              <Route path="/sns/topics/:topic" element={<TopicDetailPage />} />
              <Route path="/secrets" element={<SecretsPage />} />
              <Route path="/secrets/detail" element={<SecretDetailPage />} />
              <Route path="/ssm" element={<Navigate to="/ssm/parameters" replace />} />
              <Route path="/ssm/parameters" element={<ParametersPage />} />
              <Route path="/ssm/parameter" element={<ParameterDetailPage />} />
              <Route path="/events" element={<Navigate to="/events/rules" replace />} />
              <Route path="/events/rules" element={<RulesPage />} />
              <Route path="/events/create-rule" element={<CreateRulePage />} />
              <Route path="/events/rule" element={<RuleDetailPage />} />
              <Route path="/events/buses" element={<BusesPage />} />
              <Route path="/events/send" element={<SendEventsPage />} />
              <Route path="/scheduler" element={<Navigate to="/scheduler/schedules" replace />} />
              <Route path="/scheduler/schedules" element={<SchedulesPage />} />
              <Route path="/scheduler/create-schedule" element={<CreateSchedulePage />} />
              <Route path="/scheduler/schedules/:group/:name" element={<ScheduleDetailPage />} />
              <Route path="/stepfunctions" element={<Navigate to="/stepfunctions/state-machines" replace />} />
              <Route path="/stepfunctions/state-machines" element={<StateMachinesPage />} />
              <Route path="/stepfunctions/create" element={<CreateStateMachinePage />} />
              <Route path="/stepfunctions/state-machines/:name" element={<StateMachineDetailPage />} />
              <Route path="/stepfunctions/execution" element={<ExecutionPage />} />
              <Route path="/s3vectors" element={<Navigate to="/s3vectors/buckets" replace />} />
              <Route path="/s3vectors/buckets" element={<VectorBucketsPage />} />
              <Route path="/s3vectors/buckets/:bucket" element={<VectorBucketPage />} />
              <Route path="/s3vectors/buckets/:bucket/indexes/:index" element={<VectorIndexPage />} />
              <Route path="/bedrock" element={<Navigate to="/bedrock/playground" replace />} />
              <Route path="/bedrock/playground" element={<PlaygroundPage />} />
              <Route path="/bedrock/models" element={<ModelsPage />} />
              <Route path="/c/:service" element={<CatalogServiceRedirect />} />
              <Route path="/c/:service/tools" element={<CatalogToolsPage />} />
              <Route path="/c/:service/:type" element={<CatalogTypePage />} />
              <Route path="/c/:service/:type/item" element={<CatalogItemPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ConsoleLayout>
        </FidelityProvider>
      </ServiceDirectoryProvider>
    </NotificationsProvider>
  );
}
