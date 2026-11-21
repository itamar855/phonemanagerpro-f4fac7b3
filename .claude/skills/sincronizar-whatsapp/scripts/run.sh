#!/usr/bin/env bash
# Roda um SQL desta skill no banco de produção do CellManagerPro, preenchendo os parâmetros.
#   bash run.sh <arquivo.sql> [--write] [CHAVE=valor ...]
# Sem --write roda em transação só de leitura (--read-only). Com --write passa --yes:
# use só nas etapas que a skill marca como escrita e quando o pedido do usuário cobre isso.
# Parâmetros: cada __CHAVE__ do SQL é trocado pelo valor (uuid, número, data). Rode da raiz do repo.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[ $# -ge 1 ] || { echo "uso: run.sh <arquivo.sql> [--write] [CHAVE=valor ...]" >&2; exit 2; }
file="$1"; shift
src="$here/$file"; [ -f "$src" ] || src="$file"
mode="--read-only"
tmp="$(mktemp "${TMPDIR:-/tmp}/sync-wa-XXXXXX.sql")"
trap 'rm -f "$tmp"' EXIT
cp "$src" "$tmp"
for arg in "$@"; do
  if [ "$arg" = "--write" ]; then mode="--yes"; continue; fi
  key="${arg%%=*}"; val="${arg#*=}"
  case "$val" in *"|"*|*"'"*|*";"*) echo "valor inválido para $key" >&2; exit 2;; esac
  sed -i "s|__${key}__|${val}|g" "$tmp"
done
if grep -qo '__[A-Z_]*__' "$tmp"; then
  echo "faltou valor para: $(grep -o '__[A-Z_]*__' "$tmp" | sort -u | tr '\n' ' ')" >&2; exit 2
fi
npx supabase db query --remote $mode -f "$tmp"
