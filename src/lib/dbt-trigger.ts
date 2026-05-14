/**
 * dbt Cloud job trigger utility.
 * Fire-and-forget: never blocks the caller.
 * Logs run IDs for debugging.
 */

type ChangeFlags = {
  isNewAccount: boolean;
  addressChanged: boolean;
  industryChanged: boolean;
  transitChanged: boolean;
};

type JobKey =
  | 'DBT_JOB_PROFILE_REFRESH_ID'   // address change (Account_address_change_save)
  | 'DBT_JOB_INDUSTRY_CHANGE'       // industry change
  | 'DBT_JOB_TRANSIT_CHANGE'        // transit only change
  | 'DBT_JOB_CLIENT_DIM_REFRESH';   // always on any change

const DBT_API_BASE = 'https://ym384.us1.dbt.com/api/v2/accounts';

async function triggerOneJob(
  accountId: string,
  jobId: string,
  token: string,
  cause: string
): Promise<void> {
  try {
    const url = `${DBT_API_BASE}/${accountId}/jobs/${jobId}/run/`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cause }),
    });

    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      const runId = data?.data?.id ?? 'unknown';
      console.log(`[dbt-trigger] Job ${jobId} triggered — run_id=${runId} cause="${cause}"`);
    } else {
      const text = await res.text().catch(() => '');
      console.error(`[dbt-trigger] Job ${jobId} failed ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (e: any) {
    console.error(`[dbt-trigger] Job ${jobId} fetch error: ${e?.message}`);
  }
}

export function triggerDbtJobs(
  flags: ChangeFlags,
  locationId: string,
  mode: 'create' | 'update'
): void {
  const accountId = process.env.DBT_ACCOUNT_ID;
  const token = process.env.DBT_API_TOKEN;

  if (!accountId || !token) {
    console.warn('[dbt-trigger] Missing DBT_ACCOUNT_ID or DBT_API_TOKEN — skipping');
    return;
  }

  const jobsToTrigger: { key: JobKey; label: string }[] = [];

  // New account → full pipeline
  if (flags.isNewAccount) {
    jobsToTrigger.push({ key: 'DBT_JOB_PROFILE_REFRESH_ID', label: 'address(new_account)' });
    jobsToTrigger.push({ key: 'DBT_JOB_INDUSTRY_CHANGE', label: 'industry(new_account)' });
    jobsToTrigger.push({ key: 'DBT_JOB_TRANSIT_CHANGE', label: 'transit(new_account)' });
  } else {
    // Selective triggers based on what changed
    if (flags.addressChanged) {
      jobsToTrigger.push({ key: 'DBT_JOB_PROFILE_REFRESH_ID', label: 'address_change' });
    }
    if (flags.industryChanged) {
      jobsToTrigger.push({ key: 'DBT_JOB_INDUSTRY_CHANGE', label: 'industry_change' });
    }
    if (flags.transitChanged) {
      jobsToTrigger.push({ key: 'DBT_JOB_TRANSIT_CHANGE', label: 'transit_change' });
    }
  }

  // Always refresh client dimensions on any save
  jobsToTrigger.push({ key: 'DBT_JOB_CLIENT_DIM_REFRESH', label: 'client_dim_refresh' });

  // Deduplicate by key (shouldn't happen, but safe)
  const seen = new Set<string>();
  const unique = jobsToTrigger.filter((j) => {
    if (seen.has(j.key)) return false;
    seen.add(j.key);
    return true;
  });

  for (const { key, label } of unique) {
    const jobId = process.env[key];
    if (!jobId) {
      console.warn(`[dbt-trigger] Env var ${key} not set — skipping ${label}`);
      continue;
    }

    const cause = `profile_save:${mode}:${label}:${locationId}`;

    // Fire and forget — do not await
    triggerOneJob(accountId, jobId, token, cause).catch(() => {});
  }
}