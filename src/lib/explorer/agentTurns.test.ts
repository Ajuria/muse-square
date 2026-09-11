import { describe, expect, it } from "vitest";
import { newAgentTurnRow, writeAgentTurns } from "./agentTurns";

describe("agentTurns — un tour = une ligne de raw.explorer_agent_turns", () => {
  const now = new Date("2026-09-11T09:00:00Z");

  it("sérialise le contenu en JSON (texte, noms de fichiers, outils) et garde l'auteur sur le tour user seulement", () => {
    const user = newAgentTurnRow({
      location_id: "loc-1", thread_id: "t-1", turn_index: 0, role: "user", user_id: "user_a", now,
      content: { text: "décris-moi mon espace", files: [{ name: "plan.pdf", kind: "pdf", media_type: "application/pdf" }] },
    });
    expect(user.role).toBe("user");
    expect(user.user_id).toBe("user_a");
    expect(user.turn_index).toBe(0);
    expect(user.created_at).toBe("2026-09-11T09:00:00.000Z");
    expect(JSON.parse(user.content)).toEqual({ text: "décris-moi mon espace", files: [{ name: "plan.pdf", kind: "pdf", media_type: "application/pdf" }] });
    expect(user.content).not.toMatch(/base64|data_base64/);

    const assistant = newAgentTurnRow({
      location_id: "loc-1", thread_id: "t-1", turn_index: 1, role: "assistant", user_id: "user_a", now,
      content: { text: "…", tool_calls: [{ name: "lire_poles", input: {}, ok: true, summary: "3 pôles", ms: 420 }], stop_reason: "end_turn" },
    });
    expect(assistant.user_id).toBeNull();
    expect(JSON.parse(assistant.content).tool_calls[0].name).toBe("lire_poles");
  });

  it("refuse un tour sans site, sans fil, avec un rang négatif ou un rôle inconnu", () => {
    const ok = { location_id: "loc-1", thread_id: "t-1", turn_index: 0, role: "user" as const, content: { text: "x" } };
    expect(() => newAgentTurnRow({ ...ok, location_id: " " })).toThrow(/location_id/);
    expect(() => newAgentTurnRow({ ...ok, thread_id: "" })).toThrow(/thread_id/);
    expect(() => newAgentTurnRow({ ...ok, turn_index: -1 })).toThrow(/turn_index/);
    expect(() => newAgentTurnRow({ ...ok, turn_index: 1.5 })).toThrow(/turn_index/);
    expect(() => newAgentTurnRow({ ...ok, role: "system" as any })).toThrow(/role/);
  });

  it("écrit toutes les lignes d'un coup dans raw.explorer_agent_turns, et rien si la liste est vide", async () => {
    const inserted: any[] = [];
    const bq = { dataset: (ds: string) => ({ table: (name: string) => ({ insert: async (r: any[]) => { inserted.push({ ds, name, n: r.length }); } }) }) };
    const a = newAgentTurnRow({ location_id: "l", thread_id: "t", turn_index: 0, role: "user", content: { text: "a" } });
    const b = newAgentTurnRow({ location_id: "l", thread_id: "t", turn_index: 1, role: "assistant", content: { text: "b" } });
    await writeAgentTurns(bq, [a, b]);
    await writeAgentTurns(bq, []);
    expect(inserted).toEqual([{ ds: "raw", name: "explorer_agent_turns", n: 2 }]);
  });
});
