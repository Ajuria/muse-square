import { BigQuery } from "@google-cloud/bigquery";

export function makeBQClient(projectId: string): BigQuery {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    try {
      const credentials = JSON.parse(raw);
      return new BigQuery({ projectId, credentials });
    } catch {
      // fall through
    }
  }
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFilename) return new BigQuery({ projectId, keyFilename });
  return new BigQuery({ projectId });
}