import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { loadMarket } from "../../lib/market-server";
import {
  capturePerformance,
  type PerformanceState,
  type RecordedPoint,
} from "../../lib/performance";
import type { Portfolio } from "../../lib/model";
function database() {
  if (!env.DB) throw new Error("Histórico indisponível");
  return env.DB;
}
const respond = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
async function history(userId: string, warnings: string[] = []) {
  const since = new Date(Date.now() - 400 * 86400000).toISOString(),
    day = new Date().toISOString().slice(0, 10);
  const result = await database()
    .prepare(
      `WITH ranked AS (SELECT *,row_number() OVER (PARTITION BY substr(captured_at,1,10) ORDER BY captured_at DESC) AS rn FROM performance_points WHERE user_id=? AND captured_at>=?) SELECT * FROM ranked WHERE rn=1 OR baseline=1 OR captured_at>=? OR EXISTS(SELECT 1 FROM json_each(segments) WHERE json_extract(value,'$.baseline')=1) UNION ALL SELECT *,1 AS rn FROM performance_points WHERE user_id=? AND baseline=1 AND captured_at<? ORDER BY captured_at`,
    )
    .bind(userId, since, day, userId, since)
    .all<any>();
  const points: RecordedPoint[] = result.results.map((r) => ({
    time: r.captured_at,
    value: r.value_brl,
    index: r.unit_index,
    flow: r.net_flow,
    income: r.income_brl,
    benchmarks: JSON.parse(r.benchmarks),
    baseline: !!r.baseline,
    segments: r.segments ? JSON.parse(r.segments) : undefined,
  }));
  const state = await database()
    .prepare("SELECT payload FROM performance_states WHERE user_id=?")
    .bind(userId)
    .first<{ payload: string }>();
  const parsed: PerformanceState | undefined = state
    ? JSON.parse(state.payload)
    : undefined;
  return {
    points,
    startedAt: parsed?.startedAt ?? "",
    updatedAt: parsed?.capturedAt ?? "",
    warnings,
  };
}
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return respond({ error: "Entre para acessar o histórico." }, 401);
  try {
    return respond(await history(user.userId));
  } catch {
    return respond({ error: "Não foi possível carregar o histórico." }, 503);
  }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return respond({ error: "Entre para registrar o histórico." }, 401);
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return respond({ error: "Origem inválida" }, 403);
  try {
    const market = await loadMarket();
    for (let attempt = 0; attempt < 3; attempt++) {
      const portfolio = await database()
        .prepare("SELECT payload,revision FROM portfolios WHERE user_id=?")
        .bind(user.userId)
        .first<{ payload: string; revision: number }>();
      if (!portfolio) return respond(await history(user.userId));
      const previous = await database()
        .prepare(
          "SELECT payload,version FROM performance_states WHERE user_id=?",
        )
        .bind(user.userId)
        .first<{ payload: string; version: number }>();
      const at = new Date().toISOString();
      let captured;
      try {
        captured = capturePerformance(
          JSON.parse(portfolio.payload) as Portfolio,
          market,
          previous ? JSON.parse(previous.payload) : undefined,
          portfolio.revision,
          at,
        );
      } catch (e) {
        return respond({
          ...(await history(user.userId)),
          error:
            e instanceof Error ? e.message : "Histórico aguardando cotações.",
        });
      }
      const { state, point, warnings } = captured,
        version = (previous?.version ?? -1) + 1;
      const checkpoint = previous
        ? database()
            .prepare(
              `UPDATE performance_states SET payload=?,version=?,updated_at=? WHERE user_id=? AND version=? AND EXISTS(SELECT 1 FROM portfolios WHERE user_id=? AND revision=?)`,
            )
            .bind(
              JSON.stringify(state),
              version,
              at,
              user.userId,
              previous.version,
              user.userId,
              portfolio.revision,
            )
        : database()
            .prepare(
              `INSERT INTO performance_states(user_id,payload,version,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM portfolios WHERE user_id=? AND revision=?) ON CONFLICT(user_id) DO NOTHING`,
            )
            .bind(
              user.userId,
              JSON.stringify(state),
              version,
              at,
              user.userId,
              portfolio.revision,
            );
      const bucket = Math.floor(Date.parse(at) / 900000),
        segmentBaseline = Object.values(point.segments ?? {}).some(
          (p) => p.baseline,
        ),
        id = point.baseline
          ? user.userId + ":initial"
          : segmentBaseline
            ? user.userId + ":segments:" + at
            : user.userId + ":" + bucket;
      const insert = database()
        .prepare(
          `INSERT INTO performance_points(id,user_id,captured_at,value_brl,unit_index,net_flow,income_brl,benchmarks,baseline,segments) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM performance_states WHERE user_id=? AND version=? AND updated_at=?) ON CONFLICT(id) DO UPDATE SET captured_at=excluded.captured_at,value_brl=excluded.value_brl,unit_index=excluded.unit_index,net_flow=excluded.net_flow,income_brl=excluded.income_brl,benchmarks=excluded.benchmarks,segments=excluded.segments`,
        )
        .bind(
          id,
          user.userId,
          at,
          point.value,
          point.index,
          point.flow,
          point.income,
          JSON.stringify(point.benchmarks),
          point.baseline ? 1 : 0,
          JSON.stringify(point.segments),
          user.userId,
          version,
          at,
        );
      const saved = await database().batch([checkpoint, insert]);
      if (saved[0].meta.changes)
        return respond(await history(user.userId, warnings));
    }
    return respond(
      await history(user.userId, [
        "Outra consulta atualizou o histórico durante esta leitura. Exibindo a última observação salva.",
      ]),
    );
  } catch {
    return respond(
      {
        error:
          "O histórico está temporariamente indisponível. Seus registros permanecem salvos.",
      },
      503,
    );
  }
}
