import { Router } from 'express';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';

const router = Router();

router.use(authenticate);

const ROLES_LECTURE = ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT'];
const ROLES_ECRITURE = ['ADMIN', 'SECRETARIAT', 'CENSEUR'];

router.get('/', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, n.libelle AS niveau_libelle, s.libelle AS serie_libelle,
              a.libelle AS annee_libelle,
              COUNT(e.id)::int AS effectif
       FROM classes c
       JOIN niveaux n ON n.id = c.niveau_id
       LEFT JOIN series s ON s.id = c.serie_id
       JOIN annees_scolaires a ON a.id = c.annee_scolaire_id
       LEFT JOIN eleves e ON e.classe_id = c.id AND e.statut = 'actif'
       WHERE c.ecole_id = $1
       GROUP BY c.id, c.ecole_id, c.annee_scolaire_id, c.niveau_id, c.serie_id, c.libelle, c.capacite, c.salle,
                n.libelle, n.ordre, s.libelle, a.libelle, a.date_debut
       ORDER BY a.date_debut DESC, n.ordre, c.libelle`,
      [req.user.ecole_id]
    );
    res.json({ classes: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRoles(...ROLES_ECRITURE), async (req, res, next) => {
  const { annee_scolaire_id, niveau_id, serie_id, libelle, capacite, salle } = req.body ?? {};
  if (!annee_scolaire_id || !niveau_id || !libelle || capacite === undefined) {
    return res.status(400).json({ error: 'Année scolaire, niveau, libellé et capacité requis' });
  }
  if (capacite < 1 || capacite > 200) {
    return res.status(400).json({ error: 'Capacité invalide (1 à 200)' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO classes (ecole_id, annee_scolaire_id, niveau_id, serie_id, libelle, capacite, salle)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.ecole_id, annee_scolaire_id, niveau_id, serie_id ?? null, libelle, capacite, salle ?? null]
    );
    await journaliserAction({ userId: req.user.id, action: 'creation_classe', cible: 'classes', details: rows[0] });
    res.status(201).json({ classe: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Classe déjà existante pour cette année scolaire' });
    if (err.code === '23503') return res.status(400).json({ error: 'Niveau ou série invalide' });
    next(err);
  }
});

router.patch('/:id', requireRoles(...ROLES_ECRITURE), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { libelle, serie_id, capacite, salle } = req.body ?? {};
  try {
    const { rows } = await db.query(
      `UPDATE classes SET
         libelle = COALESCE($1, libelle),
         serie_id = COALESCE($2, serie_id),
         capacite = COALESCE($3, capacite),
         salle = COALESCE($4, salle)
       WHERE id = $5 AND ecole_id = $6
       RETURNING *`,
      [libelle ?? null, serie_id ?? null, capacite ?? null, salle ?? null, id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Classe introuvable' });
    await journaliserAction({ userId: req.user.id, action: 'modification_classe', cible: 'classes', details: rows[0] });
    res.json({ classe: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;