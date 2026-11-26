#!/bin/sh
# Ponto de entrada do container do emulador.
#
# Grava a versão do emulador na pasta compartilhada com o app (o emulador não a expõe
# pela API) e supervisiona o processo: quando o console cria "restart-requested" nessa
# pasta, o emulador é reiniciado e volta sem estado. O console usa isso para importar,
# reiniciar e carregar ambientes. Se o emulador encerrar por conta própria, o container
# encerra com o mesmo código, como antes.
set -eu

INFO=/run/emulator-info
REQUEST="$INFO/restart-requested"
supervised=false
if [ -d "$INFO" ] && [ -w "$INFO" ]; then
  aws-emulator --version > "$INFO/version.txt.tmp"
  mv "$INFO/version.txt.tmp" "$INFO/version.txt"
  # Um pedido anterior ao início do container já foi atendido por este início.
  rm -f "$REQUEST"
  touch "$INFO/supervised"
  supervised=true
fi

if [ "$supervised" != true ]; then
  exec aws-emulator "$@"
fi

child=
stop() {
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  exit 0
}
trap stop TERM INT

while :; do
  aws-emulator "$@" &
  child=$!
  restart=false
  while kill -0 "$child" 2>/dev/null; do
    if [ -f "$REQUEST" ]; then
      rm -f "$REQUEST"
      restart=true
      echo "start-emulator: reinício pedido pelo console; o estado em memória será descartado" >&2
      kill -TERM "$child" 2>/dev/null || true
      break
    fi
    # Em segundo plano, para que o trap rode sem esperar o sleep terminar.
    sleep 1 &
    wait $! || true
  done
  code=0
  wait "$child" || code=$?
  child=
  if [ "$restart" != true ]; then
    exit "$code"
  fi
done
