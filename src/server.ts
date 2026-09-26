import express, { type Express } from "express";
import type { MemberStore } from "./store.js";

export function createApp(store: MemberStore): Express {
  const app = express();

  app.get("/members/:partnerMemberId", async (req, res) => {
    const member = await store.findById(req.params.partnerMemberId);
    if (!member) {
      res.status(404).json({ error: "member not found" });
      return;
    }
    res.json(member);
  });

  return app;
}
