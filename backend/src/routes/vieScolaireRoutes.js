import { Router } from 'express';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { withTransaction } from '../db/index.js';
import { journaliserAction } from '../services/authService.js';
import { notifierParents } from '../services/notificationService.js';

const router = Router();
router.use(authenticate);

const ROLES_LECTURE = ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT', 'SURVEILLANT'];
const ROLES_SAISIE = ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT'];
const ROLES_GESTION = ['ADMIN', 'SECRETARIAT', 'CENSEUR'];

const TYPES_ABSENCE = new Set(['absence', 'retard']);
const TYPES_SANCTION = new Set(['avertissement', 'blame', 'exclusion', 'conseil_discipline']);

// ---- Appel (saisie groupée par classe + date) ----
router.post('/appel', requireRoles(...ROLES_SAISIE), async (req, res, next) => {
  const { classe_id, date, items } = req.body;
  try {
    if (!classe_id || !date || !Array.isArray(items)) {
      return res.status(400).json({ error: 'classe_id, date et items (tableau) sont requis' });
    }
    const { rows: classeRows } = await db.query(
      'SELECT id FROM classes WHERE id = $1 AND ecole_id = $2',
      [classe_id, req.user.ecole_id]
    );
    if (!classeRows[0]) {
      return res.status(404).json({ error: 'Classe introuvable dans l\'établissement' });
    }

    const entrees = items.map((i) => ({
      eleve_id: Number(i.eleve_id),
      type: i.type === null ? null : String(i.type),
    }));
    for (const e of entrees) {
      if (!Number.isInteger(e.eleve_id)) {
        return res.status(400).json({ error: 'eleve_id manquant ou invalide' });
      }
      if (e.type !== null && !TYPES_ABSENCE.has(e.type)) {
        return res.status(400).json({ error: `Type d'appel invalide : ${e.type}` });
      }
    }
    if (entrees.length > 0) {
      const { rows: eleves } = await db.query(
        `SELECT id FROM eleves WHERE id = ANY($1::bigint[]) AND classe_id = $2 AND ecole_id = $3`,
        [entrees.map((e) => e.eleve_id), classe_id, req.user.ecole_id]
      );
      if (eleves.length !== entrees.length) {
        return res.status(400).json({ error: 'Certains élèves n\'appartiennent pas à la classe' });
      }
    }

    await withTransaction(async (client) => {
      for (const e of entrees) {
        await client.query(
          `DELETE FROM absences
           WHERE eleve_id = $1 AND date = $2 AND saisi_par = $3`,
          [e.eleve_id, date, req.user.id]
        );
        if (e.type === null) continue;
        const { rows: ins } = await client.query(
          `INSERT INTO absences (ecole_id, eleve_id, date, type, saisi_par)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [req.user.ecole_id, e.eleve_id, date, e.type, req.user.id]
        );
        const { rows: infos } = await client.query(
          `SELECT prenom, nom FROM eleves WHERE id = $1`, [e.eleve_id]
        );
        const label = e.type === 'absence' ? 'absence' : 'retard';
        await notifierParents(e.eleve_id, req.user.ecole_id, 'vie_scolaire',
          `${infos[0].prenom} ${infos[0].nom} : ${label} signalé${e.type === 'retard' ? '' : 'e'} le ${date}.`);
      }
    });

    await journaliserAction({ userId: req.user.id, action: 'appel_saisi', cible: 'absences', details: { classe_id, date } });
    res.status(201).json({ message: `Appel du ${date} enregistré (${entrees.filter((e) => e.type).length} signalements)` });
  } catch (err) {
    next(err);
  }
});

// ---- Absences & retards ----
router.get('/absences', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  try {
    const { classe_id, eleve_id, date, type } = req.query;
    const conditions = ['a.ecole_id = $1'];
    const params = [req.user.ecole_id];
    let i = params.length;
    if (classe_id) {
      params.push(classe_id);
      conditions.push(`e.classe_id = $${++i}`);
    }
    if (eleve_id) {
      params.push(eleve_id);
      conditions.push(`a.eleve_id = $${++i}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`a.date = $${++i}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`a.type = $${++i}`);
    }

    const { rows } = await db.query(
      `SELECT a.id, a.eleve_id, a.date::text AS date, a.type, a.justifiee, a.justificatif_note,
              e.nom, e.prenom, e.matricule, c.libelle AS classe,
              u.prenom AS saisi_prenom, u.nom AS saisi_nom
       FROM absences a
       JOIN eleves e ON e.id = a.eleve_id
       LEFT JOIN classes c ON c.id = e.classe_id
       JOIN users u ON u.id = a.saisi_par
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.date DESC, e.nom`,
      params
    );
    res.json({ absences: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/absences', requireRoles(...ROLES_SAISIE), async (req, res, next) => {
  const { eleve_id, date, type, justifiee = false, justificatif_note = null } = req.body;
  try {
    if (!eleve_id || !date || !type) {
      return res.status(400).json({ error: 'eleve_id, date et type sont requis' });
    }
    if (!TYPES_ABSENCE.has(type)) {
      return res.status(400).json({ error: `Type invalide : ${type}` });
    }
    const { rows: eleveRows } = await db.query(
      'SELECT id, prenom, nom FROM eleves WHERE id = $1 AND ecole_id = $2',
      [eleve_id, req.user.ecole_id]
    );
    if (!eleveRows[0]) {
      return res.status(404).json({ error: 'Élève introuvable dans l\'établissement' });
    }

    const { rows } = await db.query(
      `INSERT INTO absences (ecole_id, eleve_id, date, type, justifiee, justificatif_note, saisi_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.user.ecole_id, eleve_id, date, type, justifiee, justificatif_note, req.user.id]
    );

    const label = type === 'absence' ? 'absence' : 'retard';
    await notifierParents(Number(eleve_id), req.user.ecole_id, 'vie_scolaire',
      `${eleveRows[0].prenom} ${eleveRows[0].nom} : ${label} signalé${type === 'retard' ? '' : 'e'} le ${date}.`);
    await journaliserAction({ userId: req.user.id, action: 'absence_saisie', cible: 'absences', details: { eleve_id, date, type } });
    res.status(201).json({ id: rows[0].id, message: `${label} enregistré${type === 'retard' ? '' : 'e'}` });
  } catch (err) {
    next(err);
  }
});

router.patch('/absences/:id', requireRoles(...ROLES_GESTION), async (req, res, next) => {
  const { justifiee, justificatif_note } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE absences
       SET justifiee = COALESCE($2, justifiee),
           justificatif_note = COALESCE($3, justificatif_note)
       WHERE id = $1 AND ecole_id = $4
       RETURNING id`,
      [req.params.id, justifiee, justificatif_note, req.user.ecole_id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Signalement introuvable' });
    }
    await journaliserAction({ userId: req.user.id, action: 'absence_justifiee', cible: 'absences', details: { id: rows[0].id } });
    res.json({ message: 'Signalement mis à jour' });
  } catch (err) {
    next(err);
  }
});

router.delete('/absences/:id', requireRoles(...ROLES_GESTION), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM absences WHERE id = $1 AND ecole_id = $2 RETURNING id',
      [req.params.id, req.user.ecole_id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Signalement introuvable' });
    }
    await journaliserAction({ userId: req.user.id, action: 'absence_supprimee', cible: 'absences', details: { id: rows[0].id } });
    res.json({ message: 'Signalement supprimé' });
  } catch (err) {
    next(err);
  }
});

// ---- Sanctions ----
router.get('/sanctions', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  try {
    const { classe_id, eleve_id } = req.query;
    const conditions = ['s.ecole_id = $1'];
    const params = [req.user.ecole_id];
    let i = params.length;
    if (classe_id) {
      params.push(classe_id);
      conditions.push(`e.classe_id = $${++i}`);
    }
    if (eleve_id) {
      params.push(eleve_id);
      conditions.push(`s.eleve_id = $${++i}`);
    }

    const { rows } = await db.query(
      `SELECT s.id, s.eleve_id, s.date::text AS date, s.type, s.motif,
              e.nom, e.prenom, e.matricule, c.libelle AS classe,
              u.prenom AS saisi_prenom, u.nom AS saisi_nom
       FROM sanctions s
       JOIN eleves e ON e.id = s.eleve_id
       LEFT JOIN classes c ON c.id = e.classe_id
       JOIN users u ON u.id = s.saisi_par
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.date DESC, e.nom`,
      params
    );
    res.json({ sanctions: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/sanctions', requireRoles(...ROLES_GESTION), async (req, res, next) => {
  const { eleve_id, type, motif, date } = req.body;
  try {
    if (!eleve_id || !type || !motif || !date) {
      return res.status(400).json({ error: 'eleve_id, type, motif et date sont requis' });
    }
    if (!TYPES_SANCTION.has(type)) {
      return res.status(400).json({ error: `Type de sanction invalide : ${type}` });
    }
    const { rows: eleveRows } = await db.query(
      'SELECT id, prenom, nom FROM eleves WHERE id = $1 AND ecole_id = $2',
      [eleve_id, req.user.ecole_id]
    );
    if (!eleveRows[0]) {
      return res.status(404).json({ error: 'Élève introuvable dans l\'établissement' });
    }

    const { rows } = await db.query(
      `INSERT INTO sanctions (ecole_id, eleve_id, type, motif, date, saisi_par)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [req.user.ecole_id, eleve_id, type, motif, date, req.user.id]
    );

    const libelle = { avertissement: 'avertissement', blame: 'blâme', exclusion: 'exclusion', conseil_discipline: 'conseil de discipline' }[type];
    await notifierParents(Number(eleve_id), req.user.ecole_id, 'vie_scolaire',
      `${eleveRows[0].prenom} ${eleveRows[0].nom} : ${libelle} (${date}).`);
    await journaliserAction({ userId: req.user.id, action: 'sanction_inscrite', cible: 'sanctions', details: { eleve_id, type } });
    res.status(201).json({ id: rows[0].id, message: 'Sanction enregistrée' });
  } catch (err) {
    next(err);
  }
});

router.delete('/sanctions/:id', requireRoles(...ROLES_GESTION), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM sanctions WHERE id = $1 AND ecole_id = $2 RETURNING id',
      [req.params.id, req.user.ecole_id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Sanction introuvable' });
    }
    await journaliserAction({ userId: req.user.id, action: 'sanction_supprimee', cible: 'sanctions', details: { id: rows[0].id } });
    res.json({ message: 'Sanction supprimée' });
  } catch (err) {
    next(err);
  }
});

