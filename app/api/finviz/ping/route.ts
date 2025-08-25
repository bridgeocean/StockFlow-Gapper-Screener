export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { fetchFinvizExport } from "@/lib/finviz-export";

export async function GET() {
  try {
    const rows = await fetchFinvizExport();
    return new Response(JSON.stringify({ ok: true, sample: rows.slice(0, 3) }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}
