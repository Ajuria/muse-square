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

  window.MSPhotoCapture = { shrink: shrink, envoyer: envoyer };
})();
