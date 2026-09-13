// Admin-only "what do people ask the assistant" log — surfaces gaps in the
// vault (questions asked but poorly covered) in /admin, next to comment
// moderation. Same bearer-token gate as /api/comments?status=pending.

import { Hono } from "hono";
import { isAdmin } from "../auth.ts";
import { recentQuestions } from "../db.ts";

export const questionsRoute = new Hono();

questionsRoute.get("/", (c) => {
  if (!isAdmin(c.req.header("authorization"))) {
    return c.json({ error: "Non autorisé." }, 401);
  }
  try {
    return c.json({ questions: recentQuestions() });
  } catch (e) {
    console.error("questions: read failed", e);
    return c.json({ error: "Journal indisponible." }, 503);
  }
});
