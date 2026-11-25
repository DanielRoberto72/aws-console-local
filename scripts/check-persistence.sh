#!/usr/bin/env bash
# Verificação de ponta a ponta da persistência, contra a stack do docker compose.
# Cria recursos pelo painel e pela AWS CLI, reinicia o emulador (que perde tudo
# da memória) e confere que o painel recriou os recursos e os dados.
set -euo pipefail

API=${API:-http://127.0.0.1:8080/api}
RUN_ID=$(date +%s)
BUCKET="check-$RUN_ID"
TABLE="check-$RUN_ID"
QUEUE="check-$RUN_ID"
DLQ="check-dlq-$RUN_ID"
FN="check-fn-$RUN_ID"
TOPIC="check-topic-$RUN_ID"
SNS_QUEUE="check-sns-$RUN_ID"
SECRET="check/$RUN_ID"
PARAM="/check/$RUN_ID"
BUS="check-bus-$RUN_ID"
SCHEDULE="check-sched-$RUN_ID"
MACHINE="check-sfn-$RUN_ID"
VBUCKET="check-vec-$RUN_ID"
IAM_NAME="check-$RUN_ID"
IAM_POLICY_ARN="arn:aws:iam::000000000000:policy/$IAM_NAME"
IAM_DOC='{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:GetObject\",\"Resource\":\"*\"}]}'

export AWS_ENDPOINT_URL=https://127.0.0.1:9297 AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=x AWS_REGION=us-east-1
unset AWS_PROFILE AWS_SESSION_TOKEN
# O certificado do emulador muda a cada início, por isso a CLI roda sem verificar TLS aqui.
aws_cli() { aws --no-verify-ssl "$@" 2>/dev/null; }

fail() { echo "FALHA: $*" >&2; exit 1; }
step() { echo "==> $*"; }
api() { curl -sS -f "$@"; }
post() { local path=$1; shift; curl -sS -f -X POST -H 'content-type: application/json' "$API$path" -d "$@"; }

wait_for() {
  local description=$1; shift
  for _ in $(seq 1 60); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "tempo esgotado esperando: $description"
}

snapshot_after() { api "$API/status" | python3 -c "import sys,json; s=json.load(sys.stdin); sys.exit(0 if (s['lastSnapshotAt'] or '') > sys.argv[1] else 1)" "$1"; }
restored_after() { api "$API/status" | python3 -c "import sys,json; s=json.load(sys.stdin); sys.exit(0 if (s['lastRestoreAt'] or '') > sys.argv[1] else 1)" "$1"; }
now_iso() { python3 -c "import datetime; print(datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'))"; }

# Limpa tudo o que o teste criou, inclusive quando uma verificação falha no meio.
# Cada exclusão é independente: um recurso que já não existe não interrompe as demais.
cleanup() {
  local status=$?
  set +e
  echo "==> Limpando"
  python3 scripts/check-catalog.py cleanup "$RUN_ID" "$FN" 2>/dev/null
  post "/iam/users/$IAM_NAME/delete" "{}" >/dev/null
  post "/iam/groups/$IAM_NAME/delete" "{}" >/dev/null
  post "/iam/roles/$IAM_NAME/delete" "{}" >/dev/null
  post /iam/policies/delete "{\"arn\":\"$IAM_POLICY_ARN\"}" >/dev/null
  api -X DELETE "$API/scheduler/schedules/default/$SCHEDULE" >/dev/null
  api -X DELETE "$API/stepfunctions/state-machines/$MACHINE" >/dev/null
  api -X DELETE "$API/events/buses/$BUS/rules/regra" >/dev/null
  api -X DELETE "$API/events/buses/$BUS" >/dev/null
  api -X DELETE "$API/sns/topics/$TOPIC" >/dev/null
  api -X DELETE "$API/sqs/queues/$SNS_QUEUE" >/dev/null
  api -X DELETE "$API/lambda/functions/$FN" >/dev/null
  post /logs/groups/delete "{\"group\":\"/aws/lambda/$FN\"}" >/dev/null
  post /secrets/delete "{\"name\":\"$SECRET\"}" >/dev/null
  post /ssm/parameters/delete "{\"name\":\"$PARAM\"}" >/dev/null
  api -X DELETE "$API/s3vectors/buckets/$VBUCKET/indexes/idx" >/dev/null
  api -X DELETE "$API/s3vectors/buckets/$VBUCKET" >/dev/null
  api -X POST "$API/s3/buckets/$BUCKET/empty" >/dev/null
  api -X DELETE "$API/s3/buckets/$BUCKET" >/dev/null
  api -X DELETE "$API/dynamodb/tables/$TABLE" >/dev/null
  api -X DELETE "$API/sqs/queues/$QUEUE" >/dev/null
  api -X DELETE "$API/sqs/queues/$DLQ" >/dev/null
  rm -f "/tmp/check-$RUN_ID.txt"
  return $status
}
trap cleanup EXIT

step "Criando recursos pelo painel"
api -X POST "$API/s3/buckets" -H 'content-type: application/json' -d "{\"name\":\"$BUCKET\"}" >/dev/null
printf 'conteúdo de teste %s' "$RUN_ID" > "/tmp/check-$RUN_ID.txt"
api -X POST "$API/s3/buckets/$BUCKET/objects" -F prefix=docs/ -F "file=@/tmp/check-$RUN_ID.txt;type=text/plain" >/dev/null
api -X POST "$API/dynamodb/tables" -H 'content-type: application/json' \
  -d "{\"name\":\"$TABLE\",\"partitionKey\":{\"name\":\"pk\",\"type\":\"S\"},\"sortKey\":{\"name\":\"sk\",\"type\":\"N\"}}" >/dev/null
wait_for "tabela ativa" sh -c "curl -sf '$API/dynamodb/tables/$TABLE' | grep -q '\"status\":\"ACTIVE\"'"
api -X PUT "$API/dynamodb/tables/$TABLE/items" -H 'content-type: application/json' \
  -d '{"item":{"pk":{"S":"cliente#1"},"sk":{"N":"1"},"foto":{"B":"aGk="},"tags":{"SS":["a","b"]},"meta":{"M":{"ok":{"BOOL":true}}}}}' >/dev/null
api -X POST "$API/sqs/queues" -H 'content-type: application/json' -d "{\"name\":\"$DLQ\",\"fifo\":false}" >/dev/null

step "Criando recursos dos demais serviços"
post /lambda/functions "{\"name\":\"$FN\",\"runtime\":\"python3.12\",\"handler\":\"app.handler\",\"memorySize\":128,\"timeout\":5,\"environment\":{\"NOME\":\"persistida\"},\"code\":{\"files\":[{\"name\":\"app.py\",\"content\":\"import os\\ndef handler(event, context):\\n    return {'ola': os.environ['NOME']}\\n\"}]}}" >/dev/null
post /sqs/queues "{\"name\":\"$SNS_QUEUE\",\"fifo\":false}" >/dev/null
post /sns/topics "{\"name\":\"$TOPIC\",\"fifo\":false}" >/dev/null
post "/sns/topics/$TOPIC/subscriptions" "{\"protocol\":\"sqs\",\"endpoint\":\"arn:aws:sqs:us-east-1:000000000000:$SNS_QUEUE\",\"rawMessageDelivery\":true}" >/dev/null
post /secrets "{\"name\":\"$SECRET\",\"value\":{\"kind\":\"string\",\"value\":\"segredo-$RUN_ID\"}}" >/dev/null
post /ssm/parameters "{\"name\":\"$PARAM\",\"type\":\"SecureString\",\"value\":\"valor-$RUN_ID\"}" >/dev/null
post /events/buses "{\"name\":\"$BUS\"}" >/dev/null
post "/events/buses/$BUS/rules" "{\"name\":\"regra\",\"eventPattern\":\"{\\\"source\\\":[\\\"check\\\"]}\",\"state\":\"ENABLED\",\"targets\":[{\"id\":\"fila\",\"arn\":\"arn:aws:sqs:us-east-1:000000000000:$SNS_QUEUE\"}]}" >/dev/null
post /scheduler/schedules "{\"name\":\"$SCHEDULE\",\"group\":\"default\",\"expression\":\"rate(1 day)\",\"targetArn\":\"arn:aws:lambda:us-east-1:000000000000:function:$FN\",\"state\":\"ENABLED\"}" >/dev/null
post /stepfunctions/state-machines "{\"name\":\"$MACHINE\",\"type\":\"STANDARD\",\"definition\":\"{\\\"StartAt\\\":\\\"F\\\",\\\"States\\\":{\\\"F\\\":{\\\"Type\\\":\\\"Task\\\",\\\"Resource\\\":\\\"arn:aws:lambda:us-east-1:000000000000:function:$FN\\\",\\\"End\\\":true}}}\"}" >/dev/null
post /s3vectors/buckets "{\"name\":\"$VBUCKET\"}" >/dev/null
post "/s3vectors/buckets/$VBUCKET/indexes" '{"name":"idx","dimension":3,"distanceMetric":"cosine"}' >/dev/null
post "/s3vectors/buckets/$VBUCKET/indexes/idx/vectors" '{"vectors":[{"key":"gato","values":[1,0,0],"metadata":{"tipo":"animal"}},{"key":"carro","values":[0,0,1]}]}' >/dev/null

step "Criando identidades do IAM"
post /iam/policies "{\"name\":\"$IAM_NAME\",\"description\":\"politica de teste\",\"document\":\"$IAM_DOC\"}" >/dev/null
post /iam/groups "{\"name\":\"$IAM_NAME\",\"policyArns\":[\"$IAM_POLICY_ARN\"]}" >/dev/null
post /iam/users "{\"name\":\"$IAM_NAME\",\"path\":\"/check/\",\"groups\":[\"$IAM_NAME\"],\"policyArns\":[\"arn:aws:iam::aws:policy/ReadOnlyAccess\"]}" >/dev/null
curl -sS -f -X PUT -H 'content-type: application/json' "$API/iam/users/$IAM_NAME/inline" -d "{\"policyName\":\"extra\",\"document\":\"$IAM_DOC\"}" >/dev/null
post /iam/roles "{\"name\":\"$IAM_NAME\",\"description\":\"funcao de teste\",\"maxSessionDuration\":7200,\"trustPolicy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"lambda.amazonaws.com\\\"},\\\"Action\\\":\\\"sts:AssumeRole\\\"}]}\",\"policyArns\":[\"$IAM_POLICY_ARN\"]}" >/dev/null

step "Criando recursos do catálogo (EC2, RDS, Cognito, KMS, Route 53, API Gateway, CloudFormation, Glue)"
python3 scripts/check-catalog.py create "$RUN_ID" "$FN"

step "Criando recursos pela AWS CLI (fora do painel)"
aws_cli s3api put-object --bucket "$BUCKET" --key cli/via-cli.txt --body "/tmp/check-$RUN_ID.txt" >/dev/null
DLQ_ARN=$(aws_cli sqs get-queue-attributes --queue-url "$(aws_cli sqs get-queue-url --queue-name "$DLQ" --query QueueUrl --output text)" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)
aws_cli sqs create-queue --queue-name "$QUEUE" --attributes \
  "{\"VisibilityTimeout\":\"45\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" >/dev/null

step "Aguardando snapshot"
MARK=$(now_iso)
api -X POST "$API/sync" >/dev/null
wait_for "snapshot" snapshot_after "$MARK"

step "Reiniciando o emulador (estado em memória é perdido)"
MARK=$(now_iso)
docker compose restart emulator >/dev/null
wait_for "restauração" restored_after "$MARK"

step "Conferindo o que voltou"
api "$API/s3/buckets/$BUCKET/objects?prefix=docs/" | grep -q "docs/check-$RUN_ID.txt" || fail "objeto enviado pelo painel não voltou"
BODY=$(curl -sf "$API/s3/buckets/$BUCKET/download?key=docs/check-$RUN_ID.txt")
[ "$BODY" = "conteúdo de teste $RUN_ID" ] || fail "conteúdo do objeto difere: $BODY"
api "$API/s3/buckets/$BUCKET/objects?prefix=cli/" | grep -q "cli/via-cli.txt" || fail "objeto criado pela CLI não voltou"

ITEMS=$(api "$API/dynamodb/tables/$TABLE/items")
echo "$ITEMS" | grep -q '"foto":{"B":"aGk="}' || fail "item do DynamoDB não voltou com o binário: $ITEMS"
echo "$ITEMS" | grep -q '"tags":{"SS":\["a","b"\]}' || fail "set do DynamoDB não voltou: $ITEMS"
api "$API/dynamodb/tables/$TABLE" | grep -q '"sortKey":"sk"' || fail "chave de classificação não voltou"

QUEUE_ATTRS=$(api "$API/sqs/queues/$QUEUE")
echo "$QUEUE_ATTRS" | grep -q '"VisibilityTimeout":"45"' || fail "atributo da fila não voltou: $QUEUE_ATTRS"
echo "$QUEUE_ATTRS" | grep -q "deadLetterTargetArn" || fail "redrive policy da fila não voltou"

step "Conferindo os demais serviços"
post "/lambda/functions/$FN/invoke" '{"payload":"{}"}' | grep -q 'persistida' || fail "função Lambda não voltou com código e variáveis"
post "/sns/topics/$TOPIC/publish" '{"message":"sns-apos-restart"}' >/dev/null
wait_for "entrega SNS -> SQS" sh -c "curl -sf -X POST -H 'content-type: application/json' '$API/sqs/queues/$SNS_QUEUE/receive' -d '{\"waitSeconds\":1}' | grep -q 'sns-apos-restart'"
post /secrets/value "{\"name\":\"$SECRET\"}" | grep -q "segredo-$RUN_ID" || fail "segredo não voltou"
api "$API/ssm/parameters/detail?name=$PARAM" | grep -q "valor-$RUN_ID" || fail "parâmetro não voltou"
api "$API/events/buses/$BUS/rules/regra" | grep -q "$SNS_QUEUE" || fail "regra do EventBridge não voltou com o destino"
api "$API/scheduler/schedules/default/$SCHEDULE" | grep -q "aws-console-local-scheduler" || fail "agendamento não voltou"
ARN=$(post "/stepfunctions/state-machines/$MACHINE/executions" '{"input":"{}"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["executionArn"])')
wait_for "execução do Step Functions" sh -c "curl -sf -X POST -H 'content-type: application/json' '$API/stepfunctions/executions/describe' -d '{\"arn\":\"$ARN\"}' | grep -q '\"status\":\"SUCCEEDED\"'"
post "/s3vectors/buckets/$VBUCKET/indexes/idx/query" '{"values":[0.9,0.1,0],"topK":1}' | grep -q '"key":"gato"' || fail "vetores não voltaram"

IAM_USER=$(api "$API/iam/users/$IAM_NAME")
echo "$IAM_USER" | grep -q "\"groups\":\[\"$IAM_NAME\"\]" || fail "usuário do IAM não voltou no grupo: $IAM_USER"
echo "$IAM_USER" | grep -q '"path":"/check/"' || fail "caminho do usuário não voltou"
echo "$IAM_USER" | grep -q 'ReadOnlyAccess' || fail "política gerenciada pela AWS não voltou no usuário"
echo "$IAM_USER" | grep -q '"name":"extra"' || fail "política em linha do usuário não voltou"
api "$API/iam/groups/$IAM_NAME" | grep -q "$IAM_POLICY_ARN" || fail "política do grupo não voltou"
IAM_ROLE=$(api "$API/iam/roles/$IAM_NAME")
echo "$IAM_ROLE" | grep -q "$IAM_POLICY_ARN" || fail "política anexada à função não voltou"
echo "$IAM_ROLE" | grep -q '"description":"funcao de teste"' || fail "descrição da função não voltou"
echo "$IAM_ROLE" | grep -q '"maxSessionDuration":7200' || fail "duração da sessão da função não voltou"
api "$API/iam/policies/detail?arn=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$IAM_POLICY_ARN")" \
  | grep -q 's3:GetObject' || fail "documento da política não voltou"

step "Conferindo o catálogo (IDs remapeados, senha preservada, integrações)"
python3 scripts/check-catalog.py verify "$RUN_ID" "$FN"

echo "OK: recursos e dados sobreviveram ao reinício do emulador."
