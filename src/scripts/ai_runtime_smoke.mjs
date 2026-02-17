import "dotenv/config";

const run = async () => {
  const { runAIPackagerClaude } = await import("../lib/ai/runtime/runPackager.ts");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const row = {
    display_horizon: "day",
    ai_analysis_scope_guard: "justification",
    semantic_contract_version: "test",
    display_label: "Test",
    opportunity_regime: "B",
    opportunity_score_final_local: 50,
    opportunity_medal: "B",
  };

  const res = await runAIPackagerClaude({ mode: "company_centered", row });
  console.log(JSON.stringify({ ok: res.ok, errors: res.errors, raw: res.raw_text?.slice(0, 120) }, null, 2));
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
