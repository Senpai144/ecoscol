import { Router } from 'express';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';

const router = Router();

router.use(authenticate);

const ROLES_LECTURE = ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'ENSEIGNANT'];
const ROLES_ECRITURE = ['ADMIN', 'SECRETARIAT', 'CENSEUR'];

// ---- Matières ----
router.get('/matieres', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM matieres WHERE ecole_id = $1 ORDER BY nom',
      [req.user.ecole_id]
    );
    res.json({ matieres: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/matieres', requireRoles(...ROLES_ECRITURE), async (req, res, next) => {
  const { nom, code } = req.body ?? {};
  if (!nom) return res.status(400).json({ error: 'Nom de la matière requis' });
  try {
    const { rows } = await db.query(
      'INSERT INTO matieres (ecole_id, nom, code) VALUES ($1, $2, $3) RETURNING *',
      [req.user.ecole_id, nom, code ?? null]
    );
    await journaliserAction({ userId: req.user.id, action: 'creation_matiere', cible: 'matieres', details: rows[0] });
    res.status(201).json({ matiere: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Matière déjà existante' });
    next(err);
  }
});

// Coefficients par matière / niveau / série (cf. schéma table coefficients)
router.get('/matieres/:id/coefficients', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows } = await db.query(
      `SELECT co.*, n.libelle AS niveau_libelle, s.libelle AS serie_libelle, a.libelle AS annee_libelle
       FROM coefficients co
       LEFT JOIN niveaux n ON n.id = co.niveau_id
       LEFT JOIN series s ON s.id = co.serie_id
       JOIN annees_scolaires a ON a.id = co.annee_scolaire_id
       WHERE co.matiere_id = $1
       ORDER BY a.date_debut DESC, n.ordre, s.libelle`,
      [id]
    );
    res.json({ coefficients: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/matieres/:id/coefficients', requireRoles(...ROLES_ECRITURE), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { annee_scolaire_id, niveau_id, serie_id, coefficient } = req.body ?? {};
  if (!annee_scolaire_id || coefficient === undefined) {
    return res.status(400).json({ error: 'Année scolaire et coefficient requis' });
  }
  if (coefficient <= 0 || coefficient > 10) {
    return res.status(400).json({ error: 'Coefficient invalide (0 à 10)' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO coefficients (matiere_id, annee_scolaire_id, niveau_id, serie_id, coefficient)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, annee_scolaire_id, niveau_id ?? null, serie_id ?? null, coefficient]
    );
    await journaliserAction({ userId: req.user.id, action: 'ajout_coefficient', cible: 'coefficients', details: rows[0] });
    res.status(201).json({ coefficient: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Coefficient déjà défini pour cette combinaison' });
    next(err);
  }
});

// ---- Enseignants ----
router.get('/enseignants', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT en.id, en.user_id, u.nom, u.prenom, u.identifiant, u.email, u.telephone,
              ARRAY_AGG(DISTINCT jsonb_build_object('classe_id', emp.classe_id, 'matiere_id', emp.matiere_id)) AS affectations
       FROM enseignants en
       JOIN users u ON u.id = en.user_id
       LEFT JOIN enseignements emp ON emp.enseignant_id = en.id
       WHERE en.ecole_id = $1
       GROUP BY en.id, u.nom, u.prenom, u.identifiant, u.email, u.telephone
       ORDER BY u.nom, u.prenom`,
      [req.user.ecole_id]
    );
    res.json({ enseignants: rows });
  } catch (err) {
    next(err);
  }
});

// Associer un compte utilisateur à un profil enseignant
router.post('/enseignants', requireRoles(...ROLES_ECRITURE), async (req, res, next) => {
  const { user_id } = req.body ?? {};
  if (!user_id) return res.status(400).json({ error: 'ID utilisateur requis' });
  try {
    const { rows } = await db.query(
      'INSERT INTO enseignants (ecole_id, user_id) VALUES ($1, $2) RETURNING *',
      [req.user.ecole_id, user_id]
    );
    await journaliserAction({ userId: req.user.id, action: 'creation_enseignant', cible: 'enseignants', details: rows[0] });
    res.status(201).json({ enseignant: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce compte est déjà un enseignant' });
    if (err.code === '23503') return res.status(400).json({ error: 'Utilisateur introuvable ou d\'une autre école' });
    next(err);
  }
});

// Affectation enseignant -> classe + matière (BR-02: base des permissions de saisie de notes)
router.post('/enseignements', requireRoles(...ROLES_ECRITURE), async (req, res, next) => {
  const { enseignant_id, classe_id, matiere_id } = req.body ?? {};
  if (!enseignant_id || !classe_id || !matiere_id) {
    return res.status(400).json({ error: 'Enseignant, classe et matière requis' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO enseignements (enseignant_id, classe_id, matiere_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [enseignant_id, classe_id, matiere_id]
    );
    await journaliserAction({
      userId: req.user.id,
      action: 'affectation_enseignement',
      cible: 'enseignements',
      details: rows[0],
    });
    res.status(201).json({ enseignement: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Affectation déjà existante' });
    next(err);
  }
});

router.delete('/enseignements/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows } = await db.query('DELETE FROM enseignements WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Affectation introuvable' });
    await journaliserAction({ userId: req.user.id, action: 'suppression_affectation', cible: 'enseignements', details: { id } });
    res.json({ message: 'Affectation supprimée' });
  } catch (err) {
    next(err);
  }
});

// ---- Emploi du temps (sans chevauchement - vérifié côté application) ----
router.get('/emplois-du-temps', requireRoles(...ROLES_LECTURE), async (req, res, next) => {
  const { classe_id } = req.query;
  try {
    const conditions = ['edt.ecole_id = $1'];
    const params = [req.user.ecole_id];
    if (classe_id) {
      params.push(classe_id);
      conditions.push(`edt.classe_id = $${params.length}`);
    }
    const { rows } = await db.query(
      `SELECT edt.*, c.libelle AS classe_libelle, m.nom AS matiere_nom,
              u.nom AS enseignant_nom, u.prenom AS enseignant_prenom
       FROM emplois_du_temps edt
       JOIN classes c ON c.id = edt.classe_id
       JOIN matieres m ON m.id = edt.matiere_id
       JOIN enseignants en ON en.id = edt.enseignant_id
       JOIN users u ON u.id = en.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY edt.jour_semaine, edt.heure_debut`,
      params
    );
    res.json({ emploisDuTemps: rows });
  } catch (err) {
    next(err);
  }
});

function chevauche(aDebut, aFin, bDebut, bFin) {
  return aDebut < bFin && aFin > bDebut;
}

router.post('/emplois-du-temps', requireRoles(...ROLES_ECRITURE), async (req, res, next) => {
  const { classe_id, enseignant_id, matiere_id, jour_semaine, heure_debut, heure_fin } = req.body ?? {};
  if (!classe_id || !enseignant_id || !matiere_id || !jour_semaine || !heure_debut || !heure_fin) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (jour_semaine < 1 || jour_semaine > 7) {
    return res.status(400).json({ error: 'Jour de semaine invalide (1=Lundi à 7=Dimanche)' });
  }
  if (heure_fin <= heure_debut) {
    return res.status(400).json({ error: 'L\'heure de fin doit être postérieure à l\'heure de début' });
  }

  try {
    const verifClasse = await db.query(
      'SELECT 1 FROM classes WHERE id = $1 AND ecole_id = $2', [classe_id, req.user.ecole_id]
    );
    if (verifClasse.rows.length === 0) return res.status(400).json({ error: 'Classe introuvable' });

    // Contrôle de chevauchement: même classe, même jour
    const conflitClasse = await db.query(
      `SELECT 1 FROM emplois_du_temps
       WHERE ecole_id = $1 AND classe_id = $2 AND jour_semaine = $3
         AND heure_debut < $5 AND heure_fin > $4
       LIMIT 1`,
      [req.user.ecole_id, classe_id, jour_semaine, heure_debut, heure_fin]
    );
    if (conflitClasse.rows.length > 0) {
      return res.status(409).json({ error: 'Chevauchement horaire pour cette classe' });
    }

    // Contrôle de chevauchement: même enseignant, même jour
    const conflitEnseignant = await db.query(
      `SELECT 1 FROM emplois_du_temps
       WHERE ecole_id = $1 AND enseignant_id = $2 AND jour_semaine = $3
         AND heure_debut < $5 AND heure_fin > $4
       LIMIT 1`,
      [req.user.ecole_id, enseignant_id, jour_semaine, heure_debut, heure_fin]
    );
    if (conflitEnseignant.rows.length > 0) {
      return res.status(409).json({ error: 'Chevauchement horaire pour cet enseignant' });
    }

    const { rows } = await db.query(
      `INSERT INTO emplois_du_temps
         (ecole_id, classe_id, enseignant_id, matiere_id, jour_semaine, heure_debut, heure_fin)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.ecole_id, classe_id, enseignant_id, matiere_id, jour_semaine, heure_debut, heure_fin]
    );
    await journaliserAction({ userId: req.user.id, action: 'creation_cours', cible: 'emplois_du_temps', details: rows[0] });
    res.status(201).json({ creneau: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/emplois-du-temps/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows } = await db.query(
      'DELETE FROM emplois_du_temps WHERE id = $1 AND ecole_id = $2 RETURNING id',
      [id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Créneau introuvable' });
    await journaliserAction({ userId: req.user.id, action: 'suppression_cours', cible: 'emplois_du_temps', details: { id } });
    res.json({ message: 'Créneau supprimé' });
  } catch (err) {
    next(err);
  }
});

export default router;