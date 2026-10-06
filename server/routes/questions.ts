// Admin-only "what do people ask the assistant" log — surfaces gaps in the
// vault (questions asked but poorly covered) in /admin, next to comment
// moderation. Same bearer-token gate as /api/comments?status=pending.
//
//   GET /api/questions → { questions (latest 100), frequent, weak, weakScore, window }
//
// `frequent` and `weak` are aggregated (server/questions-agg.ts) over the whole
// capped log, not just the 100 rows returned in `questions`.

import { Hono } from "hono";
import { isAdmin } from "../auth.ts";
import { getIp } from "../http.ts";
import { recentQuestions } from "../db.ts";
import { frequentQuestions, weakQuestions, WEAK_SCORE } from "../questions-agg.ts";

export const questionsRoute = new Hono();

questionsRoute.get("/", (c) => {
  if (!isAdmin(c.req.header("authorization"), getIp(c))) {
    return c.json({ error: "Non autorisé." }, 401);
  }
  try {
    const all = recentQuestions(Number.MAX_SAFE_INTEGER);
    return c.json({
      questions: all.slice(0, 100),
      frequent: frequentQuestions(all),
      weak: weakQuestions(all),
      weakScore: WEAK_SCORE,
      window: all.length,
    });
  } catch (e) {
    console.error("questions: read failed", e);
    return c.json({ error: "Journal indisponible." }, 503);
  }
});
