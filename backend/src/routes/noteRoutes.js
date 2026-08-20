import { Router } from 'express';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { withTransaction } from '../db/index.js';
import { journaliserAction } from '../services/authService.js';

const router = Router();

router.use(authenticate);

const ROLES_LECTURE = ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT', 'SURVEILLANT', 'COMPTABLE'];

// ---- Séquences / trimestres ----
router.get('/sequences', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, a.libelle AS annee_libelle
       FROM sequences s
       JOIN annees_scolaires a ON a.id = s.annee_scolaire_id
       WHERE s.ecole_id = $1
       ORDER BY a.date_debut DESC, s.ordre`,
      [req.user.ecole_id]
    );
    res.json({ sequences: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/sequences', requireRoles('ADMIN', 'CENSEUR'), async (req, res, next) => {
  const { annee_scolaire_id, libelle, ordre, date_debut, date_fin } = req.body ?? {};
  if (!annee_scolaire_id || !libelle || ordre === undefined) {
    return res.status(400).json({ error: 'Année scolaire, libellé et ordre requis' });
  }
  if (date_fin && date_debut && new Date(date_fin) <= new Date(date_debut)) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO sequences (ecole_id, annee_scolaire_id, libelle, ordre, date_debut, date_fin)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.ecole_id, annee_scolaire_id, libelle, ordre, date_debut ?? null, date_fin ?? null]
    );
    await journaliserAction({ userId: req.user.id, action: 'creation_sequence', cible: 'sequences', details: rows[0] });
    res.status(201).json({ sequence: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ordre déjà utilisé pour cette année' });
    next(err);
  }
});

// Validation d'une séquence par le censeur (BR-03: verrouille les notes)
// BR-10: refus si des notes manquent dans une matière enseignée de la séquence
router.post('/sequences/:id/valider', requireRoles('ADMIN', 'CENSEUR'), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);

  try {
    const { rows: seqRows } = await db.query(
      `SELECT s.*, a.libelle AS annee_libelle
       FROM sequences s
       JOIN annees_scolaires a ON a.id = s.annee_scolaire_id
       WHERE s.id = $1 AND s.ecole_id = $2`,
      [id, req.user.ecole_id]
    );
    if (seqRows.length === 0) return res.status(404).json({ error: 'Séquence introuvable' });
    const seq = seqRows[0];
    if (seq.validee) return res.status(409).json({ error: 'Séquence déjà validée' });

    // BR-10: élève actif sans note dans une matière affectée = bulletin incomplet
    const { rows: manquantes } = await db.query(
      `SELECT c.id AS classe_id, c.libelle AS classe_libelle,
              m.id AS matiere_id, m.nom AS matiere_nom, e.id AS eleve_id,
              e.nom AS eleve_nom, e.prenom AS eleve_prenom
       FROM classes c
       JOIN eleves e ON e.classe_id = c.id AND e.statut = 'actif'
       JOIN enseignements ens ON ens.classe_id = c.id
       JOIN matieres m ON m.id = ens.matiere_id
       LEFT JOIN notes nt ON nt.eleve_id = e.id
                          AND nt.matiere_id = m.id
                          AND nt.sequence_id = $2
       WHERE c.ecole_id = $1 AND nt.id IS NULL
       ORDER BY c.libelle, m.nom, e.nom`,
      [req.user.ecole_id, id]
    );

    if (manquantes.length > 0) {
      const distinct = [...new Map(manquantes.map((m) => [`${m.classe_libelle}|${m.matiere_nom}`, m])).values()];
      return res.status(422).json({
        error: 'Impossible de valider : notes manquantes (BR-10)',
        detail: `${manquantes.length} note(s) manquante(s)`,
        manquantes: distinct.map((m) => ({
          classe: m.classe_libelle,
          matiere: m.matiere_nom,
          eleve: `${m.eleve_prenom} ${m.eleve_nom}`,
        })),
      });
    }

    await withTransaction(async (client) => {
      await client.query('UPDATE notes SET verrouillee = TRUE WHERE sequence_id = $1', [id]);
      await client.query(
        `UPDATE sequences SET validee = TRUE, validee_par = $1, validee_le = NOW() WHERE id = $2`,
        [req.user.id, id]
      );
    });

    await journaliserAction({ userId: req.user.id, action: 'validation_sequence', cible: 'sequences', details: { sequence_id: id } });
    res.json({ message: 'Séquence validée, notes verrouillées' });
  } catch (err) {
    next(err);
  }
});

// Saisie des notes (BR-02: enseignant limité à ses matières/classes)
// BR-03: verrouillée si séquence validée
router.post('/notes', requireRoles('ADMIN', 'CENSEUR', 'ENSEIGNANT'), async (req, res, next) => {
  const { notes } = req.body ?? {};
  if (!Array.isArray(notes) || notes.length === 0 || notes.length > 500) {
    return res.status(400).json({ error: 'Liste de notes requise (1 à 500)' });
  }

  for (const n of notes) {
    if (!n.eleve_id || !n.matiere_id || !n.sequence_id || n.valeur === undefined) {
      return res.status(400).json({ error: 'Chaque note doit avoir eleve_id, matiere_id, sequence_id et valeur' });
    }
    const v = Number(n.valeur);
    if (Number.isNaN(v) || v < 0 || v > 20) {
      return res.status(400).json({ error: `Note invalide pour l'élève ${n.eleve_id} (doit être entre 0 et 20)` });
    }
  }

  try {
    const verification = await verifierPermissionsNotes(req.user, notes);
    if (!verification.ok) return res.status(verification.status).json({ error: verification.error });

    // BR-03: refuser si la séquence est validée
    const seqIds = [...new Set(notes.map((n) => n.sequence_id))];
    const { rows: seqs } = await db.query(
      'SELECT id, validee FROM sequences WHERE id = ANY($1)',
      [seqIds]
    );
    const seqValidee = seqs.find((s) => s.validee);
    if (seqValidee) {
      return res.status(409).json({ error: 'Séquence validée : les notes sont verrouillées (BR-03)' });
    }

    const resultats = await withTransaction(async (client) => {
      const inserted = [];
      for (const n of notes) {
        const { rows } = await client.query(
          `INSERT INTO notes (eleve_id, matiere_id, sequence_id, enseignant_id, valeur, coefficient)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (eleve_id, matiere_id, sequence_id)
           DO UPDATE SET valeur = EXCLUDED.valeur, coefficient = EXCLUDED.coefficient,
                         enseignant_id = EXCLUDED.enseignant_id, updated_at = NOW()
           RETURNING id, eleve_id, matiere_id, sequence_id, valeur, coefficient, verrouillee`,
[Number(n.eleve_id), Number(n.matiere_id), Number(n.sequence_id), verification.enseignantId ?? null,
            Number(n.valeur), Number(n.coefficient ?? 1)]
        );
        inserted.push(rows[0]);
      }
      return inserted;
    });

    await journaliserAction({
      userId: req.user.id,
      action: 'saisie_notes',
      cible: 'notes',
      details: { nombre: resultats.length, sequenceIds: seqIds },
    });

    res.status(201).json({ message: `${resultats.length} note(s) enregistrée(s)`, notes: resultats });
  } catch (err) {
    next(err);
  }
});

