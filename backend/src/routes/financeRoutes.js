import { Router } from 'express';
import db, { withTransaction } from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';
import { genererRecu } from '../services/pdfService.js';

const router = Router();

const LECTURE = ['ADMIN', 'SECRETARIAT', 'COMPTABLE'];
const SAISIE = ['ADMIN', 'SECRETARIAT', 'COMPTABLE'];
const CONTROLE = ['ADMIN', 'COMPTABLE'];

const MODES_PAIEMENT = ['especes', 'cheque', 'mobile_money', 'virement'];

router.use(authenticate);

async function anneeActive(ecoleId) {
  const { rows } = await db.query(
    'SELECT * FROM annees_scolaires WHERE ecole_id = $1 AND active = TRUE LIMIT 1',
    [ecoleId]
  );
  return rows[0] ?? null;
}

// ---- Grille tarifaire ----
router.get('/grille', requireRoles(...LECTURE), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT g.*, n.libelle AS niveau_libelle, s.libelle AS serie_libelle, a.libelle AS annee_libelle
       FROM grille_tarifaire g
       LEFT JOIN niveaux n ON n.id = g.niveau_id
       LEFT JOIN series s ON s.id = g.serie_id
       JOIN annees_scolaires a ON a.id = g.annee_scolaire_id
       WHERE g.ecole_id = $1
       ORDER BY a.date_debut DESC, n.ordre NULLS LAST, s.libelle NULLS LAST, g.libelle`,
      [req.user.ecole_id]
    );
    res.json({ tarifs: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/grille', requireRoles(...CONTROLE), async (req, res, next) => {
  const { niveau_id, serie_id, libelle, montant } = req.body ?? {};
  if (!libelle || !(Number(montant) > 0)) {
    return res.status(400).json({ error: 'Libellé et montant positif requis' });
  }
  try {
    const annee = await anneeActive(req.user.ecole_id);
    if (!annee) return res.status(400).json({ error: 'Aucune année scolaire active' });

    const { rows: doublon } = await db.query(
      `SELECT id FROM grille_tarifaire
       WHERE ecole_id = $1 AND annee_scolaire_id = $2
         AND niveau_id IS NOT DISTINCT FROM $3
         AND serie_id IS NOT DISTINCT FROM $4
         AND libelle = $5`,
      [req.user.ecole_id, annee.id, niveau_id || null, serie_id || null, libelle]
    );
    if (doublon.length > 0) {
      return res.status(409).json({ error: 'Ce tarif existe déjà pour cette année scolaire' });
    }

    const { rows } = await db.query(
      `INSERT INTO grille_tarifaire (ecole_id, annee_scolaire_id, niveau_id, serie_id, libelle, montant)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.ecole_id, annee.id, niveau_id || null, serie_id || null, libelle, montant]
    );
    await journaliserAction({
      userId: req.user.id, action: 'creation_tarif', cible: 'grille_tarifaire', details: rows[0],
    });
    res.status(201).json({ tarif: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/grille/:id', requireRoles(...CONTROLE), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows } = await db.query(
      'DELETE FROM grille_tarifaire WHERE id = $1 AND ecole_id = $2 RETURNING *',
      [id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tarif introuvable' });
    await journaliserAction({
      userId: req.user.id, action: 'suppression_tarif', cible: 'grille_tarifaire', details: rows[0],
    });
    res.json({ supprime: true });
  } catch (err) {
    next(err);
  }
});

// ---- Récapitulatif par élève (dossiers / impayés) ----
router.get('/dossiers', requireRoles(...LECTURE), async (req, res, next) => {
  const classeId = req.query.classe_id ? parseInt(req.query.classe_id, 10) : null;
  const impaye = req.query.impaye === '1' || req.query.impaye === 'true';
  try {
    const annee = await anneeActive(req.user.ecole_id);
    if (!annee) return res.json({ impayes: [], anneeActive: null });

    const conditions = ['e.ecole_id = $1', 'ec.annee_scolaire_id = $' + (classeId ? 3 : 2)];
    const params = [req.user.ecole_id, annee.id];
    let having = '';
    if (classeId) {
      params.push(classeId);
      conditions.push(`e.classe_id = $${params.length}`);
    }
    if (impaye) having = ' HAVING COALESCE(SUM(ec.solde), 0) > 0';

    const { rows } = await db.query(
      `SELECT e.id, e.prenom, e.nom, e.matricule, c.libelle AS classe,
              COALESCE(SUM(ec.montant_du), 0)::float AS total_du,
              COALESCE(SUM(ec.solde), 0)::float AS reste_du,
              (COALESCE(SUM(ec.montant_du), 0) - COALESCE(SUM(ec.solde), 0))::float AS total_paye
       FROM eleves e
       JOIN echeanciers ec ON ec.eleve_id = e.id AND ec.annee_scolaire_id = $2
       LEFT JOIN classes c ON c.id = e.classe_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY e.id, c.libelle
       ${having}
       ORDER BY c.libelle, e.nom`,
      params
    );
    res.json({ dossiers: rows, anneeActive: annee });
  } catch (err) {
    next(err);
  }
});

