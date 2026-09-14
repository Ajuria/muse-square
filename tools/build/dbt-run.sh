#!/usr/bin/env bash
# tools/build/dbt-run.sh — LANCER UN RUN CIBLÉ du job dbt Cloud `refresh_industry`.
#
# Pourquoi ce script : le 14/09, le jeton dbt Cloud du .env était révoqué et la commande vivait dans
# ma tête et dans trois passations. Elle vit ici — une commande qu'on ne peut pas taper depuis
# package.json n'existe pas (règle de placement du dépôt).
#
#   npm run dbt:run -- "stg_dispositif_walks+"
#   npm run dbt:run -- "stg_space_zones+" "vw_insight_event_space_zones"
#
# Chaque argument devient une étape `dbt build --select <arg>`. Sans argument : le script refuse
# plutôt que de lancer un run complet par accident.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ $# -eq 0 ]; then
  echo "✗ Donnez au moins un sélecteur, par exemple :  npm run dbt:run -- \"stg_dispositif_walks+\"" >&2
  exit 2
fi

set -a; . ./.env; set +a
: "${DBT_ACCOUNT_ID:?DBT_ACCOUNT_ID absent du .env}"
: "${DBT_API_TOKEN:?DBT_API_TOKEN absent du .env}"
JOB="${DBT_JOB_INDUSTRY_CHANGE:-70471823595526}"
HOST="${DBT_HOST:-cloud.getdbt.com}"

# Le jeton est vérifié AVANT de déclencher : un 401 sur le déclenchement laisse croire à un run parti.
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
  "https://${HOST}/api/v2/accounts/${DBT_ACCOUNT_ID}/" -H "Authorization: Token ${DBT_API_TOKEN}")
if [ "$CODE" != "200" ]; then
  echo "✗ Le jeton dbt Cloud est refusé (HTTP $CODE sur ${HOST})." >&2
  echo "  Regénérez-le : dbt Cloud → Account settings → Service tokens → + New token," >&2
  echo "  permission « Job Admin » sur le projet, puis remplacez DBT_API_TOKEN dans .env." >&2
  exit 1
fi

STEPS=$(python3 -c '
import json, sys
print(json.dumps(["dbt build --select " + a for a in sys.argv[1:]]))' "$@")
CAUSE="run ciblé — $*"

curl -s -X POST "https://${HOST}/api/v2/accounts/${DBT_ACCOUNT_ID}/jobs/${JOB}/run/" \
  -H "Authorization: Token ${DBT_API_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"cause\": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$CAUSE"), \"steps_override\": ${STEPS}}" \
  | python3 -c '
import sys, json
j = json.load(sys.stdin); d = j.get("data") or {}
if not d:
    print("✗", j.get("status", {}).get("user_message", j)); sys.exit(1)
print(f"  run {d.get(\"id\")} lancé — {d.get(\"status_humanized\")}")
print(f"  suivi : https://cloud.getdbt.com/deploy/{d.get(\"account_id\")}/projects/{d.get(\"project_id\")}/runs/{d.get(\"id\")}/")
'
