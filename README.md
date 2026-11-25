<div align="center">

# ☁️ Console AWS local

**Um console no estilo da AWS, rodando 100% na sua máquina, em cima do AWS Emulator.**

![AWS Emulator](https://img.shields.io/badge/roda%20sobre-AWS%20Emulator-FF9900?logo=amazonwebservices&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Cloudscape](https://img.shields.io/badge/UI-Cloudscape-232F3E)
![Postgres](https://img.shields.io/badge/persist%C3%AAncia-Postgres-4169E1?logo=postgresql&logoColor=white)
![Serviços](https://img.shields.io/badge/servi%C3%A7os-45-success)
![Custo](https://img.shields.io/badge/custo-R%24%200-brightgreen)

</div>

> [!IMPORTANT]
> **Tudo aqui roda sobre o [AWS Emulator](https://github.com/aws/aws-emulator)**, o emulador local de serviços da
> AWS. Nenhuma chamada sai para a nuvem, nenhuma conta da AWS é usada e nada é cobrado. O emulador faz o trabalho
> pesado (executar Lambdas, subir bancos, entregar mensagens); este projeto é o **painel visual** e a
> **persistência** em volta dele.
>
> Projeto pessoal e não oficial: não tem ligação com a AWS. O comportamento é o do emulador, que pode diferir da
> AWS real em erros, limites e detalhes.

## 🎯 Para que serve

O AWS Emulator só tem API: sem tela, e com tudo guardado em memória. Este painel completa o que falta para usar o
emulador no dia a dia:

- **🖥️ Ver e mexer pela tela**: telas no estilo do console da AWS ([Cloudscape](https://cloudscape.design), em
  português) para criar, inspecionar e apagar recursos de 45 serviços, sem decorar comandos da CLI.
- **💾 Não perder nada**: o estado é espelhado num Postgres e recriado sozinho quando o emulador reinicia,
  incluindo o código das Lambdas, os objetos do S3 e os itens do DynamoDB.
- **🔌 Conectar do seu computador**: bancos e caches (RDS, ElastiCache, Redshift…) ganham uma porta fixa em
  `localhost`, que não muda entre reinícios.

### ✅ Bom para

- **Desenvolver e testar apps que usam AWS** sem conta e sem custo: aponte o SDK, a AWS CLI ou o Terraform para o
  emulador e acompanhe o resultado pela tela.
- **Labs de integração e serverless**: S3, Lambda, SQS, SNS, DynamoDB, EventBridge, Step Functions, API Gateway,
  Cognito, KMS e Secrets Manager funcionam de verdade, com as entregas entre eles.
- **Praticar dados**: SQL no RDS (PostgreSQL) e no Redshift, Redis, Athena sobre o Glue, Kinesis e OpenSearch.
- **Estudar os conceitos para certificações**, errando e recomeçando à vontade.

### 🚫 Não substitui uma conta real para

- **IAM aplicado**: dá para criar usuários, funções e políticas, mas com a autenticação desligada nada é bloqueado.
- **EC2, VPC, ECS e EKS**: os recursos são registrados, mas nenhuma máquina ou contêiner roda, e não há tráfego de rede.
- **IA de verdade**: Bedrock, Rekognition, Textract e afins devolvem respostas de exemplo.
- **Treinar o console oficial**: as telas imitam o estilo, mas não são idênticas às da AWS.

## 🚀 Começar em 1 minuto

Requer [Docker Desktop](https://www.docker.com/products/docker-desktop/) e uns 3 GB de memória livre (o emulador
usa até 2 GB). Testado em Mac com Apple Silicon; a imagem também é construída para x86_64, mas não foi testada lá.

```bash
git clone <url-deste-repositório> aws-console-local
cd aws-console-local
docker compose up -d --build
```

Abra **http://127.0.0.1:8080**. O primeiro build baixa o AWS Emulator (cerca de 190 MB). Detalhes de endpoints, CLI
e SDKs estão em [Subir](#subir) e [Usar o emulador nas suas apps](#usar-o-emulador-nas-suas-apps).

## 🧩 Serviços

| Categoria | Serviço | O que dá para fazer |
| --- | --- | --- |
| Computação | **Lambda** | Criar funções (Python/Node.js), editar e implantar código ou .zip, testar com evento e ver a saída do log, variáveis de ambiente |
| Armazenamento | **S3** | Buckets, pastas, upload/download, esvaziar |
| Armazenamento | **S3 Vectors** | Buckets e índices de vetores, inserir vetores com metadados, busca por similaridade |
| Banco de dados | **DynamoDB** | Tabelas e itens (DynamoDB JSON) |
| Integração | **SQS** | Filas padrão/FIFO, enviar, receber e excluir mensagens |
| Integração | **SNS** | Tópicos, assinaturas (SQS, Lambda, HTTP, e-mail) com política de filtro, publicar |
| Integração | **EventBridge** | Barramentos, regras (padrão ou agendamento), destinos, enviar eventos |
| Integração | **EventBridge Scheduler** | Agendamentos únicos ou recorrentes, habilitar/desabilitar |
| Integração | **Step Functions** | Máquinas de estado, editar definição, iniciar execuções, histórico de eventos |
| Gerenciamento | **CloudWatch Logs** | Grupos e fluxos de logs, retenção, eventos (atualizados a cada 5 s) |
| Gerenciamento | **Systems Manager** | Parameter Store (String, StringList, SecureString) |
| Segurança | **IAM** | Usuários (grupos, permissões, chaves de acesso), grupos de usuários, funções (entidades confiáveis, política de confiança) e políticas gerenciadas com versões |
| Segurança | **Secrets Manager** | Segredos, recuperar e editar o valor |
| Machine Learning | **Bedrock** | Catálogo de modelos e playground de chat (sem inferência real, veja abaixo) |

Os serviços acima têm telas próprias. Os demais vêm de um **catálogo genérico**: cada tipo de recurso
declara no servidor como listar, criar, excluir, agir e persistir, e o painel gera a tabela, o formulário,
a página de detalhe (com subrecursos e "Ações") e a persistência.

| Categoria | Serviço | O que funciona de verdade no emulador | Só registro (sem execução) |
| --- | --- | --- | --- |
| Computação | **EC2**, **EC2 Auto Scaling** | API completa de instâncias, VPCs, sub-redes, grupos de segurança, pares de chaves, modelos de execução; o grupo do Auto Scaling lança instâncias | Nenhuma máquina roda |
| Contêineres | **ECS**, **ECR**, **EKS** | Clusters, definições de tarefa, serviços, repositórios | Contêineres e Kubernetes não rodam |
| Armazenamento | **EFS** | Sistemas de arquivos | Não monta NFS |
| Banco de dados | **RDS** | **PostgreSQL 18 real** (SQL testado); MySQL 8.4 e MariaDB 11.4 sobem e respondem na porta | - |
| Banco de dados | **ElastiCache** | **Redis e Valkey reais** | Memcached |
| Redes | **API Gateway** | **APIs HTTP com rotas para Lambda** (botão "Testar") | APIs REST |
| Redes | **Elastic Load Balancing**, **Route 53** | Balanceadores, grupos de destino, listeners, zonas e registros | Não encaminha tráfego nem responde DNS |
| Análise | **Athena** + **Glue** | **Consultas SQL**, inclusive sobre tabelas do Glue no S3 | - |
| Análise | **Kinesis**, **Data Firehose** | **Enviar e ler registros** | - |
| Análise | **OpenSearch**, **Redshift**, **MSK (Kafka)** | **Endpoints reais** (REST do OpenSearch pelo botão "Executar requisição", SQL no Redshift, brokers Kafka) | - |
| Integração | **Amazon MQ** | **Broker RabbitMQ/ActiveMQ** | - |
| Front-end | **AppSync** | **Endpoint GraphQL**, schema, chaves de API | Resolvers |
| Gerenciamento | **CloudWatch** | Métricas (publicar e consultar), alarmes (com estado de teste), painéis | - |
| Gerenciamento | **CloudFormation** | **Cria de verdade os recursos da stack** nos serviços emulados | - |
| Segurança | **Cognito** | **Login com tokens JWT reais** ("Testar login") | - |
| Segurança | **KMS** | **Criptografar e descriptografar** | - |
| Segurança | **WAF** | ACLs da web e conjuntos de IPs | Não filtra tráfego |
| Machine Learning | **Comprehend**, **Translate**, **Polly**, **Rekognition**, **Textract**, **Transcribe** | Formato das respostas da AWS | Conteúdo é de exemplo: não há modelos |

A página inicial mostra o uso consolidado, o estado do emulador e a atividade recente.

### O que o emulador faz de verdade

- **Lambda executa o seu código** (Python e Node.js testados) e os logs vão para o CloudWatch Logs.
- **Integrações entregam de verdade**: SNS → SQS/Lambda, EventBridge → SQS/Lambda, Step Functions → Lambda.
  Como na AWS, isso exige permissões de recurso. O painel as cria sozinho, como o console:
  política da fila e permissão de invocar a função ao assinar um tópico ou adicionar um destino.
- **IAM guarda tudo, mas não bloqueia nada**: com a autenticação desligada, toda chamada é feita como o usuário
  embutido `emulator` e as políticas não são avaliadas. O catálogo de políticas gerenciadas pela AWS (139) vem do emulador.
- **Funções padrão do IAM**: o Scheduler exige uma função que confie nele. Quando o campo fica em branco, o painel cria
  (uma vez) `aws-console-local-lambda`, `aws-console-local-scheduler` e `aws-console-local-stepfunctions`.
- **Bedrock não roda modelos**: `Converse` responde sempre um texto padrão, com contagem de tokens.
  Serve para validar o formato das chamadas do seu código, não o conteúdo.
- **S3 Vectors** calcula distâncias reais; os embeddings precisam ser gerados fora do emulador.
- **Bancos, caches e brokers** (RDS, ElastiCache, Redshift, OpenSearch, MQ, AppSync) abrem portas dentro do
  emulador, que mudam a cada reinício. O app repassa cada endpoint para uma **porta fixa no Mac**, na faixa
  `127.0.0.1:4510-4549` (coluna "Endpoint no Mac"). Exemplo: `psql -h localhost -p 4510 -U admin1 -d app`.
  - A porta é guardada no Postgres por serviço, tipo e nome do recurso, e continua a mesma depois de reiniciar o
    emulador ou o app. A porta interna nova é seguida em até 15 s (o painel atualiza na hora ao abrir a lista).
  - Conexões abertas caem quando o emulador reinicia; reconecte na mesma porta.
  - Com as 40 portas ocupadas, a próxima reaproveita a do recurso inativo visto há mais tempo. Para mais portas, mude
    `FORWARD_PORTS` e o `ports` do serviço `app` no `docker-compose.yml`.
  - OpenSearch responde HTTPS com certificado do emulador (use `-k` no curl).
  - **Kafka não é repassado**: o cliente recebe dos brokers o endereço interno (`emulator:porta`) e não conseguiria
    segui-lo do Mac. Use-o de dentro do compose.
  - No modo de desenvolvimento (`npm run dev:server`, fora do compose) o repasse fica desligado.

## Subir

Requer Docker Desktop.

```bash
docker compose up -d --build
```

- Painel: http://127.0.0.1:8080
- Endpoint do emulador para suas apps e para a AWS CLI: `https://127.0.0.1:9297`
- Postgres: `127.0.0.1:5433` (usuário, senha e banco: `console`)

O primeiro build do emulador baixa um pacote de cerca de 190 MB.

## Usar o emulador nas suas apps

O emulador roda com `-a off` (sem assinatura SigV4): qualquer credencial funciona.
O certificado TLS é autoassinado e muda a cada início do emulador.

```bash
export AWS_ENDPOINT_URL=https://127.0.0.1:9297
export AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local
aws --no-verify-ssl s3 ls
```

Para SDKs que validam o certificado, copie o CA atual do container
(é preciso repetir depois de cada reinício do emulador):

```bash
docker compose exec emulator cat /home/emulator/.aws/emulator/9297/ca.pem > /tmp/aws-emulator-ca.pem
export AWS_CA_BUNDLE=/tmp/aws-emulator-ca.pem        # AWS CLI, boto3, Go
export NODE_EXTRA_CA_CERTS=/tmp/aws-emulator-ca.pem  # SDK JS v3
```

Para S3, use path-style (`forcePathStyle: true` no SDK JS).

## Como a persistência funciona

O AWS Emulator guarda tudo **só em memória**, sem opção de salvar ou restaurar.
O painel compensa assim:

1. A cada 15 s (e logo após cada ação no painel), o app copia o estado do emulador
   para o Postgres. Isso inclui recursos criados fora do painel, pela CLI ou pelas suas apps.
2. O app identifica cada instância do emulador pelo fingerprint do certificado TLS,
   que muda a cada início. Quando detecta uma instância nova, recria tudo a partir do banco.
3. Enquanto a instância atual não for restaurada, o app nunca copia o emulador para o banco.
   Assim, um emulador recém-iniciado e vazio não apaga os dados salvos. Se a restauração
   falhar, o erro aparece na página inicial e ela é tentada de novo no ciclo seguinte.

| Serviço         | O que é salvo                                                       | O que não é salvo                        |
| --------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| IAM             | Usuários, grupos, funções, políticas do cliente e o que se liga a eles | Chaves de acesso, versões antigas de políticas |
| S3              | Buckets e objetos (conteúdo e content-type)                         | Políticas, versionamento, tags, CORS     |
| DynamoDB        | Tabelas (chaves, índices, modo de capacidade, streams) e itens      | TTL, backups, tags                       |
| SQS             | Filas e atributos, incluindo política e redrive policy (DLQ)        | Mensagens (são transitórias)             |
| Lambda          | Configuração, pacote de código e permissões concedidas a serviços   | Versões, aliases, camadas, imagens       |
| CloudWatch Logs | Grupos de logs e retenção                                           | Eventos de log                           |
| SNS             | Tópicos e assinaturas confirmadas (com filtro e entrega bruta)      | Assinaturas pendentes (ex.: e-mail)      |
| Secrets Manager | Valor atual e descrição                                             | Versões anteriores, rotação              |
| Parameter Store | Valor atual, tipo e descrição                                       | Histórico de versões                     |
| EventBridge     | Barramentos personalizados, regras e destinos                       | Arquivos e replays                       |
| Scheduler       | Grupos e agendamentos                                               | -                                        |
| Step Functions  | Definição, tipo e papel                                             | Histórico de execuções                   |
| S3 Vectors      | Buckets, índices e vetores com metadados                            | -                                        |
| Bedrock         | Nada (não há estado; o catálogo é fixo)                             | -                                        |
| Catálogo (EC2, RDS, Cognito, KMS etc.) | Configuração de cada recurso, para recriá-lo, e as ligações entre eles | Dados dentro de bancos, caches, streams e índices; material das chaves do KMS; métricas; trabalhos do Transcribe |

A restauração segue a ordem de dependência: IAM (políticas, grupos, usuários e funções), depois as stacks do
CloudFormation (que recriam os próprios recursos), depois filas e funções Lambda, quem aponta para eles (assinaturas,
regras, agendamentos) e por fim o catálogo.

No catálogo, recursos identificados por ID gerado (instâncias, VPCs, grupos do Cognito, chaves do KMS, zonas) voltam
com **IDs novos**. O painel guarda o ID antigo e corrige as referências: a sub-rede volta na VPC recriada, a instância
na sub-rede recriada, o alias do KMS aponta para a chave nova, os registros voltam na zona nova. Recursos criados por
outro serviço (com tags `aws:`, como os de uma stack ou as instâncias de um grupo do Auto Scaling) não são salvos à
parte, para não duplicar.

Limites conhecidos:

- Alterações feitas nos últimos segundos antes de uma queda do emulador podem se perder
  (janela de até 15 s; ajuste com `SYNC_INTERVAL_MS`).
- Datas de criação, ARNs de recursos e URLs são os gerados pelo emulador na restauração.
- O snapshot faz um scan completo das tabelas e só baixa objetos S3 novos ou alterados.
  Funciona bem para volumes de desenvolvimento, não para gigabytes de dados.
- Upload pelo painel: até 200 MB por arquivo no S3 e 50 MB por pacote .zip no Lambda.
- Chaves de acesso do IAM não voltam depois de um reinício: o emulador não aceita recriar uma chave com o mesmo
  segredo. Como ele não verifica assinaturas, o seu código continua funcionando com qualquer credencial.
- Uma política do cliente volta só com a versão padrão, como v1. Ao salvar a sexta versão, o painel descarta a mais
  antiga que não seja a padrão (o console pergunta qual).
- O usuário embutido `emulator` aparece na lista, mas não é salvo nem pode ser excluído.
- IDs gerados mudam na restauração (instâncias, client ID do Cognito, ID da chave do KMS, ID da API): use nomes e
  aliases nas suas apps.
- Senhas que a API não devolve (RDS, Redshift, MQ, usuários do Cognito) são guardadas quando criadas ou alteradas pelo
  painel. Recursos criados fora do painel voltam com a senha `ConsoleLocal123` (RDS e Redshift) ou sem senha (Cognito).
- Dados criptografados com o KMS antes de um reinício não podem mais ser descriptografados: a chave volta com material novo.
- Se um recurso do catálogo não puder ser recriado, os demais seguem e a falha aparece na atividade recente
  (`Restore:<tipo>`). Ele não é tentado de novo, para não duplicar recursos identificados por ID.
- O editor de código do Lambda mostra só arquivos de texto. Se o pacote tiver binários, implantar
  pelo editor gera um pacote sem eles; nesse caso use "Carregar .zip" (o painel avisa).

Para recomeçar do zero: `docker compose down -v` (apaga o volume do banco).

## Desenvolvimento

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
./scripts/check-persistence.sh   # ponta a ponta, contra a stack do compose
```

## Estrutura

```
emulator/Dockerfile      imagem do AWS Emulator (no macOS ele só roda em container)
server/src/
  <serviço>/             por serviço: operações no emulador (*Service), rotas HTTP e persistência (*Sync)
  iam/                   usuários, grupos, funções e políticas; funções padrão criadas pelo painel
  permissions/           permissões de entrega (política da fila, permissão de invocar função)
  db/resourceStore.ts    espelho genérico usado pelos serviços sem tabela própria
  catalog/               catálogo genérico: tipos, rotas, persistência com remapeamento de IDs
  catalog/services/      definições dos serviços do catálogo (EC2, RDS, Cognito, KMS...)
  forwarding/            repasse TCP das portas internas do emulador para portas fixas no Mac
  sync/                  monitor que decide entre restaurar e espelhar
  overview/ activity/    uso consolidado e histórico de ações do painel
web/src/
  layout/                TopNavigation, SideNavigation, breadcrumbs e notificações
  pages/                 telas por serviço, com componentes Cloudscape
  pages/catalog/         telas genéricas do catálogo (lista, detalhe, ações, ferramentas)
scripts/                 verificação de ponta a ponta da persistência
```

Para adicionar um serviço só de configuração: declare-o em `server/src/catalog/services/` (tipos com `list`,
`create`, `remove`, `actions` e `persist`; `forward` com o atributo do endpoint, se ele abrir uma porta) e registre-o em `server/src/catalog/index.ts` e `catalog/ids.ts`.
Rotas, telas, navegação e persistência saem prontas.

Para um serviço com telas próprias: crie o módulo em `server/src/<serviço>/` com service,
rotas e um `SyncAdapter` (use o `ResourceStore` se não precisar de consultas próprias);
registre-o em `server/src/app.ts` na posição certa da ordem de restauração; crie as
páginas em `web/src/pages/<serviço>/` e a entrada em `web/src/layout/services.ts`.