// ---- Détail du dossier d'un élève ----
router.get('/eleves/:eleveId', requireRoles(...LECTURE), async (req, res, next) => {
  const eleveId = parseInt(req.params.eleveId, 10);
  try {
    const { rows: eleves } = await db.query(
      'SELECT * FROM eleves WHERE id = $1 AND ecole_id = $2',
      [eleveId, req.user.ecole_id]
    );
    if (eleves.length === 0) return res.status(404).json({ error: 'Élève introuvable' });
    const eleve = eleves[0];

    const { rows: echeanciers } = await db.query(
      `SELECT ec.*, a.libelle AS annee_libelle
       FROM echeanciers ec
       JOIN annees_scolaires a ON a.id = ec.annee_scolaire_id
       WHERE ec.eleve_id = $1
       ORDER BY ec.date_echeance`,
      [eleveId]
    );
    const { rows: paiements } = await db.query(
      `SELECT p.*, ec.libelle AS echeancier_libelle, u.nom AS saisie_par_nom
       FROM paiements p
       LEFT JOIN echeanciers ec ON ec.id = p.echeancier_id
       LEFT JOIN users u ON u.id = p.saisi_par
       WHERE p.eleve_id = $1
       ORDER BY p.date_paiement DESC, p.id DESC`,
      [eleveId]
    );

    const totalDu = echeanciers.reduce((s, e) => s + Number(e.montant_du), 0);
    const totalPaye = paiements
      .filter((p) => !p.recu_annule)
      .reduce((s, p) => s + Number(p.montant), 0);
    const resteDu = echeanciers.reduce((s, e) => s + Number(e.solde), 0);

    res.json({ eleve, echeanciers, paiements, totalDu, totalPaye, resteDu });
  } catch (err) {
    next(err);
  }
});

// ---- Échéancier ----
router.post('/echeanciers', requireRoles(...SAISIE), async (req, res, next) => {
  const { eleve_id, libelle, montant_du, date_echeance } = req.body ?? {};
  if (!eleve_id || !libelle || !(Number(montant_du) > 0) || !date_echeance) {
    return res.status(400).json({ error: 'Élève, libellé, montant positif et date d\'échéance requis' });
  }
  try {
    const { rows: eleves } = await db.query(
      'SELECT id FROM eleves WHERE id = $1 AND ecole_id = $2',
      [eleve_id, req.user.ecole_id]
    );
    if (eleves.length === 0) return res.status(404).json({ error: 'Élève introuvable' });

    const annee = await anneeActive(req.user.ecole_id);
    if (!annee) return res.status(400).json({ error: 'Aucune année scolaire active' });

    const { rows } = await db.query(
      `INSERT INTO echeanciers (eleve_id, annee_scolaire_id, libelle, montant_du, date_echeance, solde)
       VALUES ($1, $2, $3, $4, $5, $4) RETURNING *`,
      [eleve_id, annee.id, libelle, montant_du, date_echeance]
    );
    await journaliserAction({
      userId: req.user.id, action: 'creation_echeancier', cible: 'echeanciers', details: rows[0],
    });
    res.status(201).json({ echeancier: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Cette échéance existe déjà pour cet élève' });
    }
    next(err);
  }
});

router.delete('/echeanciers/:id', requireRoles(...SAISIE), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows: lie } = await db.query(
      'SELECT id FROM paiements WHERE echeancier_id = $1 LIMIT 1',
      [id]
    );
    if (lie.length > 0) {
      return res.status(409).json({ error: 'Impossible : des paiements sont liés à cette échéance' });
    }
    const { rows } = await db.query(
      `DELETE FROM echeanciers
       WHERE id = $1 AND eleve_id IN (SELECT id FROM eleves WHERE ecole_id = $2)
       RETURNING *`,
      [id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Échéance introuvable' });
    await journaliserAction({
      userId: req.user.id, action: 'suppression_echeancier', cible: 'echeanciers', details: rows[0],
    });
    res.json({ supprime: true });
  } catch (err) {
    next(err);
  }
});

