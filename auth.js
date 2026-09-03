// auth.js — sessão via JWT em cookie httpOnly. Formato CommonJS.
const jwt = require('jsonwebtoken');
const { getUserById } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
console.log('[AUTH][ENV] JWT_SECRET', { configurado: Boolean(JWT_SECRET), tamanho: JWT_SECRET?.length || 0 });
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado no .env — gere um valor aleatório longo antes de rodar.');
}

function signUserToken(user) {
  console.log('[AUTH][SESSION] token sendo assinado', { usuarioId: user?.id, email: user?.email });
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.oficina_token;
  const payload = token && verifyToken(token);
  console.log('[AUTH][SESSION] cookie validado', { recebido: Boolean(token), valido: Boolean(payload), rota: req.originalUrl });
  if (!payload) return res.status(401).json({ error: 'Não autenticado' });
  const user = getUserById(payload.uid);
  if (!user || !user.email_verified_at) {
    res.clearCookie('oficina_token');
    return res.status(401).json({ error: 'E-mail não verificado' });
  }
  req.userId = payload.uid;
  next();
}

module.exports = { signUserToken, verifyToken, requireAuth };
