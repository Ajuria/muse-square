import "dotenv/config";

const k = process.env.ANTHROPIC_API_KEY || "";
console.log("hasKey", Boolean(k));
console.log("prefix", k.slice(0, 12));
console.log("len", k.length);
console.log("model", process.env.CLAUDE_MODEL || "");
