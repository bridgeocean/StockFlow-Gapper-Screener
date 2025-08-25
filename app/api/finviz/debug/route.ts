export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { fetchFinvizExport } from "@/lib/finviz-export";

export async function GET() {
  try {
    const rows = await fetchFinvizExport();
    const sample = rows[0] || {};
    return new Response(
      JSON.stringify(
        {
          ok: true,
          keys: Object.keys(sample),   // normalized fields we parsed
          sample                        // one normalized row (includes raw)
        },
        null,
        2
      ),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
