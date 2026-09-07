// Type B read-only consumer render — "Comment votre lieu réagit". STATIC (served fresh,
// browser-cached by ?v=). Shared by the live page AND the proof harness so the exact component
// is verified. It ONLY paints pre-cited lines from /api/insight/sensitivities — no computation,
// no French assembled here (the tier register is baked into each line server-side). Inline styles
// because the content is injected dynamically (scoped <style> blocks don't reach it).
(function () {
  var DATA_BLUE = "#1D3BB3";
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // per-tier visual register — reinforces the wording already in the line
  var TIER_STYLE = {
    etabli:       { border: DATA_BLUE,   text: "#111827", pill: null },
    emergent:     { border: "#9ca3af",   text: "#374151", pill: null },
    preliminaire: { border: "#d1d5db",   text: "#6b7280", pill: "à confirmer", dashed: true },
  };

  function render(root, data) {
    if (!root) return;
    root.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.style.cssText = "max-width:720px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif;color:#111827;";

    if (!data || data.ok === false) {
      wrap.innerHTML = '<div style="padding:48px 0;text-align:center;color:#9ca3af;font-size:14px;">Impossible de charger les réactions.</div>';
      root.appendChild(wrap); return;
    }
    if (data.empty || !data.sections || data.sections.length === 0) {
      wrap.innerHTML =
        '<div style="padding:44px 20px;text-align:center;color:#9ca3af;font-size:14px;line-height:1.6;border:1px dashed #e5e7eb;border-radius:12px;">' +
        "Rien de notable pour l'instant.<br/>Les réactions de votre lieu apparaîtront ici à mesure que vos données s'accumulent." +
        "</div>";
      root.appendChild(wrap); return;
    }

    data.sections.forEach(function (sec) {
      var st = TIER_STYLE[sec.tier] || TIER_STYLE.etabli;
      var group = document.createElement("div");
      group.style.cssText = "margin-bottom:22px;";

      var head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:baseline;gap:8px;margin-bottom:8px;";
      var h = '<span style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;">' + esc(sec.heading) + "</span>";
      h += '<span style="font-size:12px;color:#b0b6bf;">' + esc(sec.caveat) + "</span>";
      head.innerHTML = h;
      group.appendChild(head);

      sec.lines.forEach(function (line) {
        var row = document.createElement("div");
        row.style.cssText =
          "display:flex;align-items:flex-start;gap:10px;padding:11px 14px;margin-bottom:7px;background:#fff;" +
          "border:1px solid rgba(0,0,0,0.08);border-radius:10px;" +
          "border-left:3px " + (st.dashed ? "dashed" : "solid") + " " + st.border + ";";
        var inner = '<span style="flex:1;font-size:14px;line-height:1.5;color:' + st.text + ';">' + esc(line) + "</span>";
        if (st.pill) {
          inner += '<span style="flex:none;font-size:11px;font-weight:600;color:#6b7280;background:#f3f4f6;border-radius:999px;padding:2px 9px;white-space:nowrap;">' + esc(st.pill) + "</span>";
        }
        row.innerHTML = inner;
        group.appendChild(row);
      });
      wrap.appendChild(group);
    });
    root.appendChild(wrap);
  }

  window.MSReactions = { render: render };
})();
