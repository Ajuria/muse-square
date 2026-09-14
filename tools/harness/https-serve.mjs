// Serveur statique HTTPS pour les protos qui ouvrent la caméra (docs/marche-guidee-spec.md § 9, point 0).
// La caméra n'existe que dans un contexte sécurisé : sur le téléphone, http://192.168.x.x ne montre
// aucune caméra. Ce script sert un dossier en HTTPS sur le réseau local avec un certificat auto-signé
// (créé une fois hors dépôt, dans ~/.cache/muse-square/https/) et sert aussi ce certificat en HTTP
// simple pour l'installer sur le téléphone (iOS : Réglages → Profil téléchargé → Installer, puis
// Réglages → Général → Informations → Réglages des certificats → activer la confiance).
//   npm run harness:https                → sert tools/proto sur https://<IP LAN>:8443 (cert : http://<IP LAN>:8080)
//   node tools/harness/https-serve.mjs <dossier> [port https] [port http]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { execFileSync } from "node:child_process";

const dir = path.resolve(process.argv[2] || "tools/proto");
const PORT = Number(process.argv[3] || 8443);
const PORT_HTTP = Number(process.argv[4] || 8080);
const certDir = path.join(os.homedir(), ".cache", "muse-square", "https");
const keyPath = path.join(certDir, "key.pem"), certPath = path.join(certDir, "cert.pem");

function lanIps() {
  const out = [];
  for (const [, addrs] of Object.entries(os.networkInterfaces())) for (const a of addrs || []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  return out;
}
const ips = lanIps();

function ensureCert() {
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const san = execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-ext", "subjectAltName"]).toString();
    if (ips.every((ip) => san.includes("IP Address:" + ip))) return false;
  }
  fs.mkdirSync(certDir, { recursive: true });
  const san = ["DNS:localhost", "IP:127.0.0.1", ...ips.map((ip) => "IP:" + ip)].join(",");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "365",
    "-keyout", keyPath, "-out", certPath, "-subj", "/CN=Muse Square proto local",
    "-addext", "subjectAltName=" + san, "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,digitalSignature,keyCertSign,keyEncipherment"], { stdio: "ignore" });
  return true;
}
const fresh = ensureCert();

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json" };
function serveStatic(req, res) {
  const url = new URL(req.url, "http://x");
  let p = path.normalize(decodeURIComponent(url.pathname));
  if (p === "/" || p === "\\") p = "/index.html";
  // /images/* vient de public/images (le logo du cadre de l'app) ; tout le reste du dossier servi.
  const imagesDir = path.resolve("public/images");
  const file = p.startsWith("/images/") ? path.join(imagesDir, p.slice("/images/".length)) : path.join(dir, p);
  if (!file.startsWith(dir) && !file.startsWith(imagesDir)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (p === "/index.html") {
      const list = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => "<li><a href=\"/" + f + "\">" + f + "</a></li>").join("");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end("<!doctype html><meta charset=utf-8><title>protos</title><ul>" + list + "</ul>");
    }
    res.writeHead(404); return res.end("404");
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, serveStatic).listen(PORT, "0.0.0.0");
http.createServer((req, res) => {
  if (req.url === "/muse-square-proto.pem" || req.url === "/cert") {
    res.writeHead(200, { "content-type": "application/x-pem-file", "content-disposition": "attachment; filename=\"muse-square-proto.pem\"" });
    return fs.createReadStream(certPath).pipe(res);
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><p style=\"font:17px system-ui;padding:20px\">1. <a href=\"/muse-square-proto.pem\">Installer le certificat</a> (iOS : Réglages → Profil téléchargé → Installer, puis Réglages → Général → Informations → Réglages des certificats → activer).<br>2. Ouvrir <a href=\"https://" + (ips[0] || "localhost") + ":" + PORT + "/\">https://" + (ips[0] || "localhost") + ":" + PORT + "/</a></p>");
}).listen(PORT_HTTP, "0.0.0.0");

console.log("[https-serve] dossier : " + dir);
console.log("[https-serve] certificat : " + certPath + (fresh ? " (créé)" : " (réutilisé)"));
for (const ip of ips.length ? ips : ["127.0.0.1"]) {
  console.log("[https-serve] téléphone, étape 1 (certificat) : http://" + ip + ":" + PORT_HTTP + "/");
  console.log("[https-serve] téléphone, étape 2 (proto)      : https://" + ip + ":" + PORT + "/releve-espace-proto.html");
}
console.log("[https-serve] ce Mac : https://localhost:" + PORT + "/releve-espace-proto.html");
