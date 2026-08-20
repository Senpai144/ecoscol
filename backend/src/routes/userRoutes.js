import { Router } from 'express';
import bcrypt from 'bcrypt';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';

const router = Router();

router.use(authenticate, requireRoles('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.identifiant, u.email, u.telephone,
              u.statut, u.dernier_acces, u.created_at,
              ARRAY_AGG(ur.role_code ORDER BY ur.role_code) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.ecole_id = $1
       GROUP BY u.id
       ORDER BY u.nom, u.prenom`,
      [req.user.ecole_id]
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { nom, prenom, identifiant, mot_de_passe, email, telephone, roles } = req.body ?? {};
  const ROLES_VALIDES = ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT', 'SURVEILLANT', 'COMPTABLE', 'PARENT'];
  if (!nom || !identifiant || !mot_de_passe || !Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'Nom, identifiant, mot de passe et au moins un rôle requis' });
  }
  if (!roles.every((r) => ROLES_VALIDES.includes(r))) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  if (mot_de_passe.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const { rows } = await client.query(
      `INSERT INTO users (ecole_id, nom, prenom, identifiant, mot_de_passe_hash, email, telephone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.user.ecole_id, nom, prenom ?? null, identifiant, hash, email ?? null, telephone ?? null]
    );
    const userId = rows[0].id;
    for (const role of roles) {
      await client.query('INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)', [userId, role]);
    }
    await client.query('COMMIT');
    await journaliserAction({
      userId: req.user.id,
      action: 'creation_compte',
      cible: 'users',
      details: { cible_id: userId, identifiant, roles },
    });
    res.status(201).json({ message: 'Compte créé', id: userId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Identifiant déjà utilisé' });
    }
    next(err);
  } finally {
    client.release();
  }
});

router.patch('/:id/statut', async (req, res, next) => {
  const { statut } = req.body ?? {};
  if (!['actif', 'desactive'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Impossible de désactiver votre propre compte' });
  }
  try {
    const result = await db.query(
      `UPDATE users SET statut = $1, updated_at = NOW()
       WHERE id = $2 AND ecole_id = $3
       RETURNING id, identifiant, statut`,
      [statut, id, req.user.ecole_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    await journaliserAction({
      userId: req.user.id,
      action: statut === 'desactive' ? 'desactivation_compte' : 'activation_compte',
      cible: 'users',
      details: { cible_id: id },
    });
    res.json({ message: 'Statut mis à jour' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reinitialiser-mot-de-passe', async (req, res, next) => {
  const { nouveau_mot_de_passe } = req.body ?? {};
  if (!nouveau_mot_de_passe || nouveau_mot_de_passe.length < 8) {
    return res.status(400).json({ error: 'Nouveau mot de passe requis (8 caractères minimum)' });
  }
  const id = parseInt(req.params.id, 10);
  try {
    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    const result = await db.query(
      'UPDATE users SET mot_de_passe_hash = $1 WHERE id = $2 AND ecole_id = $3 RETURNING id',
      [hash, id, req.user.ecole_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    await journaliserAction({
      userId: req.user.id,
      action: 'reinitialisation_mot_de_passe',
      cible: 'users',
      details: { cible_id: id },
    });
    res.json({ message: 'Mot de passe réinitialisé' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
  }
  try {
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 AND ecole_id = $2 RETURNING id',
      [id, req.user.ecole_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    await journaliserAction({
      userId: req.user.id,
      action: 'suppression_compte',
      cible: 'users',
      details: { cible_id: id },
    });
    res.json({ message: 'Compte supprimé' });
  } catch (err) {
    next(err);
  }
});

export default router;