async function verifierPermissionsNotes(user, notes) {
  // Lecture seule pour ceux qui ne sont ni ENSEIGNANT ni ADMIN/CENSEUR
  if (!user.roles.includes('ENSEIGNANT') && !user.roles.includes('ADMIN') && !user.roles.includes('CENSEUR')) {
    return { ok: false, status: 403, error: 'Accès refusé' };
  }

  const matiereIds = [...new Set(notes.map((n) => n.matiere_id))].map(Number);
  const classeIds = [...new Set(notes.map((n) => n.eleve_id))].map(Number);

  // Récupère la classe de chaque élève
  const { rows: eleves } = await db.query(
    `SELECT id, classe_id FROM eleves WHERE id = ANY($1) AND ecole_id = $2`,
    [classeIds, user.ecole_id]
  );
  const classeParEleve = new Map(eleves.map((e) => [Number(e.id), e.classe_id]));
  for (const n of notes) {
    if (!classeParEleve.has(Number(n.eleve_id))) {
      return { ok: false, status: 403, error: `Élève ${n.eleve_id} introuvable dans votre établissement` };
    }
  }

  if (user.roles.includes('ADMIN') || user.roles.includes('CENSEUR')) {
    return { ok: true };
  }

  // BR-02: l'enseignant doit avoir une affectation (enseignements) pour (classe, matiere)
  const { rows: affectations } = await db.query(
    `SELECT en.id AS enseignant_id
     FROM enseignants en
     WHERE en.user_id = $1 AND en.ecole_id = $2`,
    [user.id, user.ecole_id]
  );
  if (affectations.length === 0) {
    return { ok: false, status: 403, error: 'Aucun profil enseignant associé à ce compte' };
  }
  const enseignantId = affectations[0].enseignant_id;

  const combos = notes.map((n) => [Number(classeParEleve.get(Number(n.eleve_id))), Number(n.matiere_id)]);
  const uniqueCombos = [...new Map(combos.map((c) => [c.join('|'), c])).values()];

  const { rows: autorisees } = await db.query(
    `SELECT DISTINCT classe_id, matiere_id FROM enseignements
     WHERE enseignant_id = $1 AND (classe_id, matiere_id) IN (SELECT * FROM unnest($2::int[], $3::int[]))`,
    [enseignantId, uniqueCombos.map((c) => c[0]), uniqueCombos.map((c) => c[1])]
  );
  const autorise = new Set(autorisees.map((a) => `${a.classe_id}|${a.matiere_id}`));
  for (const combo of uniqueCombos) {
    if (!autorise.has(`${combo[0]}|${combo[1]}`)) {
      return {
        ok: false,
        status: 403,
        error: `Affectation manquante : vous ne pouvez pas saisir de notes pour cette classe/matière (BR-02)`,
      };
    }
  }
  return { ok: true, enseignantId };
}

