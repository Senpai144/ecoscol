import { Router } from 'express';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';

const router = Router();

router.use(authenticate);

// ---- Niveaux ----
router.get('/niveaux', requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR', 'COMPTABLE'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM niveaux WHERE ecole_id = $1 ORDER BY ordre',
      [req.user.ecole_id]
    );
    res.json({ niveaux: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/niveaux', requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR'), async (req, res, next) => {
  const { libelle, ordre } = req.body ?? {};
  if (!libelle || ordre === undefined) {
    return res.status(400).json({ error: 'Libellé et ordre requis' });
  }
  try {
    const { rows } = await db.query(
      'INSERT INTO niveaux (ecole_id, libelle, ordre) VALUES ($1, $2, $3) RETURNING *',
      [req.user.ecole_id, libelle, ordre]
    );
    await journaliserAction({ userId: req.user.id, action: 'creation_niveau', cible: 'niveaux', details: rows[0] });
    res.status(201).json({ niveau: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Niveau déjà existant' });
    next(err);
  }
});

// ---- Séries ----
router.get('/series', requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR', 'COMPTABLE'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM series WHERE ecole_id = $1 ORDER BY libelle',
      [req.user.ecole_id]
    );
    res.json({ series: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/series', requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR'), async (req, res, next) => {
  const { libelle } = req.body ?? {};
  if (!libelle) return res.status(400).json({ error: 'Libellé requis' });
  try {
    const { rows } = await db.query(
      'INSERT INTO series (ecole_id, libelle) VALUES ($1, $2) RETURNING *',
      [req.user.ecole_id, libelle]
    );
    await journaliserAction({ userId: req.user.id, action: 'creation_serie', cible: 'series', details: rows[0] });
    res.status(201).json({ serie: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Série déjà existante' });
    next(err);
  }
});

// ---- Années scolaires ----
router.get('/annees-scolaires', requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR', 'COMPTABLE'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM annees_scolaires WHERE ecole_id = $1 ORDER BY date_debut DESC',
      [req.user.ecole_id]
    );
    res.json({ anneesScolaires: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/annees-scolaires', requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR'), async (req, res, next) => {
  const { libelle, date_debut, date_fin, active } = req.body ?? {};
  if (!libelle || !date_debut || !date_fin) {
    return res.status(400).json({ error: 'Libellé, date de début et date de fin requis' });
  }
  if (new Date(date_fin) <= new Date(date_debut)) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (active) {
      await client.query('UPDATE annees_scolaires SET active = FALSE WHERE ecole_id = $1', [req.user.ecole_id]);
    }
    const { rows } = await client.query(
      'INSERT INTO annees_scolaires (ecole_id, libelle, date_debut, date_fin, active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.ecole_id, libelle, date_debut, date_fin, Boolean(active)]
    );
    await client.query('COMMIT');
    await journaliserAction({ userId: req.user.id, action: 'creation_annee_scolaire', cible: 'annees_scolaires', details: rows[0] });
    res.status(201).json({ anneeScolaire: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'Année scolaire déjà existante' });
    next(err);
  } finally {
    client.release();
  }
});

router.patch('/annees-scolaires/:id/activer', requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR'), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE annees_scolaires SET active = FALSE WHERE ecole_id = $1', [req.user.ecole_id]);
    const { rows } = await client.query(
      'UPDATE annees_scolaires SET active = TRUE WHERE id = $1 AND ecole_id = $2 RETURNING *',
      [id, req.user.ecole_id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Année scolaire introuvable' });
    }
    await client.query('COMMIT');
    await journaliserAction({ userId: req.user.id, action: 'activation_annee_scolaire', cible: 'annees_scolaires', details: rows[0] });
    res.json({ anneeScolaire: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

export default router;