// app/api/finviz/debug/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { fetchFinvizExport } from "@/lib/finviz-export";

export async function GET() {
  try {
    const rows = await fetchFinvizExport();
    const sample = rows[0] || {};
    return new Response(JSON.stringify({
      ok: true,
      keys: Object.keys(sample),
      sample
    }, null, 2), { headers: { "content-type": "application/json" }});
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}