// ---- Assiduité : récapitulatif par élève ----
router.get('/assiduite', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  try {
    const { classe_id, annee_scolaire_id } = req.query;
    if (!classe_id) {
      return res.status(400).json({ error: 'classe_id est requis' });
    }
    const { rows: anneeRows } = annee_scolaire_id
      ? { rows: [{ id: annee_scolaire_id }] }
      : await db.query(
        `SELECT id, date_debut, date_fin FROM annees_scolaires WHERE ecole_id = $1 AND active = TRUE LIMIT 1`,
        [req.user.ecole_id]
      );
    const annee = anneeRows[0];
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const debut = String(annee.date_debut).slice(0, 10);
    const fin = String(annee.date_fin).slice(0, 10);
    // Si l'année active n'a pas encore commencé (données de démo), on compte tout ;
    // sinon on borne au cadre [début, aujourd'hui].
    const dansCadre = aujourdHui >= debut && aujourdHui <= fin;
    const filtrePeriode = dansCadre
      ? 'AND a.date >= $3::date AND a.date <= CURRENT_DATE'
      : '';

    const { rows } = await db.query(
      `SELECT e.id AS eleve_id, e.nom, e.prenom, e.matricule,
              COALESCE(a.absences, 0)::int AS absences,
              COALESCE(a.retards, 0)::int AS retards,
              COALESCE(a.non_justifiees, 0)::int AS non_justifiees,
              COALESCE(s.n_sanctions, 0)::int AS sanctions
       FROM eleves e
       LEFT JOIN (
         SELECT eleve_id,
                COUNT(*) FILTER (WHERE type = 'absence') AS absences,
                COUNT(*) FILTER (WHERE type = 'retard') AS retards,
                COUNT(*) FILTER (WHERE type = 'absence' AND NOT justifiee) AS non_justifiees
         FROM absences a
         WHERE 1 = 1 ${filtrePeriode}
         GROUP BY eleve_id
       ) a ON a.eleve_id = e.id
       LEFT JOIN (
         SELECT eleve_id, COUNT(*) AS n_sanctions
         FROM sanctions s
         WHERE 1 = 1 ${filtrePeriode.replace('a.date', 's.date')}
         GROUP BY eleve_id
       ) s ON s.eleve_id = e.id
       WHERE e.classe_id = $1 AND e.ecole_id = $2 AND e.statut = 'actif'
       ORDER BY e.nom`,
      [classe_id, req.user.ecole_id, ...(dansCadre ? [debut] : [])]
    );
    res.json({ assiduite: rows, periode: dansCadre ? { debut, fin: aujourdHui } : null });
  } catch (err) {
    next(err);
  }
});

export default router;