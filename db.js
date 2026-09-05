// db.js — banco de dados (SQLite local). Formato CommonJS.
const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database(process.env.DB_PATH || './oficina.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  credits INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by TEXT,
  unlimited_credits INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  signup_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_verifications (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  payload TEXT,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, purpose)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invited_user_id TEXT NOT NULL,
  credited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS anon_credits (
  ip TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 20,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS error_history (
  id TEXT PRIMARY KEY,
  pedido TEXT NOT NULL,
  resumo_erro TEXT,
  resumo_solucao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ip_signups (
  ip TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  prompt TEXT NOT NULL,
  plano TEXT,
  html TEXT NOT NULL,
  nome TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'pending',
  gateway TEXT,
  gateway_checkout_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}

try {
  db.exec('ALTER TABLE users ADD COLUMN github_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id)');
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}

try {
  db.exec('ALTER TABLE projects ADD COLUMN files TEXT');
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) throw error;
}

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function genReferralCode() {
  return crypto.randomBytes(4).toString('hex');
}

const CREDIT_RULES = {
  SIGNUP_FREE: 20,
  SIGNUP_VIA_INVITE_BONUS: 0,
  INVITE_TIERS: [
    { tier: 1, invitesRequired: 1, bonus: 20 },
    { tier: 2, invitesRequired: 2, bonus: 20 },
    { tier: 3, invitesRequired: 3, bonus: 20 },
  ],
};

function createUser({ email, name, referredByCode, signupIp, githubId }) {
  const id = newId();
  const referralCode = genReferralCode();

  let referredBy = null;
  let startingCredits = CREDIT_RULES.SIGNUP_FREE;

  if (referredByCode) {
    const referrer = db.prepare('SELECT * FROM users WHERE referral_code = ?').get(referredByCode);
    if (referrer) {
      referredBy = referrer.id;
      startingCredits += CREDIT_RULES.SIGNUP_VIA_INVITE_BONUS;
    }
  }

  db.prepare(
    `INSERT INTO users (id, email, name, credits, referral_code, referred_by, signup_ip, github_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, email, name || null, startingCredits, referralCode, referredBy, signupIp || null, githubId || null);

  if (signupIp) {
    db.prepare('INSERT INTO ip_signups (ip, user_id) VALUES (?, ?)').run(signupIp, id);
  }

  if (referredBy) {
    db.prepare(
      'INSERT INTO invites (id, inviter_id, invited_user_id, credited) VALUES (?, ?, ?, 0)'
    ).run(newId(), referredBy, id);
  }

  return getUserById(id);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByGithubId(githubId) {
  return db.prepare('SELECT * FROM users WHERE github_id = ?').get(githubId);
}

function linkGithubAccount(userId, githubId) {
  db.prepare('UPDATE users SET github_id = ? WHERE id = ?').run(githubId, userId);
  return getUserById(userId);
}

function saveAuthVerification({ email, purpose, codeHash, payload, expiresAt }) {
  db.prepare(
    `INSERT INTO auth_verifications (email, purpose, code_hash, payload, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email, purpose) DO UPDATE SET
       code_hash = excluded.code_hash,
       payload = excluded.payload,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = datetime('now')`
  ).run(email, purpose, codeHash, payload ? JSON.stringify(payload) : null, expiresAt);
}

function getAuthVerification(email, purpose) {
  return db.prepare('SELECT * FROM auth_verifications WHERE email = ? AND purpose = ?').get(email, purpose);
}

function incrementAuthVerificationAttempts(email, purpose) {
  db.prepare('UPDATE auth_verifications SET attempts = attempts + 1 WHERE email = ? AND purpose = ?').run(email, purpose);
}

function deleteAuthVerification(email, purpose) {
  db.prepare('DELETE FROM auth_verifications WHERE email = ? AND purpose = ?').run(email, purpose);
}

function markEmailVerified(userId) {
  db.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?").run(userId);
  return getUserById(userId);
}

function countSignupsByIp(ip) {
  return db.prepare('SELECT COUNT(*) as c FROM ip_signups WHERE ip = ?').get(ip).c;
}

function deductCredit(userId) {
  const user = getUserById(userId);
  if (!user) throw new Error('Usuário não encontrado');
  if (user.unlimited_credits) return user;
  if (user.credits <= 0) throw new Error('SEM_CREDITOS');
  db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(userId);
  return getUserById(userId);
}

function applyInviteBonusIfNeeded(invitedUserId) {
  const invite = db.prepare('SELECT * FROM invites WHERE invited_user_id = ? AND credited = 0').get(invitedUserId);
  if (!invite) return;

  const users = db.prepare('SELECT id, signup_ip FROM users WHERE id IN (?, ?)').all(invite.inviter_id, invitedUserId);
  const inviter = users.find((user) => user.id === invite.inviter_id);
  const invited = users.find((user) => user.id === invitedUserId);
  if (!inviter || !invited || !inviter.signup_ip || !invited.signup_ip || inviter.signup_ip === invited.signup_ip) return;

  const inviterCreditedCount = db
    .prepare('SELECT COUNT(*) as c FROM invites WHERE inviter_id = ? AND credited = 1')
    .get(invite.inviter_id).c;

  const nextTierIndex = Math.min(inviterCreditedCount, CREDIT_RULES.INVITE_TIERS.length - 1);
  const bonus = CREDIT_RULES.INVITE_TIERS[nextTierIndex].bonus;

  db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(bonus, invite.inviter_id);
  db.prepare('UPDATE invites SET credited = 1 WHERE id = ?').run(invite.id);

  return bonus;
}

function invitesRequiredForNextTier(user) {
  const doneInvites = db
    .prepare('SELECT COUNT(*) as c FROM invites WHERE inviter_id = ? AND credited = 1')
    .get(user.id).c;
  const tierIndex = Math.min(doneInvites, CREDIT_RULES.INVITE_TIERS.length - 1);
  return CREDIT_RULES.INVITE_TIERS[tierIndex];
}

function setUnlimited(userId, value) {
  db.prepare('UPDATE users SET unlimited_credits = ? WHERE id = ?').run(value ? 1 : 0, userId);
  return getUserById(userId);
}

// ---------- Projetos salvos (o "guardar na plataforma") ----------

function saveProject({ userId, prompt, plano, html, files, nome }) {
  const id = newId();
  db.prepare(
    `INSERT INTO projects (id, user_id, prompt, plano, html, files, nome) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId || null, prompt, JSON.stringify(plano || []), html, files ? JSON.stringify(files) : null, nome || prompt.slice(0, 60));
  return getProjectById(id);
}

function getProjectById(id) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return project;
  return { ...project, files: project.files ? JSON.parse(project.files) : null };
}

function listProjectsByUser(userId) {
  return db
    .prepare('SELECT id, prompt, plano, html, files, nome, created_at FROM projects WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map((project) => ({
      ...project,
      plano: JSON.parse(project.plano || '[]'),
      files: project.files ? JSON.parse(project.files) : null,
    }));
}

