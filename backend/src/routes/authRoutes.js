import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import db from '../db/index.js';
import { signToken } from '../utils/jwt.js';
import {
  connexionReussie,
  connexionEchouee,
  compterTentativesRecentes,
  listerRolesParUtilisateur,
  journaliserAction,
} from '../services/authService.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: config.login.windowMinutes * 60 * 1000,
  max: config.login.maxAttempts * 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez plus tard.' },
});

function extraireIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'inconnue';
}

router.post('/login', loginLimiter, async (req, res, next) => {
  const { identifiant, mot_de_passe } = req.body ?? {};
  const ip = extraireIp(req);
  const userAgent = req.get('user-agent') ?? null;

  if (!identifiant || !mot_de_passe) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  }

  try {
    const { rows } = await db.query(
      `SELECT u.*, e.nom AS ecole_nom, e.sous_domaine, e.statut AS ecole_statut,
              e.couleur_principale, e.logo_base64, e.adresse, e.telephone,
              e.email AS ecole_email, e.slogan
       FROM users u
       LEFT JOIN ecoles e ON e.id = u.ecole_id
       WHERE LOWER(u.identifiant) = LOWER($1)`,
      [identifiant]
    );
    const user = rows[0];

    let valide = false;
    if (user) {
      const ok = await bcrypt.compare(mot_de_passe, user.mot_de_passe_hash);
      if (user.ecole_statut !== 'actif') {
        return res.status(403).json({ error: 'Établissement suspendu — contacter le support' });
      }
      if (ok && user.statut === 'actif') valide = true;
      else {
        const tentatives = await compterTentativesRecentes(identifiant, config.login.windowMinutes);
        if (tentatives >= config.login.maxAttempts) {
          return res.status(429).json({
            error: `Compte temporairement bloqué après ${config.login.maxAttempts} échecs. Réessayez plus tard.`,
          });
        }
      }
    }

    if (!valide || !user) {
      await connexionEchouee({ identifiant, ip, userAgent });
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

    const roles = await listerRolesParUtilisateur(user.id);
    await connexionReussie({ userId: user.id, identifiant, ip, userAgent });

    const token = signToken({ userId: user.id, ecoleId: user.ecole_id, etablissementId: user.ecole_id });

    res.json({
      token,
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        identifiant: user.identifiant,
        ecoleId: user.ecole_id,
        ecoleNom: user.ecole_nom,
        roles,
        ecole: {
          id: user.ecole_id,
          nom: user.ecole_nom,
          sous_domaine: user.sous_domaine,
          couleur_principale: user.couleur_principale,
          logo_base64: user.logo_base64,
          adresse: user.adresse,
          telephone: user.telephone,
          email: user.ecole_email,
          slogan: user.slogan,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', authenticate, async (req, res) => {
  await journaliserAction({
    userId: req.user.id,
    action: 'deconnexion',
    cible: 'session',
  });
  res.status(204).end();
});

router.post('/changer-mot-de-passe', authenticate, async (req, res, next) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body ?? {};
  if (!ancien_mot_de_passe || !nouveau_mot_de_passe) {
    return res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' });
  }
  if (nouveau_mot_de_passe.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
  }

  try {
    const { rows } = await db.query('SELECT mot_de_passe_hash FROM users WHERE id = $1', [req.user.id]);
    const valide = await bcrypt.compare(ancien_mot_de_passe, rows[0].mot_de_passe_hash);
    if (!valide) {
      return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
    }

    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await db.query('UPDATE users SET mot_de_passe_hash = $1 WHERE id = $2', [hash, req.user.id]);
    await journaliserAction({
      userId: req.user.id,
      action: 'changement_mot_de_passe',
      cible: 'users',
      details: { cible_id: req.user.id },
    });
    res.json({ message: 'Mot de passe modifié' });
  } catch (err) {
    next(err);
  }
});

export default router;