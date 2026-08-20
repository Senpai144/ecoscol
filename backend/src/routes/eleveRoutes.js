import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';

const router = Router();

router.use(authenticate, requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR'));

const STATUTS_VALIDES = ['actif', 'transfere', 'exclu', 'diplome', 'archive'];

async function genererMatricule(ecoleId) {
  const annee = new Date().getFullYear();
  for (let i = 0; i < 10; i++) {
    const seq = crypto.randomInt(1000, 9999);
    const matricule = `ECO-${annee}-${seq}`;
    const { rows } = await db.query('SELECT 1 FROM eleves WHERE matricule = $1', [matricule]);
    if (rows.length === 0) return matricule;
  }
  throw new Error('Impossible de générer un matricule unique');
}

function validerDateNaissance(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime()) || d > new Date()) return false;
  return true;
}

// Liste des élèves avec recherche, filtre par classe et pagination
router.get('/', async (req, res, next) => {
  const { q, classe, statut, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['e.ecole_id = $1'];
  const params = [req.user.ecole_id];

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(e.nom ILIKE $${params.length} OR e.prenom ILIKE $${params.length} OR e.matricule ILIKE $${params.length})`);
  }
  if (classe) {
    params.push(classe);
    conditions.push(`e.classe_id = $${params.length}`);
  }
  if (statut) {
    params.push(statut);
    conditions.push(`e.statut = $${params.length}`);
  }

  try {
    const where = conditions.join(' AND ');
    const [{ rows: totalRows }, { rows }] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS n FROM eleves e WHERE ${where}`, params),
      db.query(
        `SELECT e.*, c.libelle AS classe_libelle, n.libelle AS niveau_libelle, s.libelle AS serie_libelle
         FROM eleves e
         LEFT JOIN classes c ON c.id = e.classe_id
         LEFT JOIN niveaux n ON n.id = c.niveau_id
         LEFT JOIN series s ON s.id = c.serie_id
         WHERE ${where}
         ORDER BY e.nom, e.prenom
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset]
      ),
    ]);

    res.json({
      eleves: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalRows[0].n,
        pages: Math.ceil(totalRows[0].n / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows } = await db.query(
      `SELECT e.*, c.libelle AS classe_libelle, n.libelle AS niveau_libelle, s.libelle AS serie_libelle
       FROM eleves e
       LEFT JOIN classes c ON c.id = e.classe_id
       LEFT JOIN niveaux n ON n.id = c.niveau_id
       LEFT JOIN series s ON s.id = c.serie_id
       WHERE e.id = $1 AND e.ecole_id = $2`,
      [id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Élève introuvable' });
    const eleve = rows[0];

    const [tuteurs, historique] = await Promise.all([
      db.query(
        `SELECT t.* FROM tuteurs t
         JOIN eleve_tuteurs et ON et.tuteur_id = t.id
         WHERE et.eleve_id = $1`,
        [id]
      ),
      db.query(
        `SELECT h.*, c.libelle AS classe_libelle, a.libelle AS annee_libelle
         FROM historique_scolaire h
         LEFT JOIN classes c ON c.id = h.classe_id
         LEFT JOIN annees_scolaires a ON a.id = h.annee_scolaire_id
         WHERE h.eleve_id = $1
         ORDER BY h.annee_scolaire_id DESC`,
        [id]
      ),
    ]);
    res.json({ eleve: { ...eleve, tuteurs: tuteurs.rows, historique: historique.rows } });
  } catch (err) {
    next(err);
  }
});

// Inscription d'un nouvel élève (BR-01: matricule généré automatiquement)
router.post('/', async (req, res, next) => {
  const {
    nom, prenom, date_naissance, sexe, adresse,
    classe_id, tuteurs, photo_path,
  } = req.body ?? {};

  if (!nom || !prenom) {
    return res.status(400).json({ error: 'Nom et prénom sont obligatoires' });
  }
  if (date_naissance && !validerDateNaissance(date_naissance)) {
    return res.status(400).json({ error: 'Date de naissance invalide' });
  }
  if (sexe && !['M', 'F'].includes(sexe)) {
    return res.status(400).json({ error: 'Sexe invalide' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const classe = classe_id
      ? await client.query(
          `SELECT c.capacite, (SELECT COUNT(*)::int FROM eleves e WHERE e.classe_id = c.id AND e.statut = 'actif') AS effectif
           FROM classes c WHERE c.id = $1 AND c.ecole_id = $2`,
          [classe_id, req.user.ecole_id]
        )
      : null;
    if (classe_id && classe.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Classe introuvable' });
    }
    if (classe_id && classe.rows[0].effectif >= classe.rows[0].capacite) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Classe complète (capacité maximale atteinte)' });
    }

    const matricule = await genererMatricule(req.user.ecole_id);
    const { rows } = await client.query(
      `INSERT INTO eleves (ecole_id, matricule, nom, prenom, date_naissance, sexe, adresse, classe_id, photo_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.ecole_id, matricule, nom, prenom, date_naissance ?? null, sexe ?? null, adresse ?? null, classe_id ?? null, photo_path ?? null]
    );
    const eleve = rows[0];

    const annee = await client.query('SELECT id FROM annees_scolaires WHERE ecole_id = $1 AND active = TRUE', [req.user.ecole_id]);
    if (classe_id && annee.rows.length > 0) {
      await client.query(
        'INSERT INTO historique_scolaire (eleve_id, annee_scolaire_id, classe_id) VALUES ($1, $2, $3)',
        [eleve.id, annee.rows[0].id, classe_id]
      );
    }

    if (Array.isArray(tuteurs)) {
      for (const t of tuteurs) {
        const tel = String(t.telephone).replace(/[^0-9+]/g, '');
        if (!tel) continue;
        let tuteur = await client.query('SELECT id FROM tuteurs WHERE telephone = $1 AND ecole_id = $2', [tel, req.user.ecole_id]);
        if (tuteur.rows.length === 0) {
          tuteur = await client.query(
            'INSERT INTO tuteurs (ecole_id, nom, prenom, telephone, adresse, email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [req.user.ecole_id, t.nom || 'Parent', t.prenom ?? null, tel, t.adresse ?? null, t.email ?? null]
          );
        }
        await client.query(
          'INSERT INTO eleve_tuteurs (eleve_id, tuteur_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [eleve.id, tuteur.rows[0].id]
        );
      }
    }

    await client.query('COMMIT');
    await journaliserAction({ userId: req.user.id, action: 'inscription_eleve', cible: 'eleves', details: { id: eleve.id, matricule } });
    res.status(201).json({ eleve });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { nom, prenom, date_naissance, sexe, adresse, classe_id, photo_path } = req.body ?? {};

  if (date_naissance && !validerDateNaissance(date_naissance)) {
    return res.status(400).json({ error: 'Date de naissance invalide' });
  }
  if (sexe && !['M', 'F'].includes(sexe)) {
    return res.status(400).json({ error: 'Sexe invalide' });
  }
  const matriculeInterdit = Object.keys(req.body ?? {}).includes('matricule');
  if (matriculeInterdit) {
    return res.status(400).json({ error: 'Le matricule ne peut pas être modifié (BR-01)' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE eleves SET
         nom = COALESCE($1, nom),
         prenom = COALESCE($2, prenom),
         date_naissance = COALESCE($3, date_naissance),
         sexe = COALESCE($4, sexe),
         adresse = COALESCE($5, adresse),
         classe_id = COALESCE($6, classe_id),
         photo_path = COALESCE($7, photo_path),
         updated_at = NOW()
       WHERE id = $8 AND ecole_id = $9
       RETURNING *`,
      [nom ?? null, prenom ?? null, date_naissance ?? null, sexe ?? null, adresse ?? null, classe_id ?? null, photo_path ?? null, id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Élève introuvable' });
    await journaliserAction({ userId: req.user.id, action: 'modification_eleve', cible: 'eleves', details: { id } });
    res.json({ eleve: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/statut', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { statut } = req.body ?? {};
  if (!STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  try {
    const { rows } = await db.query(
      'UPDATE eleves SET statut = $1, updated_at = NOW() WHERE id = $2 AND ecole_id = $3 RETURNING *',
      [statut, id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Élève introuvable' });
    await journaliserAction({ userId: req.user.id, action: `statut_eleve_${statut}`, cible: 'eleves', details: { id } });
    res.json({ eleve: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows } = await db.query(
      'UPDATE eleves SET statut = $1, updated_at = NOW() WHERE id = $2 AND ecole_id = $3 RETURNING id',
      ['archive', id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Élève introuvable' });
    await journaliserAction({ userId: req.user.id, action: 'archivage_eleve', cible: 'eleves', details: { id } });
    res.json({ message: 'Dossier élève archivé' });
  } catch (err) {
    next(err);
  }
});

// Attache un compte d'utilisateur PARENT à un tuteur d'un élève (portail parents).
// BR-20.2 : le parent doit avoir le rôle PARENT et appartenir à la même école.
router.post('/:id/tuteurs/:tuteurId/attacher-compte', async (req, res, next) => {
  const eleveId = parseInt(req.params.id, 10);
  const tuteurId = parseInt(req.params.tuteurId, 10);
  const { user_id } = req.body ?? {};

  if (!user_id) {
    return res.status(400).json({ error: 'user_id requis (compte PARENT)' });
  }

  try {
    const { rows: eleves } = await db.query(
      'SELECT id FROM eleves WHERE id = $1 AND ecole_id = $2',
      [eleveId, req.user.ecole_id]
    );
    if (eleves.length === 0) return res.status(404).json({ error: 'Élève introuvable' });

    const { rows: tuteurs } = await db.query(
      `SELECT t.id FROM tuteurs t
       JOIN eleve_tuteurs et ON et.tuteur_id = t.id
       WHERE t.id = $1 AND t.ecole_id = $2 AND et.eleve_id = $3`,
      [tuteurId, req.user.ecole_id, eleveId]
    );
    if (tuteurs.length === 0) {
      return res.status(404).json({ error: 'Tuteur non lié à cet élève' });
    }

    const { rows: comptes } = await db.query(
      `SELECT u.id, ARRAY_AGG(ur.role_code) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1 AND u.ecole_id = $2
       GROUP BY u.id`,
      [user_id, req.user.ecole_id]
    );
    const compte = comptes[0];
    if (!compte) return res.status(404).json({ error: 'Compte utilisateur introuvable' });
    if (!compte.roles.includes('PARENT')) {
      return res.status(400).json({ error: 'Le compte doit avoir le rôle PARENT' });
    }

    const { rows: attaches } = await db.query(
      'SELECT user_id FROM tuteurs WHERE id = $1',
      [tuteurId]
    );
    if (attaches[0].user_id && Number(attaches[0].user_id) !== Number(user_id)) {
      return res.status(409).json({ error: 'Ce tuteur est déjà lié à un autre compte' });
    }

    await db.query('UPDATE tuteurs SET user_id = $1 WHERE id = $2', [user_id, tuteurId]);

    await journaliserAction({
      userId: req.user.id,
      action: 'attacher_compte_tuteur',
      cible: 'tuteurs',
      details: { tuteur_id: tuteurId, eleve_id: eleveId, user_id },
    });

    res.json({ message: 'Compte parent attaché au tuteur', user_id });
  } catch (err) {
    next(err);
  }
});

export default router;