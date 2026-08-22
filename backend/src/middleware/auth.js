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
    `SELECT u.id, u.ecole_id, u.nom, u.prenom, u.identifiant, u.statut,
            e.statut AS etablissement_statut
     FROM users u
     JOIN ecoles e ON e.id = u.ecole_id
     WHERE u.id = $1`,
    [payload.userId]
  );
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Compte introuvable' });
  }
  if (user.statut !== 'actif') {
    return res.status(403).json({ error: 'Compte désactivé' });
  }
  if (user.etablissement_statut !== 'actif') {
    return res.status(403).json({ error: 'Établissement suspendu — contacter le support' });
  }

  if (user.statut === 'actif') {
    const roles = await listerRolesParUtilisateur(user.id);
    // Règle critique multi-tenant : l'établissement est TOUJOURS déduit de la session JWT,
    // jamais d'une valeur envoyée par le client.
    req.user = { ...user, roles };
    req.etablissement_id = user.ecole_id;
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