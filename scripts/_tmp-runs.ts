import "dotenv/config";
const T = process.env.DBT_API_TOKEN, A = process.env.DBT_ACCOUNT_ID;
const H = { Authorization: `Token ${T}`, "Content-Type": "application/json" };
(async () => {
  const r = await fetch(`https://cloud.getdbt.com/api/v2/accounts/${A}/runs/?order_by=-created_at&limit=8&include_related=["job","trigger"]`, { headers: H });
  const j: any = await r.json();
  for (const run of j.data || []) console.log(run.created_at.slice(11, 16), "| job:", run.job?.name, "| env", run.environment_id, "| trigger:", run.trigger?.cause, "| git:", run.git_branch || run.git_sha?.slice(0, 7), "| status", run.status_humanized);
})();
