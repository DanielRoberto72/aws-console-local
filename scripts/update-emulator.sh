#!/usr/bin/env bash
# Atualiza o AWS Emulator para a versão mais recente, guardando a imagem atual para poder voltar.
#
#   scripts/update-emulator.sh             atualiza (a imagem em uso vira a "anterior")
#   scripts/update-emulator.sh --force     reconstrói mesmo já estando na versão mais recente
#   scripts/update-emulator.sh --rollback  volta para a imagem anterior
#
# A AWS publica só o pacote mais recente, então a única forma de voltar é a imagem local
# guardada aqui. Em qualquer dos casos, o console recria o estado salvo no emulador novo.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE=aws-console-local-emulator
CURRENT="$IMAGE:latest"
PREVIOUS="$IMAGE:previous"

fail() { echo "ERRO: $*" >&2; exit 1; }
image_id() { docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true; }

# Lê a versão gravada pelo container; espera até "tentativas" × 2 s pelo emulador subir.
running_version() {
  local tries=${1:-60}
  for _ in $(seq 1 "$tries"); do
    if docker compose exec -T emulator cat /run/emulator-info/version.txt 2>/dev/null | sed -n 's/^Version:[[:space:]]*//p' | grep .; then
      return 0
    fi
    sleep 2
  done
  echo desconhecida
}

wait_healthy() {
  echo "==> Aguardando o emulador ficar saudável"
  for _ in $(seq 1 90); do
    if [ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q emulator)" 2>/dev/null)" = healthy ]; then
      return 0
    fi
    sleep 2
  done
  fail "o emulador não ficou saudável; veja: docker compose logs emulator"
}

# Versão do pacote mais recente, pelo metadado (sem baixar o pacote), no formato 1.0.620.
latest_version() {
  local arch
  case "$(docker version --format '{{.Server.Arch}}')" in
    arm64) arch=aarch64 ;;
    amd64) arch=x86_64 ;;
    *) return 0 ;;
  esac
  curl -fsSI "https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator-$arch.rpm" 2>/dev/null |
    sed -n 's/^x-amz-meta-package-version:[[:space:]]*\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/ip' | tr -d '\r'
}

update() {
  local force=$1 before installed latest
  before=$(image_id "$CURRENT")
  installed=$(running_version 1)
  latest=$(latest_version || true)
  echo "==> Em uso: $installed. Mais recente: ${latest:-não consultada}."
  if [ "$force" != true ] && [ -n "$latest" ] && [ "$installed" = "$latest" ]; then
    echo "Já está na versão mais recente. Use --force para reconstruir mesmo assim."
    return 0
  fi
  if [ -n "$before" ]; then
    echo "==> Guardando a imagem atual como $PREVIOUS"
    docker image tag "$CURRENT" "$PREVIOUS"
  fi
  echo "==> Baixando a versão mais recente do emulador (o build ignora o cache)"
  docker compose build --no-cache --pull emulator
  docker compose up -d emulator
  wait_healthy
  echo "OK: emulador na versão $(running_version). Para voltar: scripts/update-emulator.sh --rollback"
}

rollback() {
  local previous current
  previous=$(image_id "$PREVIOUS")
  [ -n "$previous" ] || fail "não há imagem anterior guardada ($PREVIOUS); ela é criada pela atualização feita por este script"
  current=$(image_id "$CURRENT")
  [ "$previous" != "$current" ] || fail "a imagem anterior é a mesma que está em uso"
  echo "==> Voltando para a imagem anterior"
  # A imagem em uso passa a ser a "anterior": rodar --rollback de novo desfaz a volta.
  docker image tag "$PREVIOUS" "$IMAGE:rollback-tmp"
  [ -n "$current" ] && docker image tag "$CURRENT" "$PREVIOUS"
  docker image tag "$IMAGE:rollback-tmp" "$CURRENT"
  docker image rm "$IMAGE:rollback-tmp" >/dev/null
  docker compose up -d --no-build --force-recreate emulator
  wait_healthy
  echo "OK: emulador na versão $(running_version)."
}

case "${1:-}" in
  "") update false ;;
  --force) update true ;;
  --rollback) rollback ;;
  -h | --help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) fail "opção desconhecida: $1 (use --force, --rollback ou --help)" ;;
esac
