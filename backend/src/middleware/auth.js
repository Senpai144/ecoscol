import { verifyToken } from '../utils/jwt.js';
import { listerRolesParUtilisateur } from '../services/authService.js';
import db from '../db/index.js';

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  let payload;
  try {
    payload = verifyToken(header.slice(7));
  } catch (err) {
    return res.status(401).json({ error: 'Session expirée ou invalide' });
  }

  const { rows } = await db.query(
    'SELECT id, ecole_id, nom, prenom, identifiant, statut FROM users WHERE id = $1',
    [payload.userId]
  );
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Compte introuvable' });
  }
  if (user.statut !== 'actif') {
    return res.status(403).json({ error: 'Compte désactivé' });
  }

  if (user.statut === 'actif') {
    const roles = await listerRolesParUtilisateur(user.id);
    req.user = { ...user, roles };
  }
  next();
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    const allowed = new Set(allowedRoles);
    if (!req.user.roles.some((role) => allowed.has(role))) {
      return res.status(403).json({ error: 'Accès refusé : permissions insuffisantes' });
    }
    next();
  };
}