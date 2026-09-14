// MSPhotoCapture — LE foyer de la prise de photo d'un composant (owner 14/09, l'app de capture).
//
// Deux surfaces l'utilisent et aucune n'en recopie le corps : le bouton « Documenter → » de chaque
// composant sur la page d'un pôle (components/EngagementDoc.astro, depuis le 03/09) et la page de
// capture (/app/insightevent/documenter), où l'on photographie D'ABORD et où l'on rattache ensuite.
//
// Ce qu'il fait, et rien de plus :
//   · `shrink(file)` — réduit l'image DANS le navigateur (1600 px sur le grand côté, JPEG 85) pour
//     qu'elle passe sous la borne de l'API ; rend une adresse `data:`.
//   · `envoyer(p)` — le POST de /api/dispositifs/photos, un seul foyer pour le corps de la requête.
// Il ne rend AUCUNE interface et ne porte aucune chaîne visible : les mots vivent au lexique
// (commitmentCopy), la mise en page appartient à la surface.
(function () {
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(); var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
      img.src = url;
    });
  }

  // `version_no` est VOLONTAIREMENT omis quand il n'est pas donné : l'API prend alors la version
  // COURANTE du dispositif (readDispositif), ce qui est la seule chose juste quand on photographie
  // depuis une page qui ne sait pas quelle version est en cours.
  function envoyer(p) {
    return fetch("/api/dispositifs/photos", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dispositif_id: p.dispositif_id,
        component_key: p.component_key,
        image_base64: p.image_base64,
        content_type: "image/jpeg",
        fixture_no: p.fixture_no != null ? p.fixture_no : null,
        version_no: p.version_no != null ? p.version_no : null,
      }),
    }).then(function (r) { return r.json(); });
  }

  // ── 14/09 (owner : « Documenter doit ouvrir l'appareil photo DIRECTEMENT ») ──────────────────────
  // `ouvrir(opts)` s'appelle DEPUIS le gestionnaire de clic du bouton : le navigateur n'ouvre l'appareil
  // photo que sur un geste de l'utilisateur, donc aucune page intermédiaire ne peut le faire à sa place —
  // c'est ce qui condamnait la page avec un bouton « Prendre une photo ».
  // Après la prise, les DEUX questions se posent dans un volet posé sur la page courante : à quel PÔLE,
  // puis à quel COMPOSANT. Aucune question de site : les pôles arrivent avec le leur, et son nom suit le
  // nom du pôle quand le compte en a plusieurs.
  //   opts = { poles: [{ name, site_label, dispositif_id, commitment_id, components: [...] }], multi, copy }
  function ouvrir(opts) {
    var poles = (opts && Array.isArray(opts.poles) ? opts.poles : []).filter(function (p) { return p && p.dispositif_id; });
    var C = (opts && opts.copy) || {};
    var t = function (k) { return C[k] || ""; };
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };

    var input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.setAttribute("capture", "environment");
    input.style.display = "none"; document.body.appendChild(input);
    input.addEventListener("change", function () {
      var file = input.files && input.files[0]; input.remove();
      if (!file) return;
      var volet = poser();
      corps(volet).innerHTML = '<div style="font-size:13px;color:#6b7280;">' + esc(t("pole_photo_reading")) + "</div>";
      shrink(file).then(function (dataUrl) { questionPole(volet, dataUrl); })
        .catch(function () { corps(volet).innerHTML = '<div style="font-size:13px;color:#b91c1c;">' + esc(t("pole_photo_failed")) + "</div>"; });
    });
    input.click();

    function poser() {
      var v = document.createElement("div");
      v.setAttribute("data-ms-capture", "1");
      v.setAttribute("style", "position:fixed;inset:0;z-index:200;background:rgba(17,24,39,0.45);display:flex;align-items:flex-end;justify-content:center;");
      v.innerHTML = '<div style="background:#fff;width:100%;max-width:560px;max-height:88vh;overflow:auto;border-radius:14px 14px 0 0;padding:16px 16px 24px;font-family:system-ui,-apple-system,sans-serif;">'
        + '<div style="display:flex;justify-content:flex-end;"><button type="button" data-ms-fermer style="background:none;border:none;font-size:20px;line-height:1;color:#6b7280;cursor:pointer;padding:2px 4px;">×</button></div>'
        + '<div data-ms-corps></div></div>';
      document.body.appendChild(v);
      v.querySelector("[data-ms-fermer]").addEventListener("click", function () { v.remove(); });
      v.addEventListener("click", function (e) { if (e.target === v) v.remove(); });
      return v;
    }
    function corps(v) { return v.querySelector("[data-ms-corps]"); }
    function apercu(dataUrl) {
      return '<img src="' + esc(dataUrl) + '" alt="" style="width:100%;border-radius:10px;border:1px solid #e5e7eb;display:block;margin-bottom:10px;" />';
    }
    function titre(txt) {
      return '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:6px 0 8px;">' + esc(txt) + "</div>";
    }
    function choix(i, gras, gris) {
      return '<button type="button" data-ms-choix="' + i + '" style="display:block;width:100%;box-sizing:border-box;text-align:left;padding:14px;margin-bottom:8px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font-size:15px;font-family:inherit;color:#111827;cursor:pointer;min-height:48px;">'
        + "<b style=\"font-weight:600;\">" + esc(gras) + "</b>" + (gris ? ' <span style="color:#6b7280;font-size:13px;">' + esc(gris) + "</span>" : "") + "</button>";
    }

    function questionPole(v, dataUrl) {
      if (!poles.length) { corps(v).innerHTML = apercu(dataUrl) + '<div style="font-size:13px;color:#6b7280;">' + esc(t("capture_aucun_pole")) + "</div>"; return; }
      var h = apercu(dataUrl) + titre(t("capture_q_pole"));
      poles.forEach(function (p, i) { h += choix(i, p.name, opts.multi && p.site_label ? p.site_label : ""); });
      corps(v).innerHTML = h;
      corps(v).querySelectorAll("[data-ms-choix]").forEach(function (b) {
        b.addEventListener("click", function () { questionComposant(v, dataUrl, poles[Number(b.getAttribute("data-ms-choix"))]); });
      });
    }

    function questionComposant(v, dataUrl, pole) {
      var comps = Array.isArray(pole.components) ? pole.components : [];
      var h = apercu(dataUrl) + titre(pole.name + " · " + t("capture_q_composant"));
      if (!comps.length) { corps(v).innerHTML = h + '<div style="font-size:13px;color:#6b7280;">' + esc(t("capture_aucun_composant")) + "</div>"; return; }
      comps.forEach(function (c, i) {
        var nom = c.label || c.type_label_fr || "";
        var meta = [c.type_label_fr, c.role_label_fr].filter(function (x) { return x && x !== nom; }).join(" · ");
        h += choix(i, nom, meta);
      });
      corps(v).innerHTML = h;
      corps(v).querySelectorAll("[data-ms-choix]").forEach(function (b) {
        b.addEventListener("click", function () { envoi(v, dataUrl, pole, comps[Number(b.getAttribute("data-ms-choix"))]); });
      });
    }

    function envoi(v, dataUrl, pole, comp) {
      corps(v).innerHTML = apercu(dataUrl) + '<div style="font-size:13px;color:#6b7280;">' + esc(t("capture_envoi")) + "</div>";
      envoyer({ dispositif_id: pole.dispositif_id, component_key: comp.component_key || comp.key, image_base64: dataUrl })
        .then(function (j) {
          if (j && j.ok) {
            // La preuve est sur la page du pôle : la photo, sa légende, et la version suivante si la
            // photo en a fait naître une. Jamais un message qui dit « c'est écrit ».
            // L'adresse d'un pôle a UN foyer, `MSCardKit.msPoleUrl`. Le Tableau de bord ne charge pas le
            // kit (2 600 lignes pour une chaîne : le budget 3 s l'interdit), d'où ce repli EXPLICITE, de
            // la même forme, à corriger le jour où le kit y entrera pour une autre raison.
            var url = (window.MSCardKit && MSCardKit.msPoleUrl)
              ? MSCardKit.msPoleUrl
              : function (x) { return "/app/insightevent/pole?id=" + encodeURIComponent(String(x)); };
            var id = (j.version && j.version.commitment_id) || pole.commitment_id;
            if (id) { window.location.href = url(id); return; }
            v.remove(); return;
          }
          var msg = j && j.rejected === "person" ? t("pole_photo_person") : t("pole_photo_failed");
          corps(v).innerHTML = apercu(dataUrl) + '<div style="font-size:13px;color:#b91c1c;">' + esc(msg) + "</div>";
        })
        .catch(function () { corps(v).innerHTML = apercu(dataUrl) + '<div style="font-size:13px;color:#b91c1c;">' + esc(t("pole_photo_failed")) + "</div>"; });
    }
  }

  window.MSPhotoCapture = { shrink: shrink, envoyer: envoyer, ouvrir: ouvrir };
})();