// Consultation des notes d'une classe (pour saisie/bulletin)
router.get('/notes', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  const { classe_id, sequence_id, matiere_id } = req.query;
  if (!classe_id || !sequence_id) {
    return res.status(400).json({ error: 'classe_id et sequence_id requis' });
  }
  try {
    const { rows } = await db.query(
      `SELECT nt.id, nt.eleve_id, e.nom, e.prenom, e.matricule,
              nt.matiere_id, m.nom AS matiere_nom,
              nt.valeur, nt.coefficient, nt.verrouillee, nt.created_at
       FROM eleves e
       LEFT JOIN notes nt ON nt.eleve_id = e.id AND nt.sequence_id = $3 AND nt.matiere_id = $4
       LEFT JOIN matieres m ON m.id = $4
       WHERE e.classe_id = $1 AND e.statut = 'actif' AND e.ecole_id = $2
       ORDER BY e.nom, e.prenom`,
      [classe_id, req.user.ecole_id, sequence_id, matiere_id ?? null]
    );
    res.json({ notes: rows });
  } catch (err) {
    next(err);
  }
});

// Moyennes et rangs d'une classe pour une séquence
router.get('/moyennes', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  const { classe_id, sequence_id } = req.query;
  if (!classe_id || !sequence_id) {
    return res.status(400).json({ error: 'classe_id et sequence_id requis' });
  }
  try {
    const { rows } = await db.query(
      `      SELECT e.id AS eleve_id, e.nom, e.prenom, e.matricule,
              COALESCE(ROUND(SUM(nt.valeur * nt.coefficient)::numeric / NULLIF(SUM(nt.coefficient), 0), 2), 0) AS moyenne,
              SUM(nt.coefficient) AS total_coefficient
       FROM eleves e
       LEFT JOIN notes nt ON nt.eleve_id = e.id AND nt.sequence_id = $3
       WHERE e.classe_id = $1 AND e.statut = 'actif' AND e.ecole_id = $2
       GROUP BY e.id, e.nom, e.prenom, e.matricule
       ORDER BY moyenne DESC`,
      [classe_id, req.user.ecole_id, sequence_id]
    );

    // Attribution du rang
    let rang = 1;
    const avecRang = rows.map((r, i) => {
      if (i > 0 && rows[i - 1].moyenne !== r.moyenne) rang = i + 1;
      return { ...r, rang };
    });

    res.json({ moyennes: avecRang });
  } catch (err) {
    next(err);
  }
});

export default router;