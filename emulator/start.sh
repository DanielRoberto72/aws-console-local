#!/bin/sh
# O emulador só informa a versão pela linha de comando, não pela API. Ela fica num volume
# compartilhado com o app, que a mostra no console e busca as notas de fidelidade dela.
set -eu
if [ -d /run/emulator-info ]; then
  aws-emulator --version > /run/emulator-info/version.txt.tmp
  mv /run/emulator-info/version.txt.tmp /run/emulator-info/version.txt
fi
exec aws-emulator "$@"
