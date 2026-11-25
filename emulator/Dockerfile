# Imagem do AWS Emulator, seguindo o guia oficial (no macOS ele só roda em container).
# A AWS não publica imagem pronta nem URL versionada do pacote: o RPM vem de "LTS/latest".
# Para atualizar o emulador, reconstrua sem cache: docker compose build --no-cache emulator
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal

ARG TARGETARCH
RUN set -eux; \
    case "$TARGETARCH" in \
      arm64) RPM_ARCH=aarch64 ;; \
      amd64) RPM_ARCH=x86_64 ;; \
      *) echo "Arquitetura não suportada: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/aws-emulator.rpm "https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator-${RPM_ARCH}.rpm"; \
    # O microdnf da imagem mínima não instala RPM local; o pacote só depende da glibc.
    rpm -i /tmp/aws-emulator.rpm; \
    rm -f /tmp/aws-emulator.rpm; \
    mkdir -p /home/emulator/.aws/emulator; \
    chown -R 1000:1000 /home/emulator

ENV HOME=/home/emulator \
    EMULATOR_BIND_ADDRESS=0.0.0.0 \
    EMULATOR_TELEMETRY=off

USER 1000
EXPOSE 9297
ENTRYPOINT ["aws-emulator"]
