import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';

const DATASET = 'raw';
const TABLE   = 'client_transactions';
const PROJECT = 'muse-square-open-data';

interface LineItem {
  item_code?:        string;
  item_description?: string;
  item_category?:    string;
  category?:         string;
  unit_price?:       number;
  quantity?:         number;
  revenue?:          number;
  discount_flag?:    boolean;
  discount_amount?:  number;
}

interface SalesPayload {
  location_id:          string;
  date:                 string; // YYYY-MM-DD
  source_type?:         string; // pos | ticketing | ecommerce
  source_system?:       string; // lightspeed | sumup | shopify | manual | csv
  revenue?:             number;
  revenue_net?:         number;
  discount_amount?:     number;
  transaction_count?:   number;
  visitor_count?:       number;
  avg_basket?:          number;
  tickets_sold?:        number;
  ticket_capacity?:     number;
  customer_type?:       string;
  channel?:             string; // in_store | online | mixed
  payment_method?:      string;
  currency?:            string;
  items?:               LineItem[];
}

export const POST: APIRoute = async ({ request, locals }) => {
  // ── Auth ──────────────────────────────────────────────
  const userId = (locals as any).clerk_user_id;
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────
  let body: SalesPayload | SalesPayload[];
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'INVALID_JSON' }), { status: 400 });
  }

  const rows = Array.isArray(body) ? body : [body];

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'EMPTY_PAYLOAD' }), { status: 400 });
  }
  if (rows.length > 5000) {
    return new Response(JSON.stringify({ ok: false, error: 'MAX_5000_ROWS' }), { status: 400 });
  }

  // ── Validate ──────────────────────────────────────────
  for (const r of rows) {
    if (!r.location_id || !r.date) {
      return new Response(
        JSON.stringify({ ok: false, error: 'MISSING_REQUIRED: location_id, date' }),
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      return new Response(
        JSON.stringify({ ok: false, error: `INVALID_DATE: ${r.date}` }),
        { status: 400 }
      );
    }
  }

  // ── Build BQ rows ─────────────────────────────────────
  const now = new Date().toISOString();
  const bqRows: any[] = [];

  for (const r of rows) {
    // If items array provided, one BQ row per line item
    if (r.items && r.items.length > 0) {
      for (const item of r.items) {
        bqRows.push({
          location_id:         r.location_id,
          client_id:           userId,
          transaction_date:    r.date,
          transaction_datetime: r.date + 'T00:00:00',
          transaction_hour:    null,
          revenue:             item.revenue ?? r.revenue ?? null,
          discount_amount:     item.discount_amount ?? r.discount_amount ?? 0,
          transaction_count:   r.transaction_count ?? null,
          visitor_count:       r.visitor_count ?? null,
          avg_basket:          r.avg_basket ?? null,
          category:            item.category ?? null,
          item_code:           item.item_code ?? null,
          item_description:    item.item_description ?? null,
          item_category:       item.item_category ?? null,
          unit_price:          item.unit_price ?? null,
          quantity:            item.quantity ?? null,
          customer_type:       r.customer_type ?? null,
          channel:             r.channel ?? null,
          payment_method:      r.payment_method ?? null,
          discount_flag:       item.discount_flag ?? (item.discount_amount ? true : false),
          invoice_number:      null,
          source_system:       r.source_system ?? null,
          source_type:         r.source_type ?? 'pos',
          currency:            r.currency ?? 'EUR',
          ingested_at:         now,
        });
      }
    } else {
      // Summary row (no line items)
      bqRows.push({
        location_id:         r.location_id,
        client_id:           userId,
        transaction_date:    r.date,
        transaction_datetime: r.date + 'T00:00:00',
        transaction_hour:    null,
        revenue:             r.revenue ?? null,
        discount_amount:     r.discount_amount ?? 0,
        transaction_count:   r.transaction_count ?? null,
        visitor_count:       r.visitor_count ?? null,
        avg_basket:          r.avg_basket ?? null,
        category:            null,
        item_code:           null,
        item_description:    null,
        item_category:       null,
        unit_price:          null,
        quantity:            null,
        customer_type:       r.customer_type ?? null,
        channel:             r.channel ?? null,
        payment_method:      r.payment_method ?? null,
        discount_flag:       false,
        invoice_number:      null,
        source_system:       r.source_system ?? null,
        source_type:         r.source_type ?? 'pos',
        currency:            r.currency ?? 'EUR',
        ingested_at:         now,
      });
    }
  }

  // ── Insert to BQ ──────────────────────────────────────
  try {
    const bq = makeBQClient(PROJECT);
    await bq.dataset(DATASET).table(TABLE).insert(bqRows);

    return new Response(
      JSON.stringify({ ok: true, inserted: bqRows.length }),
      { status: 200 }
    );
  } catch (err: any) {
    const msg = err?.errors?.[0]?.message || err?.message || 'BQ_INSERT_FAILED';
    console.error('sales-import error:', JSON.stringify(err?.errors || err));
    return new Response(
      JSON.stringify({ ok: false, error: msg, detail: err?.errors || null }),
      { status: 500 }
    );
  }
};