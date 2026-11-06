const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { scramjetPath } = require("@mercuryworkshop/scramjet/path");
const { libcurlPath } = require("@mercuryworkshop/libcurl-transport");
const { baremuxPath } = require("@mercuryworkshop/bare-mux/node");
const { server: wisp, logging } = require("@mercuryworkshop/wisp-js/server");
logging.set_level(logging.INFO);
Object.assign(wisp.options, { allow_udp_streams: false, dns_servers: ["1.1.1.3", "1.0.0.3"] });

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "chat-store.json");
const PUBLIC_FILES = new Set(["index.html", "app.js", "style.css", "account.css", "logo.png", "sw.js", "terms.html", "privacy.html"]);
const MAX_BODY = 16 * 1024;
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const POLICY_VERSION = "2026-11-06";
const NAME_EFFECTS = [
  { id: "silver", name: "silverline", cost: 80, className: "effect-silver" },
  { id: "ice", name: "ice glow", cost: 140, className: "effect-ice" },
  { id: "ember", name: "ember", cost: 220, className: "effect-ember" },
  { id: "aurora", name: "aurora", cost: 360, className: "effect-aurora" }
];
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("PORT must be a whole number from 1 to 65535.");
  process.exit(1);
}
const sessions = new Map();
const eventClients = new Set();
const activityPings = new Map();
const wispConnections = new Map();
fs.mkdirSync(DATA_DIR, { recursive: true });

