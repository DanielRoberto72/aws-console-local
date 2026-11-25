#!/usr/bin/env python3
"""Parte do catálogo na verificação de persistência (chamado por check-persistence.sh).

Uso: check-catalog.py create|verify|cleanup RUN_ID FUNCTION_NAME

Cria recursos que dependem uns dos outros por ID (VPC -> sub-rede -> instância,
grupo do Cognito -> cliente -> usuário, chave -> alias, zona -> registro) e, depois
do reinício do emulador, confere que voltaram ligados aos IDs novos.
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request

API = os.environ.get("API", "http://127.0.0.1:8080/api") + "/catalog"
ACTION, RUN, FUNCTION = sys.argv[1], sys.argv[2], sys.argv[3]
NAME = f"check-{RUN}"
DB_PASSWORD = f"Senha{RUN}"
USER_PASSWORD = f"Senha{RUN}!x"


def fail(message):
    print(f"FALHA: {message}", file=sys.stderr)
    sys.exit(1)


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as err:
        fail(f"{method} {path}: {err.code} {err.read().decode()[:300]}")


def rows(service, type_, parent=None):
    query = "?parentId=" + urllib.parse.quote(parent, safe="") if parent else ""
    return call("GET", f"/{service}/{type_}{query}")["rows"]


def find(service, type_, predicate, parent=None):
    matches = [r for r in rows(service, type_, parent) if predicate(r)]
    return matches[0] if matches else None


def create(service, type_, data, parent=None):
    return call("POST", f"/{service}/{type_}", {"input": data, **({"parentId": parent} if parent else {})})["id"]


def action(service, type_, key, id_, data=None, parent=None):
    body = {"id": id_, "input": data or {}, **({"parentId": parent} if parent else {})}
    return call("POST", f"/{service}/{type_}/actions/{key}", body)["result"]


def delete(service, type_, id_, parent=None):
    call("POST", f"/{service}/{type_}/delete", {"id": id_, **({"parentId": parent} if parent else {})})


def wait_for(description, check, attempts=40):
    for _ in range(attempts):
        if check():
            return
        time.sleep(2)
    fail(f"tempo esgotado esperando: {description}")


def do_create():
    vpc = create("ec2", "vpc", {"name": NAME, "cidr": "10.123.0.0/16"})
    subnet = create("ec2", "subnet", {"name": NAME, "vpcId": vpc, "cidr": "10.123.1.0/24"})
    group = create("ec2", "security-group", {"groupName": NAME, "description": "check", "vpcId": vpc, "ingress": ["tcp:22:0.0.0.0/0"]})
    create("ec2", "key-pair", {"name": NAME})
    image = rows("ec2", "image")[0]["id"]
    create("ec2", "instance", {"name": NAME, "imageId": image, "instanceType": "t3.micro", "keyName": NAME, "subnetId": subnet, "securityGroupIds": [group]})

    create("rds", "db-instance", {"id": NAME, "engine": "postgres", "username": "admin1", "password": DB_PASSWORD, "dbName": "app"})
    create("elasticache", "cache-cluster", {"id": NAME, "engine": "redis"})

    pool = create("cognito", "user-pool", {"name": NAME})
    create("cognito", "client", {"name": "web", "flows": ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]}, pool)
    create("cognito", "user", {"username": "ana", "email": "ana@exemplo.com", "password": USER_PASSWORD}, pool)

    key = create("kms", "key", {"description": NAME})
    create("kms", "alias", {"name": f"alias/{NAME}", "keyId": key})

    zone = create("route53", "hosted-zone", {"name": f"{NAME}.local"})
    create("route53", "record", {"name": f"www.{NAME}.local", "type": "A", "ttl": 60, "values": ["10.0.0.5"]}, zone)

    function_arn = f"arn:aws:lambda:us-east-1:000000000000:function:{FUNCTION}"
    create("apigateway", "http-api", {"name": NAME, "functionArn": function_arn})

    template = {"Resources": {"Fila": {"Type": "AWS::SQS::Queue", "Properties": {"QueueName": f"{NAME}-cfn"}}}}
    create("cloudformation", "stack", {"name": NAME, "template": json.dumps(template)})

    database = NAME.replace("-", "_")
    create("glue", "database", {"name": database})
    create("glue", "table", {"name": "vendas", "location": f"s3://{NAME}/vendas/", "format": "csv", "columns": ["id:int", "valor:double"]}, database)
    create("athena", "workgroup", {"name": NAME, "output": f"s3://{NAME}/athena/"})

    wait_for("RDS disponível", lambda: (find("rds", "db-instance", lambda r: r["id"] == NAME) or {}).get("status", {}).get("label") == "available")


def do_verify():
    vpc = find("ec2", "vpc", lambda r: r["name"] == NAME) or fail("VPC não voltou")
    subnet = find("ec2", "subnet", lambda r: r["name"] == NAME) or fail("sub-rede não voltou")
    if subnet["attrs"]["vpc"] != vpc["id"]:
        fail("sub-rede voltou fora da VPC recriada")
    group = find("ec2", "security-group", lambda r: r["attrs"]["groupName"] == NAME) or fail("grupo de segurança não voltou")
    if "tcp:22:0.0.0.0/0" not in (group["attrs"]["ingress"] or ""):
        fail("regra de entrada não voltou")
    instance = find("ec2", "instance", lambda r: r["name"] == NAME) or fail("instância não voltou")
    if instance["attrs"]["subnet"] != subnet["id"] or instance["attrs"]["keyName"] != NAME:
        fail(f"instância voltou sem as referências certas: {instance['attrs']}")

    wait_for("RDS disponível", lambda: (find("rds", "db-instance", lambda r: r["id"] == NAME) or {}).get("status", {}).get("label") == "available")
    port = find("rds", "db-instance", lambda r: r["id"] == NAME)["attrs"]["endpoint"].split(":")[1]
    # A senha não é devolvida pela API: conectar prova que o painel guardou a informada na criação.
    sql = subprocess.run(
        ["docker", "compose", "exec", "-T", "-e", f"PGPASSWORD={DB_PASSWORD}", "db", "psql", "-h", "emulator", "-p", port, "-U", "admin1", "-d", "app", "-tAc", "select 42"],
        capture_output=True,
        text=True,
    )
    if sql.stdout.strip() != "42":
        fail(f"não conectou no RDS recriado com a senha original: {sql.stderr.strip()}")

    # Pelo repasse: a porta do host fica fixa mesmo com a porta interna nova.
    local = find("rds", "db-instance", lambda r: r["id"] == NAME)["attrs"].get("localEndpoint") or fail("RDS sem endpoint no host")
    sql = subprocess.run(
        ["docker", "compose", "exec", "-T", "-e", f"PGPASSWORD={DB_PASSWORD}", "db", "psql", "-h", "host.docker.internal", "-p", local.split(":")[1], "-U", "admin1", "-d", "app", "-tAc", "select 7"],
        capture_output=True,
        text=True,
    )
    if sql.stdout.strip() != "7":
        fail(f"não conectou no RDS pela porta do host {local}: {sql.stderr.strip()}")

    find("elasticache", "cache-cluster", lambda r: r["id"] == NAME) or fail("cache não voltou")
    wait_for("endpoint do cache no host", lambda: (find("elasticache", "cache-cluster", lambda r: r["id"] == NAME) or {}).get("attrs", {}).get("localEndpoint"))
    cache = find("elasticache", "cache-cluster", lambda r: r["id"] == NAME)
    with socket.create_connection(("127.0.0.1", int(cache["attrs"]["localEndpoint"].split(":")[1])), timeout=5) as conn:
        conn.sendall(b"PING\r\n")
        if not conn.recv(16).startswith(b"+PONG"):
            fail("Redis não respondeu pela porta do host")

    pool = find("cognito", "user-pool", lambda r: r["name"] == NAME) or fail("grupo do Cognito não voltou")
    client = rows("cognito", "client", pool["id"])[0]
    login = action("cognito", "client", "InitiateAuth", client["id"], {"username": "ana", "password": USER_PASSWORD}, pool["id"])
    if "IdToken" not in json.dumps(login):
        fail(f"login no Cognito falhou depois da restauração: {login}")

    key = find("kms", "key", lambda r: f"alias/{NAME}" in (r["attrs"]["aliases"] or "")) or fail("alias do KMS não aponta para a chave recriada")
    cipher = action("kms", "key", "Encrypt", key["id"], {"plaintext": "ola"})["text"]
    if action("kms", "key", "Decrypt", key["id"], {"ciphertext": cipher})["text"] != "ola":
        fail("KMS não descriptografou com a chave recriada")

    zone = find("route53", "hosted-zone", lambda r: r["name"].startswith(f"{NAME}.local")) or fail("zona não voltou")
    find("route53", "record", lambda r: r["name"] == f"www.{NAME}.local.", zone["id"]) or fail("registro DNS não voltou")

    api = find("apigateway", "http-api", lambda r: r["name"] == NAME) or fail("API HTTP não voltou")
    response = action("apigateway", "http-api", "Invoke", api["id"], {"method": "GET", "path": "/"})
    if response.get("value", {}).get("status") != 200:
        fail(f"API HTTP não chamou a função depois da restauração: {response}")

    stack = find("cloudformation", "stack", lambda r: r["id"] == NAME) or fail("stack não voltou")
    if stack["status"]["label"] != "CREATE_COMPLETE":
        fail(f"stack voltou com status {stack['status']['label']}")

    database = NAME.replace("-", "_")
    find("glue", "table", lambda r: r["id"] == "vendas", database) or fail("tabela do Glue não voltou")
    find("athena", "workgroup", lambda r: r["id"] == NAME and r["attrs"]["output"] == f"s3://{NAME}/athena/") or fail("grupo do Athena não voltou")
    result = action("athena", "workgroup", "RunQuery", NAME, {"sql": "SELECT 1 AS ok", "database": database})
    if result.get("rows") != [["1"]]:
        fail(f"Athena não executou a consulta: {result}")


def do_cleanup():
    def remove(service, type_, predicate, parent=None):
        row = find(service, type_, predicate, parent)
        if row:
            delete(service, type_, row["id"], parent)

    remove("cloudformation", "stack", lambda r: r["id"] == NAME)
    remove("apigateway", "http-api", lambda r: r["name"] == NAME)
    zone = find("route53", "hosted-zone", lambda r: r["name"].startswith(f"{NAME}.local"))
    if zone:
        delete("route53", "hosted-zone", zone["id"])
    remove("kms", "alias", lambda r: r["id"] == f"alias/{NAME}")
    remove("kms", "key", lambda r: r["attrs"]["description"] == NAME)
    remove("cognito", "user-pool", lambda r: r["name"] == NAME)
    remove("elasticache", "cache-cluster", lambda r: r["id"] == NAME)
    remove("rds", "db-instance", lambda r: r["id"] == NAME)
    remove("glue", "database", lambda r: r["id"] == NAME.replace("-", "_"))
    remove("athena", "workgroup", lambda r: r["id"] == NAME)
    remove("ec2", "instance", lambda r: r["name"] == NAME)
    remove("ec2", "key-pair", lambda r: r["id"] == NAME)
    # Sub-rede, grupo e VPC só saem depois que a instância encerrada libera a rede.
    time.sleep(2)
    remove("ec2", "security-group", lambda r: r["attrs"]["groupName"] == NAME)
    remove("ec2", "subnet", lambda r: r["name"] == NAME)
    remove("ec2", "vpc", lambda r: r["name"] == NAME)


{"create": do_create, "verify": do_verify, "cleanup": do_cleanup}[ACTION]()
