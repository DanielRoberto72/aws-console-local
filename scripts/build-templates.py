#!/usr/bin/env python3
"""Gera os modelos de laboratório (server/templates/*.json) a partir da stack em execução.

Cada modelo é montado num ambiente vazio pela API do console, como um usuário faria,
e exportado. O ambiente atual é exportado antes e importado de volta no final, mesmo
se algo falhar. Rode de novo quando o formato do que é salvo no banco mudar.

    docker compose up -d --build
    python3 scripts/build-templates.py
"""

import gzip
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = os.environ.get("API", "http://127.0.0.1:8080/api")
OUT = Path(__file__).resolve().parent.parent / "server" / "templates"
ACCOUNT = "000000000000"
REGION = "us-east-1"


def call(method, path, body=None, raw=None, content_type=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    headers = {"content-type": content_type or "application/json"} if data is not None else {}
    req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            payload = res.read()
    except urllib.error.HTTPError as err:
        sys.exit(f"FALHA: {method} {path} -> HTTP {err.code}: {err.read().decode(errors='replace')}")
    return payload


def post(path, body):
    return call("POST", path, body)


def put(path, body):
    return call("PUT", path, body)


def status():
    return json.loads(call("GET", "/status"))


def wait_until(description, check, timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if check():
            return
        time.sleep(2)
    sys.exit(f"FALHA: tempo esgotado esperando {description}")


def replace_and_wait(action):
    """Substitui o ambiente e espera o emulador reiniciar e receber o estado salvo."""
    before = status()["lastRestoreAt"]
    action()
    wait_until(
        "o emulador reiniciar",
        lambda: (s := status())["phase"] == "idle" and s["emulator"] == "online" and s["lastRestoreAt"] != before,
    )


def reset():
    replace_and_wait(lambda: post("/environment/reset", {}))


def import_file(content):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"ambiente.json.gz\"\r\n"
        "Content-Type: application/gzip\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    replace_and_wait(lambda: call("POST", "/environment/import", raw=body, content_type=f"multipart/form-data; boundary={boundary}"))


def upload(bucket, prefix, name, content, content_type):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"prefix\"\r\n\r\n{prefix}\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + content.encode() + f"\r\n--{boundary}--\r\n".encode()
    call("POST", f"/s3/buckets/{bucket}/objects", raw=body, content_type=f"multipart/form-data; boundary={boundary}")


def aws(*args):
    """AWS CLI direto no emulador, para o que o console não configura (ex.: DLQ da fila)."""
    env = {
        **os.environ,
        "AWS_ENDPOINT_URL": "https://127.0.0.1:9297",
        "AWS_ACCESS_KEY_ID": "x",
        "AWS_SECRET_ACCESS_KEY": "x",
        "AWS_REGION": REGION,
    }
    env.pop("AWS_PROFILE", None)
    out = subprocess.run(["aws", "--no-verify-ssl", "--output", "json", *args], env=env, check=True, capture_output=True, text=True)
    return json.loads(out.stdout) if out.stdout.strip() else None


def sqs_arn(name):
    return f"arn:aws:sqs:{REGION}:{ACCOUNT}:{name}"


def lambda_arn(name):
    return f"arn:aws:lambda:{REGION}:{ACCOUNT}:function:{name}"


def python_function(name, code, environment=None, description=None):
    body = {
        "name": name,
        "runtime": "python3.12",
        "handler": "app.handler",
        "memorySize": 128,
        "timeout": 10,
        "code": {"files": [{"name": "app.py", "content": code}]},
    }
    if environment:
        body["environment"] = environment
    if description:
        body["description"] = description
    post("/lambda/functions", body)


# --- Modelos ---------------------------------------------------------------------------


def fan_out_de_pedidos():
    """SNS distribuindo pedidos para filas SQS (uma com DLQ) e para uma função Lambda."""
    post("/sqs/queues", {"name": "estoque-dlq", "fifo": False})
    post("/sqs/queues", {"name": "faturamento", "fifo": False, "visibilityTimeout": 30})
    url = aws("sqs", "create-queue", "--queue-name", "estoque", "--attributes", json.dumps({
        "VisibilityTimeout": "30",
        "RedrivePolicy": json.dumps({"deadLetterTargetArn": sqs_arn("estoque-dlq"), "maxReceiveCount": "3"}),
    }))["QueueUrl"]
    assert url
    python_function(
        "registrar-pedido",
        "import json\n\n"
        "def handler(event, context):\n"
        "    for record in event.get('Records', []):\n"
        "        pedido = json.loads(record['Sns']['Message'])\n"
        "        print(f\"Pedido {pedido.get('id')} recebido: {pedido}\")\n"
        "    return {'processados': len(event.get('Records', []))}\n",
        description="Registra no log cada pedido publicado no tópico pedidos",
    )
    post("/sns/topics", {"name": "pedidos", "fifo": False, "displayName": "Pedidos da loja"})
    for queue in ("faturamento", "estoque"):
        post("/sns/topics/pedidos/subscriptions", {"protocol": "sqs", "endpoint": sqs_arn(queue), "rawMessageDelivery": True})
    post("/sns/topics/pedidos/subscriptions", {"protocol": "lambda", "endpoint": lambda_arn("registrar-pedido")})


def catalogo_de_produtos():
    """Dados prontos para consultar: tabela DynamoDB, bucket S3, parâmetros e segredo."""
    post("/dynamodb/tables", {"name": "produtos", "partitionKey": {"name": "id", "type": "S"}})
    wait_until("a tabela produtos ficar ativa", lambda: b'"status":"ACTIVE"' in call("GET", "/dynamodb/tables/produtos"))
    produtos = [
        ("p-001", "Caneca de cerâmica", "cozinha", "39.90", 120),
        ("p-002", "Camiseta básica", "vestuario", "59.90", 45),
        ("p-003", "Garrafa térmica", "cozinha", "89.00", 0),
        ("p-004", "Mochila de notebook", "acessorios", "199.90", 12),
        ("p-005", "Caderno pontilhado", "papelaria", "29.50", 300),
    ]
    for pid, nome, categoria, preco, estoque in produtos:
        put("/dynamodb/tables/produtos/items", {"item": {
            "id": {"S": pid},
            "nome": {"S": nome},
            "categoria": {"S": categoria},
            "preco": {"N": preco},
            "estoque": {"N": str(estoque)},
            "imagem": {"S": f"s3://catalogo-imagens/produtos/{pid}.svg"},
        }})
    post("/s3/buckets", {"name": "catalogo-imagens"})
    for pid, nome, *_ in produtos:
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">'
            f'<rect width="200" height="120" fill="#e8f0fe"/><text x="100" y="65" font-size="14" text-anchor="middle">{nome}</text></svg>'
        )
        upload("catalogo-imagens", "produtos/", f"{pid}.svg", svg, "image/svg+xml")
    upload("catalogo-imagens", "", "LEIAME.txt", "Imagens dos produtos da tabela DynamoDB produtos.\n", "text/plain")
    post("/ssm/parameters", {"name": "/catalogo/moeda", "type": "String", "value": "BRL"})
    post("/ssm/parameters", {"name": "/catalogo/itens-por-pagina", "type": "String", "value": "20"})
    post("/secrets", {"name": "catalogo/api-key", "description": "Chave fictícia de um parceiro", "value": {"kind": "string", "value": "chave-de-exemplo-123"}})
    python_function(
        "configuracao-do-catalogo",
        "import os\n\n"
        "def handler(event, context):\n"
        "    return {'tabela': os.environ['TABELA'], 'bucket': os.environ['BUCKET'], 'evento': event}\n",
        environment={"TABELA": "produtos", "BUCKET": "catalogo-imagens"},
        description="Devolve a configuração do catálogo recebida por variáveis de ambiente",
    )


def fluxo_de_aprovacao():
    """Step Functions orquestrando funções Lambda, disparado por EventBridge e agendamento."""
    python_function(
        "validar-pedido",
        "def handler(event, context):\n"
        "    total = float(event.get('total', 0))\n"
        "    return {**event, 'valido': total > 0, 'precisaRevisao': total > 1000}\n",
        description="Confere o total do pedido",
    )
    python_function(
        "aprovar-pedido",
        "def handler(event, context):\n"
        "    return {**event, 'status': 'APROVADO'}\n",
        description="Marca o pedido como aprovado",
    )
    python_function(
        "gerar-relatorio",
        "import datetime\n\n"
        "def handler(event, context):\n"
        "    print('Relatório gerado em', datetime.datetime.now().isoformat())\n"
        "    return {'ok': True}\n",
        description="Executada pelo agendamento diário",
    )
    definition = {
        "Comment": "Valida o pedido, aprova automaticamente até R$ 1.000 e recusa os inválidos",
        "StartAt": "Validar",
        "States": {
            "Validar": {"Type": "Task", "Resource": lambda_arn("validar-pedido"), "Next": "Valido?"},
            "Valido?": {
                "Type": "Choice",
                "Choices": [
                    {"Variable": "$.valido", "BooleanEquals": False, "Next": "Recusado"},
                    {"Variable": "$.precisaRevisao", "BooleanEquals": True, "Next": "AguardandoRevisao"},
                ],
                "Default": "Aprovar",
            },
            "Aprovar": {"Type": "Task", "Resource": lambda_arn("aprovar-pedido"), "End": True},
            "AguardandoRevisao": {"Type": "Pass", "Result": "Pedido acima de R$ 1.000 enviado para revisão", "ResultPath": "$.observacao", "End": True},
            "Recusado": {"Type": "Fail", "Error": "PedidoInvalido", "Cause": "O total do pedido precisa ser maior que zero"},
        },
    }
    post("/stepfunctions/state-machines", {"name": "aprovacao-de-pedido", "type": "STANDARD", "definition": json.dumps(definition, ensure_ascii=False)})
    post("/events/buses", {"name": "loja"})
    post("/events/buses/loja/rules", {
        "name": "pedido-criado",
        "description": "Valida cada pedido criado",
        "eventPattern": json.dumps({"source": ["loja.pedidos"], "detail-type": ["PedidoCriado"]}),
        "state": "ENABLED",
        "targets": [{"id": "validar", "arn": lambda_arn("validar-pedido")}],
    })
    post("/scheduler/schedules", {
        "name": "relatorio-diario",
        "group": "default",
        "expression": "cron(0 8 * * ? *)",
        "targetArn": lambda_arn("gerar-relatorio"),
        "state": "ENABLED",
    })


TEMPLATES = [
    (
        "fan-out-de-pedidos",
        "Fan-out de pedidos com SNS e SQS",
        "Tópico SNS pedidos entregando em duas filas SQS (estoque com fila de mensagens mortas) e numa função Lambda. "
        "Publique uma mensagem no tópico e acompanhe a entrega nas filas e no log da função.",
        fan_out_de_pedidos,
    ),
    (
        "catalogo-de-produtos",
        "Catálogo de produtos",
        "Tabela DynamoDB com produtos, bucket S3 com imagens, parâmetros do Systems Manager, um segredo e uma função Lambda "
        "configurada por variáveis de ambiente. Bom para praticar consultas pela CLI e pelos SDKs.",
        catalogo_de_produtos,
    ),
    (
        "fluxo-de-aprovacao",
        "Fluxo de aprovação com Step Functions",
        "Máquina de estados que valida e aprova pedidos com funções Lambda, uma regra do EventBridge que reage a pedidos "
        "criados e um agendamento diário. Inicie uma execução com {\"id\": \"1\", \"total\": 250}.",
        fluxo_de_aprovacao,
    ),
]


def main():
    selected = set(sys.argv[1:])
    backup = call("GET", "/environment/export")
    print(f"==> Ambiente atual exportado ({len(backup)} bytes); será importado de volta no final")
    try:
        for template_id, title, description, build in TEMPLATES:
            if selected and template_id not in selected:
                continue
            print(f"==> {template_id}: reiniciando o ambiente")
            reset()
            print(f"==> {template_id}: criando recursos")
            build()
            env = json.loads(gzip.decompress(call("GET", "/environment/export")))
            env = {"format": env["format"], "formatVersion": env["formatVersion"], "title": title, "description": description,
                   "exportedAt": env["exportedAt"], "emulatorVersion": env["emulatorVersion"], "tables": env["tables"]}
            path = OUT / f"{template_id}.json"
            path.write_text(json.dumps(env, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            counts = {name: len(rows) for name, rows in env["tables"].items() if rows}
            print(f"    {path.relative_to(OUT.parent.parent)}: {counts}")
    finally:
        print("==> Importando de volta o ambiente original")
        import_file(backup)
    print("OK")


if __name__ == "__main__":
    main()