let store = readStore();
if (!store.users.some(user => user.role === "owner")) {
  const setupCode = crypto.randomBytes(5).toString("hex").toUpperCase();
  store.setupCodeHash = hashSetupCode(setupCode);
  writeStore();
  console.log("\nFirst account setup code (enter this on the account setup screen): " + setupCode + "\n");
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    const users = Array.isArray(parsed.users) ? parsed.users : [];
    for (const user of users) {
      user.id ||= crypto.randomUUID();
      user.displayName ||= user.username;
      user.email ||= "";
      user.bio ||= "";
      user.pronouns ||= "";
      user.avatar ||= "";
      user.banner ||= "";
      user.status ||= "online";
      user.coins = Number.isFinite(user.coins) ? user.coins : 0;
      user.ownedEffects ||= [];
      user.equippedEffect ||= "";
      user.selectedApps ||= ["browser", "messages", "files", "settings"];
      user.acceptedPolicyVersion ||= "";
    }
    return { users, messages: Array.isArray(parsed.messages) ? parsed.messages : [], setupCodeHash: parsed.setupCodeHash || null };
  } catch {
    return { users: [], messages: [], setupCodeHash: null };
  }
}
function writeStore() { fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 }); }
function hashSetupCode(code) { return crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex"); }
function passwordRecord(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve({ salt, hash: key.toString("hex") })));
}
function verifyPassword(password, record) {
  return new Promise((resolve, reject) => crypto.scrypt(password, record.salt, 64, (error, key) => {
    if (error) return reject(error);
    const expected = Buffer.from(record.hash, "hex");
    resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
  }));
}
function sendJson(res, status, value, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", ...extraHeaders });
  res.end(JSON.stringify(value));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) { reject(Object.assign(new Error("Request body is too large."), { status: 413 })); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(Object.assign(new Error("Send valid JSON."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function cookieValue(req, key) {
  const cookies = (req.headers.cookie || "").split(";");
  for (const entry of cookies) {
    const [name, ...value] = entry.trim().split("=");
    if (name === key) return decodeURIComponent(value.join("="));
  }
  return "";
}
function getSession(req) {
  const token = cookieValue(req, "zorune_session");
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { if (token) sessions.delete(token); return null; }
  const user = store.users.find(item => item.nameKey === session.nameKey);
  return user ? { token, session, user } : null;
}
function requireUser(req, res) {
  const auth = getSession(req);
  if (!auth) { sendJson(res, 401, { error: "Please sign in first." }); return null; }
  return auth;
}
function safeUser(user) {
  return {
    id: user.id, username: user.username, displayName: user.displayName || user.username,
    role: user.role, bio: user.bio || "", pronouns: user.pronouns || "",
    avatar: user.avatar || "", banner: user.banner || "", status: user.status || "online",
    coins: user.coins || 0, ownedEffects: user.ownedEffects || [],
    equippedEffect: user.equippedEffect || "", selectedApps: user.selectedApps || [],
    createdAt: user.createdAt
  };
}
function safeAccountUser(user) { return { ...safeUser(user), email: user.email || "" }; }
function safePublicProfile(user) {
  return { id: user.id, username: user.username, displayName: user.displayName || user.username,
    role: user.role, bio: user.bio || "", pronouns: user.pronouns || "", avatar: user.avatar || "",
    banner: user.banner || "", status: user.status || "online", equippedEffect: user.equippedEffect || "" };
}
function utcDay() { return new Date().toISOString().slice(0, 10); }
function acceptPolicies(user, version) {
  if (version !== POLICY_VERSION) return false;
  user.acceptedPolicyVersion = POLICY_VERSION;
  user.acceptedPolicyAt = new Date().toISOString();
  return true;
}
function sessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `zorune_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_AGE / 1000)}${secure}`;
}
function issueSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { nameKey: user.nameKey, expiresAt: Date.now() + SESSION_AGE });
  return token;
}
function publishUpdate() {
  const packet = `data: ${JSON.stringify({ messages: store.messages.slice(-200) })}\n\n`;
  for (const client of eventClients) { try { client.write(packet); } catch { eventClients.delete(client); } }
}
async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/tmdb/config") {
    return sendJson(res, 200, { configured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN?.trim()) });
  }
  if (req.method === "GET" && url.pathname === "/api/tmdb/trending") {
    const window = url.searchParams.get("window") === "day" ? "day" : "week";
    return tmdbJson(res, `/trending/movie/${window}?language=en-US`);
  }
  if (req.method === "GET" && url.pathname === "/api/tmdb/search") {
    const query = String(url.searchParams.get("query") || "").trim().slice(0, 100);
    if (!query) return sendJson(res, 400, { error: "Enter a movie title to search." });
    return tmdbJson(res, `/search/movie?include_adult=false&language=en-US&page=1&query=${encodeURIComponent(query)}`);
  }
  if (req.method === "GET" && /^\/api\/tmdb\/movie\/\d+$/.test(url.pathname)) {
    return tmdbJson(res, `/movie/${url.pathname.split("/").pop()}?language=en-US`);
  }
  if (req.method === "GET" && url.pathname === "/api/tmdb/image") {
    const imagePath = String(url.searchParams.get("path") || "");
    if (!/^\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/i.test(imagePath) || imagePath.split("/").includes("..")) return sendJson(res, 400, { error: "Invalid image path." });
    try {
      const upstream = await fetch(`https://image.tmdb.org/t/p/w500${imagePath}`, { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) return sendJson(res, 404, { error: "Image not found." });
      const imageType = upstream.headers.get("content-type") || "image/jpeg";
      if (!/^image\/(jpeg|png|webp)$/i.test(imageType)) return sendJson(res, 502, { error: "TMDB returned an unsupported image." });
      if (Number(upstream.headers.get("content-length") || 0) > 5 * 1024 * 1024) return sendJson(res, 413, { error: "Image is too large." });
      const image = Buffer.from(await upstream.arrayBuffer());
      if (image.length > 5 * 1024 * 1024) return sendJson(res, 413, { error: "Image is too large." });
      res.writeHead(200, { "Content-Type": imageType, "Content-Length": image.length, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
      return res.end(image);
    } catch { return sendJson(res, 502, { error: "TMDB artwork could not be loaded." }); }
  }
  if (req.method === "GET" && url.pathname === "/api/tmdb/logo") {
    try {
      const upstream = await fetch("https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg", { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) return sendJson(res, 404, { error: "TMDB logo could not be loaded." });
      const logo = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Length": logo.length, "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
      return res.end(logo);
    } catch { return sendJson(res, 502, { error: "TMDB logo could not be loaded." }); }
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    return sendJson(res, 200, { ownerSetupRequired: !store.users.some(user => user.role === "owner"), policyVersion: POLICY_VERSION });
  }
  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const displayName = String(body.displayName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[a-zA-Z0-9_ -]{2,24}$/.test(username)) return sendJson(res, 400, { error: "Use 2–24 letters, numbers, spaces, dashes, or underscores for your name." });
    if (!displayName || displayName.length > 32) return sendJson(res, 400, { error: "Display name must be 1–32 characters." });
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 200) return sendJson(res, 400, { error: "Password must be at least 8 characters." });
    if (body.policyVersion !== POLICY_VERSION) return sendJson(res, 400, { error: "Please accept the current terms and privacy policy first." });
    const nameKey = username.toLocaleLowerCase("en-US");
    if (store.users.some(user => user.nameKey === nameKey)) return sendJson(res, 409, { error: "That username is already in use." });
    if (store.users.some(user => user.email && user.email.toLowerCase() === email)) return sendJson(res, 409, { error: "That email address already has an account." });
    const needsOwner = !store.users.some(user => user.role === "owner");
    if (needsOwner && (!store.setupCodeHash || hashSetupCode(body.setupCode || "") !== store.setupCodeHash)) return sendJson(res, 403, { error: "Enter the one-time owner setup code shown in the server terminal." });
    const passwordData = await passwordRecord(password);
    const selectedApps = Array.isArray(body.selectedApps) ? [...new Set(body.selectedApps.map(item => String(item).slice(0, 30)))].filter(item => /^[a-zA-Z]+$/.test(item)).slice(0, 8) : [];
    const user = { id: crypto.randomUUID(), username, nameKey, displayName, email, role: needsOwner ? "owner" : "member", bio: "", pronouns: "", avatar: "", banner: "", status: "online", coins: 100, dailyClaimDay: "", activityRewardDay: "", activityRewardCount: 0, ownedEffects: [], equippedEffect: "", selectedApps, acceptedPolicyVersion: POLICY_VERSION, acceptedPolicyAt: new Date().toISOString(), ...passwordData, createdAt: new Date().toISOString() };
    store.users.push(user);
    if (needsOwner) store.setupCodeHash = null;
    writeStore();
    const token = issueSession(user);
    return sendJson(res, 201, { user: safeAccountUser(user) }, { "Set-Cookie": sessionCookie(token) });
  }
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    if (body.policyVersion !== POLICY_VERSION) return sendJson(res, 400, { error: "Please accept the current terms and privacy policy first." });
    const identity = String(body.identity || body.username || "").trim().toLocaleLowerCase("en-US");
    const user = store.users.find(item => item.nameKey === identity || (item.email && item.email.toLocaleLowerCase("en-US") === identity));
    if (!user || !(await verifyPassword(String(body.password || ""), user))) return sendJson(res, 401, { error: "Username/email or password is incorrect." });
    acceptPolicies(user, body.policyVersion);
    user.status = "online";
    writeStore();
    const token = issueSession(user);
    return sendJson(res, 200, { user: safeAccountUser(user) }, { "Set-Cookie": sessionCookie(token) });
  }
  if (req.method === "POST" && url.pathname === "/api/logout") {
    const auth = getSession(req);
    if (auth) { sessions.delete(auth.token); auth.user.status = "offline"; writeStore(); }
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "zorune_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }
  if (req.method === "GET" && url.pathname === "/api/me") {
    const auth = requireUser(req, res); if (!auth) return;
    return sendJson(res, 200, { user: safeAccountUser(auth.user) });
  }
  if (req.method === "DELETE" && url.pathname === "/api/account") {
    const auth = requireUser(req, res); if (!auth) return;
    const userId = auth.user.id;
    if (auth.user.role === "owner" && store.users.filter(user => user.role === "owner").length === 1) {
      const setupCode = crypto.randomBytes(5).toString("hex").toUpperCase(); store.setupCodeHash = hashSetupCode(setupCode);
      console.log("\nOwner account removed. New first-account setup code: " + setupCode + "\n");
    }
    store.users = store.users.filter(user => user.id !== userId);
    store.messages = store.messages.filter(message => message.userId !== userId);
    for (const [token, session] of sessions) if (session.nameKey === auth.user.nameKey) sessions.delete(token);
    writeStore(); publishUpdate();
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "zorune_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }
  if (req.method === "PATCH" && url.pathname === "/api/profile") {
    const auth = requireUser(req, res); if (!auth) return;
    const body = await readBody(req), user = auth.user;
    if (body.displayName !== undefined) { const value = String(body.displayName).trim(); if (!value || value.length > 32) return sendJson(res, 400, { error: "Display name must be 1–32 characters." }); user.displayName = value; }
    if (body.bio !== undefined) { const value = String(body.bio).trim(); if (value.length > 160) return sendJson(res, 400, { error: "Bio must be 160 characters or fewer." }); user.bio = value; }
    if (body.pronouns !== undefined) { const value = String(body.pronouns).trim(); if (value.length > 32) return sendJson(res, 400, { error: "Pronouns must be 32 characters or fewer." }); user.pronouns = value; }
    if (body.status !== undefined) { if (!["online", "idle", "busy", "invisible"].includes(body.status)) return sendJson(res, 400, { error: "Choose a valid status." }); user.status = body.status; }
    for (const key of ["avatar", "banner"]) if (body[key] !== undefined) {
      const value = String(body[key]);
      const max = key === "avatar" ? 350000 : 700000;
      if (value && (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(value) || value.length > max)) return sendJson(res, 400, { error: `${key === "avatar" ? "Profile photo" : "Banner"} must be a supported image under ${key === "avatar" ? "250 KB" : "500 KB"}.` });
      user[key] = value;
    }
    if (body.selectedApps !== undefined) user.selectedApps = Array.isArray(body.selectedApps) ? [...new Set(body.selectedApps.map(item => String(item).slice(0, 30)))].filter(item => /^[a-zA-Z]+$/.test(item)).slice(0, 8) : [];
    if (body.equippedEffect !== undefined) { const value = String(body.equippedEffect); if (value && !user.ownedEffects.includes(value)) return sendJson(res, 403, { error: "Buy that name effect before equipping it." }); user.equippedEffect = value; }
    writeStore();
    return sendJson(res, 200, { user: safeAccountUser(user) });
  }
  if (req.method === "GET" && url.pathname === "/api/shop") {
    const auth = requireUser(req, res); if (!auth) return;
    return sendJson(res, 200, { coins: auth.user.coins || 0, ownedEffects: auth.user.ownedEffects || [], equippedEffect: auth.user.equippedEffect || "", items: NAME_EFFECTS });
  }
  if (req.method === "POST" && url.pathname === "/api/shop/buy") {
    const auth = requireUser(req, res); if (!auth) return;
    const body = await readBody(req), user = auth.user, item = NAME_EFFECTS.find(entry => entry.id === body.itemId);
    if (!item) return sendJson(res, 404, { error: "That shop item is no longer available." });
    if ((user.ownedEffects || []).includes(item.id)) return sendJson(res, 409, { error: "You already own this name effect." });
    if ((user.coins || 0) < item.cost) return sendJson(res, 400, { error: "You need more coins for this effect." });
    user.coins -= item.cost; user.ownedEffects ||= []; user.ownedEffects.push(item.id); user.equippedEffect = item.id;
    writeStore(); return sendJson(res, 200, { coins: user.coins, ownedEffects: user.ownedEffects, equippedEffect: user.equippedEffect });
  }
  if (req.method === "POST" && url.pathname === "/api/rewards/daily") {
    const auth = requireUser(req, res); if (!auth) return;
    const user = auth.user, today = utcDay();
    if (user.dailyClaimDay === today) return sendJson(res, 409, { error: "You already claimed today’s reward." });
    user.dailyClaimDay = today; user.coins = (user.coins || 0) + 50; writeStore();
    return sendJson(res, 200, { coins: user.coins, earned: 50 });
  }
  if (req.method === "POST" && url.pathname === "/api/activity") {
    const auth = requireUser(req, res); if (!auth) return;
    const body = await readBody(req);
    const user = auth.user, now = Date.now(), today = utcDay(), key = auth.token;
    if (user.activityRewardDay !== today) { user.activityRewardDay = today; user.activityRewardCount = 0; user.activitySeconds = 0; }
    const prior = activityPings.get(key) || now;
    activityPings.set(key, now);
    if (body.active === true && now - prior <= 90000) user.activitySeconds = (user.activitySeconds || 0) + Math.min(75, Math.floor((now - prior) / 1000));
    let earned = 0;
    if ((user.activitySeconds || 0) >= 600 && (user.activityRewardCount || 0) < 6) {
      user.activitySeconds -= 600; earned = 2 + crypto.randomInt(7); user.coins = (user.coins || 0) + earned; user.activityRewardCount++;
      writeStore();
    }
    return sendJson(res, 200, { coins: user.coins || 0, earned });
  }
  if (req.method === "GET" && url.pathname === "/api/messages") {
    const auth = requireUser(req, res); if (!auth) return;
    return sendJson(res, 200, { messages: store.messages.slice(-200) });
  }
  if (req.method === "GET" && url.pathname === "/api/events") {
    const auth = requireUser(req, res); if (!auth) return;
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
    res.write(": connected\n\n");
    eventClients.add(res);
    const heartbeat = setInterval(() => { try { res.write(": keepalive\n\n"); } catch { clearInterval(heartbeat); } }, 25000);
    res.on("close", () => { eventClients.delete(res); clearInterval(heartbeat); });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/messages") {
    const auth = requireUser(req, res); if (!auth) return;
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    if (!text || text.length > 500) return sendJson(res, 400, { error: "Messages must be 1–500 characters." });
    const message = { id: crypto.randomUUID(), userId: auth.user.id, username: auth.user.username, role: auth.user.role, profile: safePublicProfile(auth.user), text, createdAt: new Date().toISOString() };
    store.messages.push(message); store.messages = store.messages.slice(-500); writeStore(); publishUpdate();
    return sendJson(res, 201, { message });
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/messages/")) {
    const auth = requireUser(req, res); if (!auth) return;
    if (auth.user.role !== "owner" && auth.user.role !== "moderator") return sendJson(res, 403, { error: "Only an owner or moderator can remove messages." });
    const id = decodeURIComponent(url.pathname.slice("/api/messages/".length));
    const lengthBefore = store.messages.length; store.messages = store.messages.filter(message => message.id !== id);
    if (store.messages.length === lengthBefore) return sendJson(res, 404, { error: "Message not found." });
    writeStore(); publishUpdate(); return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/users") {
    const auth = requireUser(req, res); if (!auth) return;
    if (auth.user.role !== "owner") return sendJson(res, 403, { error: "Only an owner can manage roles." });
    return sendJson(res, 200, { users: store.users.map(safeUser) });
  }
  if (req.method === "PATCH" && url.pathname.startsWith("/api/users/")) {
    const auth = requireUser(req, res); if (!auth) return;
    if (auth.user.role !== "owner") return sendJson(res, 403, { error: "Only an owner can manage roles." });
    const username = decodeURIComponent(url.pathname.slice("/api/users/".length));
    const target = store.users.find(user => user.nameKey === username.toLocaleLowerCase("en-US"));
    if (!target) return sendJson(res, 404, { error: "User not found." });
    const body = await readBody(req);
    if (!["owner", "moderator", "member"].includes(body.role)) return sendJson(res, 400, { error: "Choose owner, moderator, or member." });
    if (target.role === "owner" && body.role !== "owner" && store.users.filter(user => user.role === "owner").length < 2) return sendJson(res, 400, { error: "Promote another owner before changing the only owner role." });
    target.role = body.role;
    for (const message of store.messages) if (message.username.toLocaleLowerCase("en-US") === target.nameKey) message.role = target.role;
    writeStore(); publishUpdate();
    return sendJson(res, 200, { user: safeUser(target) });
  }
  return sendJson(res, 404, { error: "API route not found." });
}
async function tmdbJson(res, endpoint) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token) return sendJson(res, 503, { error: "TMDB is not configured. Set TMDB_READ_ACCESS_TOKEN in the server terminal, then restart zoruneOS." });
  try {
    const upstream = await fetch(`https://api.themoviedb.org/3${endpoint}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return sendJson(res, upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status, { error: upstream.status === 401 || upstream.status === 403 ? "TMDB rejected the access token. Check the token and restart the server." : data.status_message || "TMDB could not complete the request." });
    return sendJson(res, 200, data);
  } catch (error) {
    return sendJson(res, 502, { error: error.name === "TimeoutError" ? "TMDB took too long to respond. Try again." : "Could not reach TMDB. Check the server internet connection." });
  }
}
function servePackageFile(req, res, packageRoot, requestedPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestedPath); } catch { return sendJson(res, 400, { error: "Invalid path." }); }
  const filePath = path.resolve(packageRoot, "." + (decoded.startsWith("/") ? decoded : "/" + decoded));
  if (!filePath.startsWith(packageRoot + path.sep)) return sendJson(res, 404, { error: "Not found." });
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: "Not found." });
    const types = { ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".wasm":"application/wasm", ".json":"application/json; charset=utf-8" };
    res.writeHead(200, { "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":"public, max-age=3600", "Cross-Origin-Opener-Policy":"same-origin", "Cross-Origin-Embedder-Policy":"require-corp" });
    fs.createReadStream(filePath).pipe(res);
  });
}function serveFile(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return sendJson(res, 400, { error: "Invalid path." }); }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, "." + pathname);
  const relativePath = path.relative(ROOT, filePath);

  if (!filePath.startsWith(ROOT + path.sep) || !PUBLIC_FILES.has(relativePath)) return sendJson(res, 404, { error: "Not found." });
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: "Not found." });
    const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
    res.writeHead(200, { "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"strict-origin-when-cross-origin", "X-Frame-Options":"DENY", "Cache-Control":"no-cache", "Cross-Origin-Opener-Policy":"same-origin", "Cross-Origin-Embedder-Policy":"require-corp", ...(path.basename(filePath) === "sw.js" ? {"Service-Worker-Allowed":"/"} : {}) });
    fs.createReadStream(filePath).pipe(res);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    try { await handleApi(req, res, url); }
    catch (error) { if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : "The server could not complete that request." }); else res.end(); }
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed." });
  if (url.pathname.startsWith("/scram/")) return servePackageFile(req, res, scramjetPath, url.pathname.slice(7));
  if (url.pathname.startsWith("/libcurl/")) return servePackageFile(req, res, libcurlPath, url.pathname.slice(9));
  if (url.pathname.startsWith("/baremux/")) return servePackageFile(req, res, baremuxPath, url.pathname.slice(9));
  serveFile(req, res, url);
});
server.on("upgrade", (req, socket, head) => {
  let pathname = "";
  try { pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname; } catch {}
  if (pathname !== "/wisp/") { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
  let origin;
  try { origin = new URL(req.headers.origin || ""); } catch {}
  if (!origin || !["http:", "https:"].includes(origin.protocol) || origin.host !== req.headers.host) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
  const auth = getSession(req);
  if (!auth) { socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); return; }
  const connectionKey = auth.user.id || auth.user.nameKey;
  const count = wispConnections.get(connectionKey) || 0;
  if (count >= 3) { socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n"); return; }
  wispConnections.set(connectionKey, count + 1);
  let released = false;
  const release = () => { if (released) return; released = true; const next = (wispConnections.get(connectionKey) || 1) - 1; if (next <= 0) wispConnections.delete(connectionKey); else wispConnections.set(connectionKey, next); };
  socket.once("close", release); socket.once("error", release);
  wisp.routeRequest(req, socket, head);
});
function listen(port, fallbackCount = 0) {
  server.once("error", error => {
    if (error.code === "EADDRINUSE" && !process.env.PORT && fallbackCount < 10) {
      console.warn(`Port ${port} is already in use; trying ${port + 1}.`);
      listen(port + 1, fallbackCount + 1);
      return;
    }
    console.error("Could not start the zoruneos server:", error.message);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => console.log(`zoruneos server is running at http://localhost:${port}`));
}
listen(PORT);






