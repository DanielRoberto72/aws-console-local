# Console AWS local

Console AWS local é um console web para o [AWS Emulator](https://github.com/aws/aws-emulator). O AWS Emulator é um
emulador local das APIs da AWS: ele serve um endpoint compatível com a AWS, mas não tem interface gráfica e mantém
todo o estado em memória. O Console AWS local acrescenta as duas coisas que faltam para o uso diário: telas no estilo
do console da AWS e persistência do estado em Postgres.

Tudo roda na sua máquina, com Docker Compose. Não é preciso ter conta na AWS. As requisições vão para o emulador, não
para a AWS, e não há cobrança.

O Console AWS local é para desenvolvimento, testes e estudo. Não o use para cargas de produção nem para testar
segurança. Este projeto não é mantido pela AWS. O comportamento dos serviços é o do AWS Emulator e pode diferir da
AWS em erros, limites e detalhes.

**Documentação do emulador:** [AWS Emulator User Guide](https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html)

## Recursos

- **Console no estilo da AWS.** Telas em português, com componentes [Cloudscape](https://cloudscape.design), para
  criar, inspecionar e excluir recursos de 45 serviços.
- **Persistência.** O estado do emulador é copiado para o Postgres e recriado automaticamente quando o emulador
  reinicia. Isso inclui recursos criados fora do console, pela AWS CLI, por SDKs ou pelo Terraform.
- **Endpoints locais fixos.** Bancos, caches e brokers (RDS, ElastiCache, Redshift, OpenSearch, MQ, AppSync) recebem
  uma porta fixa em `localhost`, que não muda entre reinícios do emulador.

## Casos de uso

O Console AWS local é indicado para:

- Desenvolver e testar aplicações que usam a AWS, apontando a AWS CLI, um SDK ou o Terraform para o emulador.
- Labs de integração e serverless: S3, Lambda, SQS, SNS, DynamoDB, EventBridge, Step Functions, API Gateway, Cognito,
  KMS e Secrets Manager funcionam de verdade, incluindo as entregas entre eles.
- Prática com dados: SQL no RDS (PostgreSQL) e no Redshift, Redis, Athena sobre tabelas do Glue, Kinesis e OpenSearch.
- Estudo dos conceitos cobrados em certificações.

O Console AWS local não substitui uma conta da AWS para:

- **IAM aplicado.** Usuários, funções e políticas são criados, mas as políticas não são avaliadas.
- **EC2, VPC, ECS e EKS.** Os recursos são registrados, mas nenhuma máquina ou contêiner é executado e não há
  tráfego de rede.
- **Modelos de IA.** Bedrock, Rekognition, Textract e serviços semelhantes devolvem respostas de exemplo.
- **Treinamento no console oficial.** As telas seguem o estilo do console da AWS, mas não são idênticas.

## Início rápido

Pré-requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/) e cerca de 3 GB de memória livre
(o emulador usa até 2 GB). Testado em macOS com Apple Silicon. A imagem também é construída para x86_64, mas não foi
testada nessa arquitetura.

```bash
git clone https://github.com/DanielRoberto72/aws-console-local.git
cd aws-console-local
docker compose up -d --build
```

O primeiro build baixa o pacote do AWS Emulator, de cerca de 190 MB.

| Componente | Endereço |
| --- | --- |
| Console | http://127.0.0.1:8080 |
| Endpoint do emulador (AWS CLI e SDKs) | `https://127.0.0.1:9297` |
| Postgres da persistência | `127.0.0.1:5433` (usuário, senha e banco: `console`) |
| Endpoints locais de bancos, caches e brokers | `127.0.0.1:4510-4549` |

Para recomeçar do zero, apague o volume do banco:

```bash
docker compose down -v
```

## Usar o emulador com a AWS CLI e os SDKs

O emulador roda com a autenticação desligada (`-a off`): as requisições não precisam de assinatura SigV4 e qualquer
credencial é aceita. O certificado TLS é autoassinado e muda a cada início do emulador.

```bash
export AWS_ENDPOINT_URL=https://127.0.0.1:9297
export AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local
aws --no-verify-ssl s3 ls
```

Para SDKs que validam o certificado, copie o CA atual do container. Repita depois de cada reinício do emulador.

```bash
docker compose exec emulator cat /home/emulator/.aws/emulator/9297/ca.pem > /tmp/aws-emulator-ca.pem
export AWS_CA_BUNDLE=/tmp/aws-emulator-ca.pem        # AWS CLI, boto3, Go
export NODE_EXTRA_CA_CERTS=/tmp/aws-emulator-ca.pem  # SDK para JavaScript v3
```

No S3, use endereçamento path-style (`forcePathStyle: true` no SDK para JavaScript).

## Serviços

### Serviços com telas dedicadas

| Categoria | Serviço | Operações |
| --- | --- | --- |
| Computação | **Lambda** | Criar funções (Python e Node.js), editar e implantar código ou .zip, testar com evento e ver a saída do log, variáveis de ambiente |
| Armazenamento | **S3** | Buckets, pastas, upload e download, esvaziar |
| Armazenamento | **S3 Vectors** | Buckets e índices de vetores, inserir vetores com metadados, busca por similaridade |
| Banco de dados | **DynamoDB** | Tabelas e itens (DynamoDB JSON) |
| Integração | **SQS** | Filas padrão e FIFO, enviar, receber e excluir mensagens |
| Integração | **SNS** | Tópicos, assinaturas (SQS, Lambda, HTTP, e-mail) com política de filtro, publicar |
| Integração | **EventBridge** | Barramentos, regras (padrão ou agendamento), destinos, enviar eventos |
| Integração | **EventBridge Scheduler** | Agendamentos únicos ou recorrentes, habilitar e desabilitar |
| Integração | **Step Functions** | Máquinas de estado, editar definição, iniciar execuções, histórico de eventos |
| Gerenciamento | **CloudWatch Logs** | Grupos e fluxos de logs, retenção, eventos (atualizados a cada 5 s) |
| Gerenciamento | **Systems Manager** | Parameter Store (String, StringList, SecureString) |
| Segurança | **IAM** | Usuários (grupos, permissões, chaves de acesso), grupos de usuários, funções (entidades confiáveis, política de confiança) e políticas gerenciadas com versões |
| Segurança | **Secrets Manager** | Segredos, recuperar e editar o valor |
| Machine Learning | **Bedrock** | Catálogo de modelos e playground de chat, sem inferência real |

### Serviços do catálogo

Os demais serviços vêm de um catálogo genérico. Cada tipo de recurso declara no servidor como é listado, criado,
excluído e persistido, e quais ações aceita. A partir dessa declaração são gerados a tabela, o formulário, a página
de detalhe (com subrecursos e ações) e a persistência.

| Categoria | Serviço | Funciona no emulador | Apenas registrado |
| --- | --- | --- | --- |
| Computação | **EC2**, **EC2 Auto Scaling** | API de instâncias, VPCs, sub-redes, grupos de segurança, pares de chaves e modelos de execução; o grupo do Auto Scaling lança instâncias | Nenhuma máquina é executada |
| Contêineres | **ECS**, **ECR**, **EKS** | Clusters, definições de tarefa, serviços, repositórios | Contêineres e Kubernetes não são executados |
| Armazenamento | **EFS** | Sistemas de arquivos | Sem montagem NFS |
| Banco de dados | **RDS** | **PostgreSQL 18** com SQL; MySQL 8.4 e MariaDB 11.4 aceitam conexão | - |
| Banco de dados | **ElastiCache** | **Redis e Valkey** | Memcached |
| Redes | **API Gateway** | **APIs HTTP com rotas para Lambda**, com teste pelo console | APIs REST |
| Redes | **Elastic Load Balancing**, **Route 53** | Balanceadores, grupos de destino, listeners, zonas e registros | Sem encaminhamento de tráfego nem resolução DNS |
| Análise | **Athena** + **Glue** | **Consultas SQL**, inclusive sobre tabelas do Glue no S3 | - |
| Análise | **Kinesis**, **Data Firehose** | **Envio e leitura de registros** | - |
| Análise | **OpenSearch**, **Redshift**, **MSK (Kafka)** | **Endpoints reais**: API REST do OpenSearch, SQL no Redshift, brokers Kafka | - |
| Integração | **Amazon MQ** | **Brokers RabbitMQ e ActiveMQ** | - |
| Front-end | **AppSync** | **Endpoint GraphQL**, schema, chaves de API | Resolvers |
| Gerenciamento | **CloudWatch** | Métricas (publicar e consultar), alarmes (com estado de teste), painéis | - |
| Gerenciamento | **CloudFormation** | **Criação dos recursos da stack** nos serviços emulados | - |
| Segurança | **Cognito** | **Login com tokens JWT**, com teste pelo console | - |
| Segurança | **KMS** | **Criptografia e descriptografia** | - |
| Segurança | **WAF** | ACLs da web e conjuntos de IPs | Sem filtragem de tráfego |
| Machine Learning | **Comprehend**, **Translate**, **Polly**, **Rekognition**, **Textract**, **Transcribe** | Formato das respostas da AWS | Conteúdo de exemplo, sem modelos |

A página inicial mostra o uso consolidado, o estado do emulador e a atividade recente.

### Comportamento dos serviços

- **Lambda** executa o código das funções (Python e Node.js testados) e envia os logs para o CloudWatch Logs.
- **Integrações** entregam de verdade: SNS para SQS e Lambda, EventBridge para SQS e Lambda, Step Functions para
  Lambda. Como na AWS, as entregas exigem permissões de recurso. Assim como no console da AWS, elas são criadas ao
  assinar um tópico ou adicionar um destino: a política da fila e a permissão de invocar a função.
- **IAM** registra usuários, grupos, funções e políticas, mas não bloqueia requisições. Com a autenticação desligada,
  toda chamada é feita como o usuário embutido `emulator` e as políticas não são avaliadas. O catálogo de 139
  políticas gerenciadas pela AWS vem do emulador.
- **Funções padrão do IAM.** Alguns serviços exigem uma função que confie neles. Quando o campo fica em branco, uma
  função padrão é criada uma vez: `aws-console-local-lambda`, `aws-console-local-scheduler`,
  `aws-console-local-stepfunctions`, `aws-console-local-eks` e `aws-console-local-firehose`.
- **Bedrock** não executa modelos. `Converse` responde sempre um texto padrão, com contagem de tokens. Serve para
  validar o formato das chamadas, não o conteúdo.
- **S3 Vectors** calcula distâncias reais. Os embeddings precisam ser gerados fora do emulador.

## Endpoints locais

Bancos, caches e brokers abrem portas dentro do container do emulador, e essas portas mudam a cada reinício. O
serviço `app` repassa cada endpoint para uma porta fixa do host, na faixa `127.0.0.1:4510-4549`. A porta aparece na
coluna **Endpoint local** da lista e no detalhe do recurso.

```bash
psql -h localhost -p 4510 -U admin1 -d app
```

- A porta é guardada no Postgres por serviço, tipo e nome do recurso, e se mantém depois de reiniciar o emulador ou o
  `app`. A nova porta interna é seguida em até 15 s, ou na hora em que a lista do serviço é aberta no console.
- Conexões abertas são encerradas quando o emulador reinicia. Reconecte na mesma porta.
- Com as 40 portas ocupadas, um novo endpoint reaproveita a porta do recurso inativo visto há mais tempo. Para ampliar
  a faixa, altere `FORWARD_PORTS` e o mapeamento `ports` do serviço `app` no `docker-compose.yml`.
- O OpenSearch responde HTTPS com o certificado do emulador (use `-k` no curl).
- **Kafka não é repassado.** O cliente recebe dos brokers o endereço interno (`emulator:porta`) e não consegue segui-lo
  a partir do host. Use o Kafka de dentro da rede do Docker Compose.
- Fora do Docker Compose (`npm run dev:server`), o repasse fica desligado.

## Persistência

O AWS Emulator guarda o estado apenas em memória e não tem opção de salvar nem restaurar. A persistência funciona
assim:

1. A cada 15 s, e logo após cada ação no console, o estado do emulador é copiado para o Postgres. Isso inclui recursos
   criados fora do console.
2. Cada instância do emulador é identificada pelo fingerprint do certificado TLS, que muda a cada início. Quando uma
   instância nova é detectada, todo o estado salvo é recriado nela.
3. Enquanto a instância atual não é restaurada, nada é copiado do emulador para o banco. Assim, um emulador
   recém-iniciado e vazio não apaga os dados salvos. Se a restauração falhar, o erro aparece na página inicial e a
   restauração é repetida no ciclo seguinte.

| Serviço | Salvo | Não salvo |
| --- | --- | --- |
| IAM | Usuários, grupos, funções, políticas gerenciadas pelo cliente e seus vínculos | Chaves de acesso, versões antigas de políticas |
| S3 | Buckets e objetos (conteúdo e content-type) | Políticas, versionamento, tags, CORS |
| DynamoDB | Tabelas (chaves, índices, modo de capacidade, streams) e itens | TTL, backups, tags |
| SQS | Filas e atributos, incluindo política e redrive policy (DLQ) | Mensagens |
| Lambda | Configuração, pacote de código e permissões concedidas a serviços | Versões, aliases, camadas, imagens |
| CloudWatch Logs | Grupos de logs e retenção | Eventos de log |
| SNS | Tópicos e assinaturas confirmadas (com filtro e entrega bruta) | Assinaturas pendentes (por exemplo, e-mail) |
| Secrets Manager | Valor atual e descrição | Versões anteriores, rotação |
| Parameter Store | Valor atual, tipo e descrição | Histórico de versões |
| EventBridge | Barramentos personalizados, regras e destinos | Arquivos e replays |
| Scheduler | Grupos e agendamentos | - |
| Step Functions | Definição, tipo e função | Histórico de execuções |
| S3 Vectors | Buckets, índices e vetores com metadados | - |
| Bedrock | Nada (não há estado; o catálogo é fixo) | - |
| Catálogo (EC2, RDS, Cognito, KMS etc.) | Configuração de cada recurso e as referências entre eles | Dados dentro de bancos, caches, streams e índices; material das chaves do KMS; métricas; trabalhos do Transcribe |

A restauração segue a ordem de dependência: IAM (políticas, grupos, usuários e funções), depois as stacks do
CloudFormation (que recriam os próprios recursos), depois filas e funções Lambda, em seguida os recursos que apontam
para eles (assinaturas, regras, agendamentos) e, por fim, o catálogo.

No catálogo, recursos identificados por ID gerado (instâncias, VPCs, grupos de usuários do Cognito, chaves do KMS,
zonas) voltam com IDs novos. O ID antigo é mapeado para o novo e as referências são corrigidas: a sub-rede volta na
VPC recriada, a instância na sub-rede recriada, o alias do KMS aponta para a chave nova e os registros voltam na zona
nova. Recursos criados por outro serviço (com tags `aws:`, como os de uma stack ou as instâncias de um grupo do Auto
Scaling) não são salvos separadamente, para não serem duplicados.

## Limitações conhecidas

- Alterações feitas nos últimos segundos antes de uma queda do emulador podem ser perdidas (janela de até 15 s,
  configurável com `SYNC_INTERVAL_MS`).
- Datas de criação, ARNs e URLs são os gerados pelo emulador na restauração.
- IDs gerados mudam na restauração (instâncias, client ID do Cognito, ID da chave do KMS, ID da API). Prefira nomes e
  aliases nas aplicações.
- O snapshot faz um scan completo das tabelas e só baixa objetos do S3 novos ou alterados. É adequado a volumes de
  desenvolvimento, não a gigabytes de dados.
- Upload pelo console: até 200 MB por arquivo no S3 e 50 MB por pacote .zip no Lambda.
- Chaves de acesso do IAM não são recriadas depois de um reinício: o emulador não aceita recriar uma chave com o mesmo
  segredo. Como as assinaturas não são verificadas, qualquer credencial continua funcionando.
- Uma política gerenciada pelo cliente volta só com a versão padrão, como v1. Ao salvar a sexta versão, a mais antiga
  que não seja a padrão é descartada (o console da AWS pergunta qual).
- O usuário embutido `emulator` aparece na lista, mas não é salvo nem pode ser excluído.
- Senhas que a API não devolve (RDS, Redshift, MQ, usuários do Cognito) são guardadas quando criadas ou alteradas pelo
  console. Recursos criados fora do console voltam com a senha `ConsoleLocal123` (RDS e Redshift) ou sem senha
  (Cognito).
- Dados criptografados com o KMS antes de um reinício não podem mais ser descriptografados: a chave volta com material
  novo.
- Se um recurso do catálogo não puder ser recriado, os demais continuam e a falha aparece na atividade recente
  (`Restore:<tipo>`). O recurso não é recriado de novo, para evitar duplicar recursos identificados por ID.
- O editor de código do Lambda mostra só arquivos de texto. Se o pacote tiver binários, implantar pelo editor gera um
  pacote sem eles. Nesse caso, use **Carregar .zip** (o console exibe um aviso).

## Telemetria

O AWS Emulator coleta e envia dados de uso para a AWS por padrão. Neste projeto a telemetria vem desligada: o
emulador inicia com `-t off` e com `EMULATOR_TELEMETRY=off` (veja `docker-compose.yml` e `emulator/Dockerfile`). Para
ligá-la, remova as duas configurações. Para detalhes sobre o que é coletado, veja
[Telemetry in AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/telemetry.html).

## Desenvolvimento

Pré-requisito adicional: Node.js 24.

```bash
npm install
docker compose up -d emulator db
DATABASE_URL=postgres://console:console@127.0.0.1:5433/console npm run dev:server
npm run dev:web    # http://127.0.0.1:5173, com proxy de /api para a porta 8080
```

Validação:

```bash
npm run typecheck
npm test
./scripts/check-persistence.sh   # ponta a ponta, contra a stack do Docker Compose
```

## Estrutura do repositório

```
.
├── docker-compose.yml       # emulador, Postgres e app
├── Dockerfile               # app: API (Fastify) e frontend compilado
├── emulator/Dockerfile      # imagem do AWS Emulator (no macOS ele só roda em container)
├── server/src/
│   ├── <serviço>/           # por serviço: operações no emulador (*Service), rotas HTTP e persistência (*Sync)
│   ├── iam/                 # usuários, grupos, funções e políticas; funções padrão
│   ├── permissions/         # permissões de entrega (política da fila, permissão de invocar função)
│   ├── db/                  # esquema e espelho genérico para serviços sem tabela própria
│   ├── catalog/             # catálogo genérico: tipos, rotas, persistência com remapeamento de IDs
│   │   └── services/        # definições dos serviços do catálogo (EC2, RDS, Cognito, KMS...)
│   ├── forwarding/          # repasse TCP das portas internas do emulador para portas fixas do host
│   ├── sync/                # monitor que decide entre restaurar e espelhar
│   └── overview/ activity/  # uso consolidado e histórico de ações
├── web/src/
│   ├── layout/              # TopNavigation, SideNavigation, breadcrumbs e notificações
│   └── pages/               # telas por serviço; pages/catalog/ tem as telas genéricas do catálogo
└── scripts/                 # verificação de ponta a ponta da persistência
```

## Adicionar um serviço

**Serviço do catálogo** (só configuração): declare-o em `server/src/catalog/services/`, com tipos que definem `list`,
`create`, `remove`, `actions` e `persist`. Se o recurso abrir uma porta, defina `forward` com o atributo do endpoint.
Registre o serviço em `server/src/catalog/index.ts` e em `server/src/catalog/ids.ts`. Rotas, telas, navegação e
persistência são geradas a partir da declaração.

**Serviço com telas dedicadas:** crie o módulo em `server/src/<serviço>/` com o service, as rotas e um `SyncAdapter`
(use o `ResourceStore` se não precisar de consultas próprias). Registre-o em `server/src/app.ts` na posição certa da
ordem de restauração. Crie as páginas em `web/src/pages/<serviço>/` e a entrada em `web/src/layout/services.ts`.

## Licença

Este projeto é licenciado sob a licença MIT. Veja [LICENSE](LICENSE). O AWS Emulator não faz parte deste repositório:
a imagem `emulator/Dockerfile` baixa o pacote oficial durante o build, e o emulador segue a própria licença.
