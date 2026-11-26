#!/usr/bin/env python3
"""Verificação de ponta a ponta de exportar, importar, reiniciar e carregar modelos.

Roda contra a stack do docker compose. Exporta o ambiente atual, reinicia o ambiente,
carrega e exercita cada modelo e, no final, importa de volta o ambiente original,
conferindo que ele voltou igual (mesmo se uma verificação falhar no meio).

    python3 scripts/check-environment.py
"""

import gzip
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module  # noqa: E402

build = import_module("build-templates")
call, post, status, wait_until = build.call, build.post, build.status, build.wait_until


def get(path):
    return json.loads(call("GET", path))


def step(message):
    print(f"==> {message}")


def check(condition, message):
    if not condition:
        sys.exit(f"FALHA: {message}")


def counts(environment):
    """Contagem por tabela e os recursos guardados, sem os campos que mudam a cada snapshot."""
    tables = environment["tables"]
    resources = sorted((r["service"], r["type"], r["name"]) for r in tables["stored_resources"])
    return {name: len(rows) for name, rows in tables.items()}, resources


def export():
    return call("GET", "/environment/export")


def load_template(template_id):
    build.replace_and_wait(lambda: post(f"/environment/templates/{template_id}/load", {}))


def receive(queue, text, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        messages = json.loads(call("POST", f"/sqs/queues/{queue}/receive", {"waitSeconds": 1})).get("messages", [])
        if any(text in json.dumps(m) for m in messages):
            return True
    return False


def check_fan_out():
    post("/sns/topics/pedidos/publish", {"message": json.dumps({"id": "check-1", "total": 10})})
    check(receive("faturamento", "check-1"), "a mensagem publicada no tópico não chegou à fila faturamento")
    check(receive("estoque", "check-1"), "a mensagem publicada no tópico não chegou à fila estoque")
    attributes = get("/sqs/queues/estoque")["attributes"]
    check("estoque-dlq" in attributes.get("RedrivePolicy", ""), f"a fila estoque voltou sem a DLQ: {attributes}")


def check_catalog():
    items = get("/dynamodb/tables/produtos/items")["items"]
    check(len(items) == 5, f"a tabela produtos tem {len(items)} itens, esperava 5")
    body = call("GET", "/s3/buckets/catalogo-imagens/download?key=produtos/p-001.svg").decode()
    check("Caneca" in body, "a imagem p-001.svg não voltou com o conteúdo")
    result = json.loads(call("POST", "/lambda/functions/configuracao-do-catalogo/invoke", {"payload": "{}"}))
    check("produtos" in json.dumps(result), f"a função não devolveu a configuração: {result}")
    value = json.loads(call("POST", "/secrets/value", {"name": "catalogo/api-key"}))
    check("chave-de-exemplo-123" in json.dumps(value), "o segredo não voltou com o valor")


def run_execution(total):
    arn = json.loads(call("POST", "/stepfunctions/state-machines/aprovacao-de-pedido/executions", {"input": json.dumps({"id": "1", "total": total})}))["executionArn"]
    result = {}

    def finished():
        result.update(json.loads(call("POST", "/stepfunctions/executions/describe", {"arn": arn})))
        return result.get("status") not in (None, "RUNNING")

    wait_until("a execução terminar", finished, timeout=60)
    return result


def check_approval():
    approved = run_execution(250)
    check(approved["status"] == "SUCCEEDED" and "APROVADO" in json.dumps(approved), f"pedido de 250 não foi aprovado: {approved}")
    refused = run_execution(0)
    check(refused["status"] == "FAILED", f"pedido de total 0 não foi recusado: {refused}")
    check("relatorio-diario" in json.dumps(get("/scheduler/schedules")), "o agendamento diário não voltou")


CHECKS = {
    "fan-out-de-pedidos": check_fan_out,
    "catalogo-de-produtos": check_catalog,
    "fluxo-de-aprovacao": check_approval,
}


def main():
    step("Exportando o ambiente atual")
    original = export()
    before = counts(json.loads(gzip.decompress(original)))
    try:
        step("Reiniciando o ambiente")
        build.reset()
        empty = counts(json.loads(gzip.decompress(export())))
        check(all(n == 0 for n in empty[0].values()), f"o ambiente não ficou vazio: {empty[0]}")
        check(get("/sqs/queues")["queues"] == [], "o emulador ainda tem filas depois do reinício")

        templates = {t["id"] for t in get("/environment/templates")["templates"]}
        check(templates == set(CHECKS), f"modelos inesperados: {sorted(templates)}")
        for template_id, verify in CHECKS.items():
            step(f"Carregando e exercitando o modelo {template_id}")
            load_template(template_id)
            verify()

        step("Recusando um arquivo inválido sem tocar no ambiente")
        restore_mark = status()["lastRestoreAt"]
        try:
            build.import_file(b"{}")
        except SystemExit as err:
            check("InvalidEnvironmentFile" in str(err), f"erro inesperado: {err}")
        else:
            sys.exit("FALHA: o arquivo inválido foi aceito")
        check(status()["lastRestoreAt"] == restore_mark, "o emulador reiniciou com um arquivo inválido")
    finally:
        step("Importando de volta o ambiente original")
        build.import_file(original)
    after = counts(json.loads(gzip.decompress(export())))
    check(after == before, f"o ambiente original não voltou igual:\nantes  {before}\ndepois {after}")
    print("OK: ambiente exportado, reiniciado, modelos carregados e ambiente original de volta.")


if __name__ == "__main__":
    main()