function createPendingSubscription({ userId, planId, amount, currency, gateway, gatewayCheckoutId }) {
  const id = newId();
  db.prepare(
     `INSERT INTO subscriptions (id, user_id, plan_id, amount, currency, gateway, gateway_checkout_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, planId, amount, currency, gateway || null, gatewayCheckoutId || null);
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
}

// ---------- Créditos anônimos por IP (sem precisar de conta) ----------

const ANON_CREDITOS_INICIAIS = 20;

function getAnonCredits(ip) {
  const existente = db.prepare('SELECT * FROM anon_credits WHERE ip = ?').get(ip);
  if (existente) return existente;
  db.prepare('INSERT INTO anon_credits (ip, credits) VALUES (?, ?)').run(ip, ANON_CREDITOS_INICIAIS);
  return db.prepare('SELECT * FROM anon_credits WHERE ip = ?').get(ip);
}

function deductAnonCredit(ip) {
  const atual = getAnonCredits(ip);
  if (atual.credits <= 0) throw new Error('SEM_CREDITOS');
  db.prepare('UPDATE anon_credits SET credits = credits - 1 WHERE ip = ?').run(ip);
  return getAnonCredits(ip);
}

// ---------- Memória de erros já corrigidos (pra IA não repetir) ----------

function registrarErro({ pedido, resumoErro, resumoSolucao }) {
  const id = newId();
  db.prepare(
    'INSERT INTO error_history (id, pedido, resumo_erro, resumo_solucao) VALUES (?, ?, ?, ?)'
  ).run(id, pedido, resumoErro || pedido, resumoSolucao || null);
  return db.prepare('SELECT * FROM error_history WHERE id = ?').get(id);
}

function listarErrosRecentes(limite = 8) {
  return db.prepare('SELECT * FROM error_history ORDER BY created_at DESC LIMIT ?').all(limite);
}

module.exports = {
  CREDIT_RULES,
  createUser,
  getUserByEmail,
  getUserById,
  getUserByGithubId,
  linkGithubAccount,
  saveAuthVerification,
  getAuthVerification,
  incrementAuthVerificationAttempts,
  deleteAuthVerification,
  markEmailVerified,
  countSignupsByIp,
  deductCredit,
  applyInviteBonusIfNeeded,
  invitesRequiredForNextTier,
  setUnlimited,
  saveProject,
  getProjectById,
  listProjectsByUser,
  createPendingSubscription,
  getAnonCredits,
  deductAnonCredit,
  registrarErro,
  listarErrosRecentes,
};
