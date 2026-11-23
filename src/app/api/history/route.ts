import { allowPublic, tooMany } from "@/lib/guard";
import { bad, fail, ok } from "@/lib/server/respond";
import { history, marketById } from "@/lib/server/rounds";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/* Full Chainlink round history of one market: bundled snapshot + rounds read live since. GET /api/history?market=ETH */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "history", 30, 600))) return tooMany();
  const id = new URL(request.url).searchParams.get("market") ?? "";
  if (!/^[A-Z]{2,6}$/.test(id) || !marketById(id)) return bad("Unknown market.");
  try {
    const h = await history(id);
    if (!h) return bad("Unknown market.");
    return ok(h, 60);
  } catch (e) {
    return fail(e);
  }
}
