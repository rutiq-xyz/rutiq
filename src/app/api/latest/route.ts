import { allowPublic, tooMany } from "@/lib/guard";
import { fail, ok } from "@/lib/server/respond";
import { latestAll } from "@/lib/server/rounds";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/* Latest Chainlink round of every market (one batch, cached 15 s; a read where any feed failed is never cached). */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "latest", 60, 1200))) return tooMany();
  try {
    return ok(await latestAll(), 10);
  } catch (e) {
    return fail(e);
  }
}