// ---- Paiements (BR-04 reçu unique, BR-05 non modifiable, BR-06 solde recalculé) ----
function numeroRecuSuivant(annee, dernier) {
  const seq = dernier ? parseInt(dernier.split('-')[2], 10) + 1 : 1;
  return `REC-${annee}-${String(seq).padStart(4, '0')}`;
}

router.post('/paiements', requireRoles(...SAISIE), async (req, res, next) => {
  const { eleve_id, echeancier_id, montant, motif, mode, date_paiement, transaction_ref } = req.body ?? {};
  if (!eleve_id || !(Number(montant) > 0) || !motif || !mode) {
    return res.status(400).json({ error: 'Élève, montant positif, motif et mode de paiement requis' });
  }
  if (!MODES_PAIEMENT.includes(mode)) {
    return res.status(400).json({ error: `Mode invalide (${MODES_PAIEMENT.join(', ')})` });
  }
  try {
    const { rows: eleves } = await db.query(
      'SELECT id FROM eleves WHERE id = $1 AND ecole_id = $2',
      [eleve_id, req.user.ecole_id]
    );
    if (eleves.length === 0) return res.status(404).json({ error: 'Élève introuvable' });

    if (echeancier_id) {
      const { rows: ech } = await db.query(
        'SELECT id FROM echeanciers WHERE id = $1 AND eleve_id = $2',
        [echeancier_id, eleve_id]
      );
      if (ech.length === 0) {
        return res.status(400).json({ error: 'Échéance introuvable pour cet élève' });
      }
    }

    const anneeCourante = new Date().getFullYear();
    const date = date_paiement || new Date().toISOString().slice(0, 10);
    const montantNum = Number(montant);

    let resultat = null;
    for (let tentative = 0; tentative < 5; tentative++) {
      try {
        resultat = await withTransaction(async (client) => {
          const { rows: derniers } = await client.query(
            `SELECT numero_recu FROM paiements
             WHERE numero_recu LIKE $1 ORDER BY numero_recu DESC LIMIT 1`,
            [`REC-${anneeCourante}-%`]
          );
          const numero = numeroRecuSuivant(anneeCourante, derniers[0]?.numero_recu);

          const { rows: paiements } = await client.query(
            `INSERT INTO paiements (ecole_id, eleve_id, echeancier_id, montant, motif, mode,
                                    numero_recu, transaction_ref, date_paiement, saisi_par)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [req.user.ecole_id, eleve_id, echeancier_id || null, montantNum, motif, mode, numero,
             transaction_ref || null, date, req.user.id]
          );
          if (echeancier_id) {
            await client.query(
              `UPDATE echeanciers SET solde = GREATEST(solde - $1, 0)
               WHERE id = $2 AND eleve_id = $3`,
              [montantNum, echeancier_id, eleve_id]
            );
          }
          return paiements[0];
        });
        break;
      } catch (err) {
        if (err.code !== '23505' || tentative === 4) throw err;
      }
    }

    await journaliserAction({
      userId: req.user.id, action: 'enregistrement_paiement', cible: 'paiements',
      details: { numero_recu: resultat.numero_recu, eleve_id, montant: montantNum },
    });
    res.status(201).json({ paiement: resultat });
  } catch (err) {
    next(err);
  }
});

router.post('/paiements/:id/annuler', requireRoles(...CONTROLE), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows: existants } = await db.query(
      'SELECT * FROM paiements WHERE id = $1 AND ecole_id = $2',
      [id, req.user.ecole_id]
    );
    if (existants.length === 0) return res.status(404).json({ error: 'Paiement introuvable' });
    if (existants[0].recu_annule) return res.status(409).json({ error: 'Paiement déjà annulé' });

    const paiement = existants[0];
    const paiementAnnule = await withTransaction(async (client) => {
      const up = await client.query(
        `UPDATE paiements SET recu_annule = TRUE, recu_annule_le = NOW(), recu_annule_par = $1
         WHERE id = $2 RETURNING *`,
        [req.user.id, id]
      );
      if (paiement.echeancier_id) {
        await client.query(
          `UPDATE echeanciers SET solde = LEAST(solde + $1, montant_du)
           WHERE id = $2 AND eleve_id = $3`,
          [Number(paiement.montant), paiement.echeancier_id, paiement.eleve_id]
        );
      }
      return up.rows[0];
    });

    await journaliserAction({
      userId: req.user.id, action: 'annulation_paiement', cible: 'paiements',
      details: { numero_recu: paiement.numero_recu, motif: req.body?.motif ?? null },
    });
    res.json({ paiement: paiementAnnule });
  } catch (err) {
    next(err);
  }
});

router.get('/paiements', requireRoles(...LECTURE), async (req, res, next) => {
  const { eleve_id, classe_id, date_debut, date_fin } = req.query;
  try {
    const conditions = ['p.ecole_id = $1'];
    const params = [req.user.ecole_id];
    if (eleve_id) {
      params.push(parseInt(eleve_id, 10));
      conditions.push(`p.eleve_id = $${params.length}`);
    }
    if (classe_id) {
      params.push(parseInt(classe_id, 10));
      conditions.push(`e.classe_id = $${params.length}`);
    }
    if (date_debut) {
      params.push(date_debut);
      conditions.push(`p.date_paiement >= $${params.length}`);
    }
    if (date_fin) {
      params.push(date_fin);
      conditions.push(`p.date_paiement <= $${params.length}`);
    }
    if (req.query.annule === '1') conditions.push('p.recu_annule = TRUE');
    if (req.query.annule === '0') conditions.push('p.recu_annule = FALSE');

    const { rows } = await db.query(
      `SELECT p.*, e.prenom, e.nom, e.matricule, c.libelle AS classe_libelle,
              ec.libelle AS echeancier_libelle
       FROM paiements p
       JOIN eleves e ON e.id = p.eleve_id
       LEFT JOIN classes c ON c.id = e.classe_id
       LEFT JOIN echeanciers ec ON ec.id = p.echeancier_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.date_paiement DESC, p.id DESC`,
      params
    );
    res.json({ paiements: rows });
  } catch (err) {
    next(err);
  }
});

// ---- Reçu PDF ----
router.post('/paiements/:id/recu', requireRoles(...LECTURE), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { rows: paiements } = await db.query(
      `SELECT p.*, e.prenom AS eleve_prenom, e.nom AS eleve_nom, e.matricule, c.libelle AS classe_libelle,
              ec.libelle AS echeancier_libelle, u.nom AS saisie_par_nom
       FROM paiements p
       JOIN eleves e ON e.id = p.eleve_id
       LEFT JOIN classes c ON c.id = e.classe_id
       LEFT JOIN echeanciers ec ON ec.id = p.echeancier_id
       LEFT JOIN users u ON u.id = p.saisi_par
       WHERE p.id = $1 AND p.ecole_id = $2`,
      [id, req.user.ecole_id]
    );
    if (paiements.length === 0) return res.status(404).json({ error: 'Paiement introuvable' });
    const paiement = paiements[0];

    const { rows: ecoles } = await db.query('SELECT * FROM ecoles WHERE id = $1', [req.user.ecole_id]);
    const ecole = ecoles[0];

    if (paiement.recu_annule) {
      return res.status(409).json({ error: 'Ce reçu a été annulé, il ne peut plus être imprimé' });
    }

    const resultat = await genererRecu({
      ecole,
      eleve: {
        prenom: paiement.eleve_prenom, nom: paiement.eleve_nom, matricule: paiement.matricule,
      },
      classe: { libelle: paiement.classe_libelle },
      paiement,
      echeancier: { libelle: paiement.echeancier_libelle },
    });

    await db.query(
      `INSERT INTO documents_generes (ecole_id, type, identifiant_unique, eleve_id, paiement_id, chemin_fichier, genere_par)
       VALUES ($1, 'recu', $2, $3, $4, $5, $6)`,
      [req.user.ecole_id, paiement.numero_recu, paiement.eleve_id, id, resultat.nomFichier, req.user.id]
    );
    await journaliserAction({
      userId: req.user.id, action: 'generation_recu', cible: 'documents_generes',
      details: { numero_recu: paiement.numero_recu, paiement_id: id },
    });

    res.status(201).json({ identifiant: paiement.numero_recu, fichier: resultat.nomFichier });
  } catch (err) {
    next(err);
  }
});

export default router;