import { Router } from 'express';
import path from 'node:path';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';
import { notifierParents } from '../services/notificationService.js';
import { creerPaiement, modifierPaiement, regenererRecuPaiement, MODES_PAIEMENT } from '../services/financeService.js';
import { cheminAbsolu } from '../services/pdfService.js';

const router = Router();
router.use(authenticate, requireRoles('PARENT'));

function jourSemaineActuel() {
  const d = new Date();
  return d.getDay() === 0 ? 7 : d.getDay();
}

function formatHeure(t) {
  return String(t).slice(0, 5);
}

// BR-20.2 : un parent ne consulte que les données de ses propres enfants
async function listerEnfantsDuParent(userId, ecoleId) {
  const { rows } = await db.query(
    `SELECT e.id, e.nom, e.prenom, e.matricule, e.classe_id, e.statut,
            c.libelle AS classe_libelle,
            nv.libelle AS niveau_libelle,
            s.libelle AS serie_libelle
     FROM tuteurs t
     JOIN eleve_tuteurs et ON et.tuteur_id = t.id
     JOIN eleves e ON e.id = et.eleve_id AND e.ecole_id = $2
     LEFT JOIN classes c ON c.id = e.classe_id
     LEFT JOIN niveaux nv ON nv.id = c.niveau_id
     LEFT JOIN series s ON s.id = c.serie_id
     WHERE t.user_id = $1 AND t.ecole_id = $2`,
    [userId, ecoleId]
  );
  return rows;
}

async function derniereSequence(ecoleId) {
  const { rows } = await db.query(
    `SELECT s.*
     FROM sequences s
     JOIN annees_scolaires a ON a.id = s.annee_scolaire_id
     WHERE s.ecole_id = $1 AND a.active = TRUE AND s.validee = TRUE
     ORDER BY s.ordre DESC
     LIMIT 1`,
    [ecoleId]
  );
  if (rows[0]) return rows[0];

  const { rows: fallback } = await db.query(
    `SELECT s.*
     FROM sequences s
     JOIN annees_scolaires a ON a.id = s.annee_scolaire_id
     WHERE s.ecole_id = $1 AND a.active = TRUE
     ORDER BY s.ordre DESC
     LIMIT 1`,
    [ecoleId]
  );
  return fallback[0] ?? null;
}

async function moyennesEtNotes(sequenceId, classeId, eleveId, ecoleId) {
  const { rows } = await db.query(
    `SELECT m.nom AS matiere, m.id AS matiere_id,
            ROUND(COALESCE(AVG(nt.valeur), 0)::numeric, 2) AS moyenne,
            COALESCE(MAX(nt.coefficient), 1) AS coefficient,
            COUNT(nt.id)::int AS n_notes
     FROM matieres m
     JOIN enseignements ens ON ens.matiere_id = m.id AND ens.classe_id = $3
     LEFT JOIN notes nt ON nt.matiere_id = m.id
                        AND nt.sequence_id = $1
                        AND nt.eleve_id = $2
     WHERE m.ecole_id = $4
     GROUP BY m.nom, m.id
     ORDER BY m.nom`,
    [sequenceId, eleveId, classeId, ecoleId]
  );

  let somme = 0, totalCoeff = 0;
  for (const r of rows) {
    somme += Number(r.moyenne) * Number(r.coefficient);
    totalCoeff += Number(r.coefficient);
  }
  const moyenneGenerale = totalCoeff > 0 ? Number((somme / totalCoeff).toFixed(2)) : 0;
  return { parMatiere: rows, moyenneGenerale };
}

async function rangDeEleve(sequenceId, classeId, eleveId, ecoleId) {
  const { rows } = await db.query(
    `SELECT e.id AS eleve_id,
            COALESCE(ROUND(SUM(nt.valeur * nt.coefficient)::numeric / NULLIF(SUM(nt.coefficient), 0), 2), 0) AS moyenne
     FROM eleves e
     LEFT JOIN notes nt ON nt.eleve_id = e.id AND nt.sequence_id = $1
     WHERE e.classe_id = $2 AND e.statut = 'actif' AND e.ecole_id = $3
     GROUP BY e.id
     ORDER BY moyenne DESC`,
    [sequenceId, classeId, ecoleId]
  );
  const idx = rows.findIndex((r) => Number(r.eleve_id) === Number(eleveId));
  return { rang: idx === -1 ? 0 : idx + 1, totalEleves: rows.length };
}

router.get('/tableau-de-bord', async (req, res, next) => {
  try {
    const enfants = await listerEnfantsDuParent(req.user.id, req.user.ecole_id);
    const sequence = await derniereSequence(req.user.ecole_id);
    const jour = jourSemaineActuel();

    const resultats = [];
    for (const eleve of enfants) {
      const { rows: edtRows } = await db.query(
        `SELECT e.id, e.heure_debut, e.heure_fin, m.nom AS matiere,
                u.prenom AS enseignant_prenom, u.nom AS enseignant_nom
         FROM emplois_du_temps e
         JOIN matieres m ON m.id = e.matiere_id
         JOIN enseignants en ON en.id = e.enseignant_id
         LEFT JOIN users u ON u.id = en.user_id
         WHERE e.classe_id = $1 AND e.ecole_id = $2 AND e.jour_semaine = $3
         ORDER BY e.heure_debut`,
        [eleve.classe_id, req.user.ecole_id, jour]
      );
      const edt = edtRows.map((c) => ({
        id: c.id,
        matiere: c.matiere,
        enseignant: `${c.enseignant_prenom ?? ''} ${c.enseignant_nom ?? ''}`.trim(),
        heure_debut: formatHeure(c.heure_debut),
        heure_fin: formatHeure(c.heure_fin),
      }));

      const { rows: devoirs } = await db.query(
        `SELECT ct.contenu, ct.date_cours, m.nom AS matiere
         FROM cahiers_texte ct
         JOIN matieres m ON m.id = ct.matiere_id
         WHERE ct.classe_id = $1 AND ct.ecole_id = $2
         ORDER BY ct.date_cours DESC
         LIMIT 6`,
        [eleve.classe_id, req.user.ecole_id]
      );

      const { rows: statsVs } = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE type = 'absence')::int AS absences,
           COUNT(*) FILTER (WHERE type = 'retard')::int AS retards,
           COUNT(*) FILTER (WHERE type = 'absence' AND NOT justifiee)::int AS absences_non_justifiees
         FROM absences
         WHERE eleve_id = $1`,
        [eleve.id]
      );
      const { rows: statsSanctions } = await db.query(
        'SELECT COUNT(*)::int AS n FROM sanctions WHERE eleve_id = $1', [eleve.id]
      );

      const { rows: soldeRows } = await db.query(
        `SELECT COALESCE(SUM(solde), 0)::numeric AS reste_a_payer
         FROM echeanciers
         WHERE eleve_id = $1`,
        [eleve.id]
      );

      const { rows: notifications } = await db.query(
        `SELECT id, type, message, lu, date
         FROM notifications
         WHERE user_id = $1
         ORDER BY lu ASC, date DESC
         LIMIT 5`,
        [req.user.id]
      );

      let moyennes = null;
      if (sequence) {
        const m = await moyennesEtNotes(sequence.id, eleve.classe_id, eleve.id, req.user.ecole_id);
        const r = await rangDeEleve(sequence.id, eleve.classe_id, eleve.id, req.user.ecole_id);
        moyennes = {
          sequence: { id: sequence.id, libelle: sequence.libelle, validee: sequence.validee },
          moyenneGenerale: m.moyenneGenerale,
          parMatiere: m.parMatiere.map((x) => ({
            matiere: x.matiere,
            moyenne: Number(x.moyenne),
            coefficient: Number(x.coefficient),
            n_notes: x.n_notes,
          })),
          rang: r.rang,
          totalEleves: r.totalEleves,
        };
      }

      const { rows: bulletinRows } = await db.query(
        `SELECT identifiant_unique, chemin_fichier, date_generation
         FROM documents_generes
         WHERE eleve_id = $1 AND type = 'bulletin'
         ORDER BY date_generation DESC
         LIMIT 1`,
        [eleve.id]
      );

      resultats.push({
        eleve: {
          id: eleve.id,
          nom: eleve.nom,
          prenom: eleve.prenom,
          matricule: eleve.matricule,
          statut: eleve.statut,
          classe: eleve.classe_libelle,
          niveau: eleve.niveau_libelle,
          serie: eleve.serie_libelle,
        },
        edt,
        devoirs,
        vieScolaire: { ...statsVs[0], sanctions: statsSanctions[0].n },
        solde: {
          reste_a_payer: Number(soldeRows[0].reste_a_payer),
        },
        notifications,
        moyennes,
        bulletin: bulletinRows[0] ?? null,
      });
    }

    res.json({
      parent: { nom: req.user.nom, prenom: req.user.prenom },
      jour: { numero: jour, libelle: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][jour === 7 ? 0 : jour] },
      jouraccueil: {
        date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
      },
      enfants: resultats,
    });
  } catch (err) {
    next(err);
  }
});

async function enfantDuParent(userId, ecoleId, eleveId) {
  const { rows } = await db.query(
    `SELECT e.id, e.nom, e.prenom, e.matricule, e.classe_id
     FROM tuteurs t
     JOIN eleve_tuteurs et ON et.tuteur_id = t.id
     JOIN eleves e ON e.id = et.eleve_id AND e.ecole_id = $2
     WHERE t.user_id = $1 AND t.ecole_id = $2 AND e.id = $3`,
    [userId, ecoleId, eleveId]
  );
  return rows[0] ?? null;
}

router.get('/paiements/:eleveId', async (req, res, next) => {
  const eleveId = parseInt(req.params.eleveId, 10);
  try {
    const enfant = await enfantDuParent(req.user.id, req.user.ecole_id, eleveId);
    if (!enfant) return res.status(404).json({ error: 'Dossier élève introuvable pour ce compte parent' });

    const { rows: echeanciers } = await db.query(
      `SELECT ec.*, a.libelle AS annee_libelle
       FROM echeanciers ec
       JOIN annees_scolaires a ON a.id = ec.annee_scolaire_id
       WHERE ec.eleve_id = $1
       ORDER BY ec.date_echeance`,
      [eleveId]
    );
    const { rows: paiements } = await db.query(
      `SELECT p.*, ec.libelle AS echeancier_libelle,
              dg.chemin_fichier AS recu_fichier
       FROM paiements p
       LEFT JOIN echeanciers ec ON ec.id = p.echeancier_id
       LEFT JOIN documents_generes dg ON dg.paiement_id = p.id AND dg.type = 'recu'
       WHERE p.eleve_id = $1
       ORDER BY p.date_paiement DESC, p.id DESC`,
      [eleveId]
    );

    const totalDu = echeanciers.reduce((s, e) => s + Number(e.montant_du), 0);
    const resteDu = echeanciers.reduce((s, e) => s + Number(e.solde), 0);
    const totalPaye = paiements
      .filter((p) => !p.recu_annule)
      .reduce((s, p) => s + Number(p.montant), 0);

    res.json({ eleve: enfant, echeanciers, paiements, totalDu, totalPaye, resteDu });
  } catch (err) {
    next(err);
  }
});

// Paiement en ligne (mobile money) — la passerelle est simulée : la référence de
// transaction fournie (ou générée) tient lieu d'accusé de confirmation du réseau.
router.post('/paiements', async (req, res, next) => {
  const { eleve_id, echeancier_id, montant, motif, mode, transaction_ref } = req.body ?? {};
  try {
    if (!eleve_id || !(Number(montant) > 0) || !motif || !mode) {
      return res.status(400).json({ error: 'Élève, montant positif, motif et mode requis' });
    }
    if (!MODES_PAIEMENT.includes(mode)) {
      return res.status(400).json({ error: `Mode invalide (${MODES_PAIEMENT.join(', ')})` });
    }
    const enfant = await enfantDuParent(req.user.id, req.user.ecole_id, eleve_id);
    if (!enfant) return res.status(404).json({ error: 'Dossier élève introuvable pour ce compte parent' });

    if (echeancier_id) {
      const { rows: ech } = await db.query(
        'SELECT id FROM echeanciers WHERE id = $1 AND eleve_id = $2',
        [echeancier_id, eleve_id]
      );
      if (ech.length === 0) {
        return res.status(400).json({ error: 'Échéance introuvable pour cet élève' });
      }
    }

    const prefixe = { especes: 'CAI', cheque: 'CHQ', mobile_money: 'MM', virement: 'VIR' }[mode] || 'PAY';
    // Référence de transaction générée automatiquement (passerelle simulée : MM-<horodatage>-<aléa>)
    const transactionRef = transaction_ref || `${prefixe}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    const paiement = await creerPaiement({
      ecoleId: req.user.ecole_id,
      saisiPar: req.user.id,
      eleveId: eleve_id,
      echeancierId: echeancier_id || null,
      montant,
      motif,
      mode,
      transactionRef,
      origine: 'portail',
    });

    // Reçu généré automatiquement (BR : paiement en ligne avec reçu automatique), archivé et téléchargeable
    const nomFichier = await regenererRecuPaiement({
      ecoleId: req.user.ecole_id,
      eleveId: eleve_id,
      paiementId: paiement.id,
      genrePar: req.user.id,
    });

    await notifierParents(
      eleve_id, req.user.ecole_id, 'finance',
      `Votre paiement ${paiement.numero_recu} de ${Number(montant).toLocaleString('fr-FR')} FCFA (${mode}) a été confirmé. Reçu disponible dans le portail.`
    );
    await journaliserAction({
      userId: req.user.id, action: 'paiement_en_ligne', cible: 'paiements',
      details: { numero_recu: paiement.numero_recu, eleve_id, montant: Number(montant), mode, origine: 'portail' },
    });

    res.status(201).json({
      paiement: { ...paiement, recu_fichier: nomFichier },
      message: `Paiement ${paiement.numero_recu} confirmé. Le reçu est disponible dans votre portail.`,
    });
  } catch (err) {
    next(err);
  }
});

// Correction d'un paiement en ligne saisi par erreur (montant, mode, motif, référence).
// BR-05 : jamais de suppression — le solde est recalculé et le reçu PDF régénéré.
router.patch('/paiements/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { montant, mode, motif, transaction_ref } = req.body ?? {};
  try {
    const { rows: paiements } = await db.query(
      'SELECT * FROM paiements WHERE id = $1 AND ecole_id = $2',
      [id, req.user.ecole_id]
    );
    if (paiements.length === 0) return res.status(404).json({ error: 'Paiement introuvable' });
    const paiement = paiements[0];
    const enfant = await enfantDuParent(req.user.id, req.user.ecole_id, paiement.eleve_id);
    if (!enfant) return res.status(404).json({ error: 'Paiement introuvable pour vos enfants' });
    if (paiement.recu_annule) return res.status(409).json({ error: 'Un paiement annulé ne peut pas être modifié' });

    const modeFinal = mode ?? paiement.mode;
    if (!MODES_PAIEMENT.includes(modeFinal)) {
      return res.status(400).json({ error: `Mode invalide (${MODES_PAIEMENT.join(', ')})` });
    }

    const resultat = await modifierPaiement({
      ecoleId: req.user.ecole_id,
      paiementId: id,
      modifiePar: req.user.id,
      montant: montant ?? paiement.montant,
      mode: modeFinal,
      motif: motif ?? paiement.motif,
      transactionRef: transaction_ref ?? paiement.transaction_ref,
    });
    if (!resultat) return res.status(404).json({ error: 'Paiement introuvable' });

    const nomFichier = await regenererRecuPaiement({
      ecoleId: req.user.ecole_id,
      eleveId: paiement.eleve_id,
      paiementId: id,
      genrePar: req.user.id,
    });

    await notifierParents(
      paiement.eleve_id, req.user.ecole_id, 'finance',
      `Votre paiement ${paiement.numero_recu} a été corrigé : ${Number(resultat.paiement.montant).toLocaleString('fr-FR')} FCFA (${modeFinal}). Le reçu mis à jour est disponible dans le portail.`
    );
    await journaliserAction({
      userId: req.user.id, action: 'modification_paiement', cible: 'paiements',
      details: { numero_recu: paiement.numero_recu, avant: Number(paiement.montant), apres: Number(resultat.paiement.montant), origine: 'portail' },
    });

    res.json({
      paiement: { ...resultat.paiement, recu_fichier: nomFichier },
      message: `Paiement ${paiement.numero_recu} corrigé. Le solde et le reçu ont été mis à jour.`,
    });
  } catch (err) {
    next(err);
  }
});

// Téléchargement des documents de ses propres enfants (bulletins, reçus, certificats)
router.get('/documents/:nomFichier', async (req, res, next) => {
  const nomFichier = req.params.nomFichier;
  try {
    const { rows } = await db.query(
      `SELECT d.*
       FROM documents_generes d
       JOIN eleve_tuteurs et ON et.eleve_id = d.eleve_id
       JOIN tuteurs t ON t.id = et.tuteur_id
       WHERE d.chemin_fichier = $1 AND t.user_id = $2 AND t.ecole_id = $3`,
      [nomFichier, req.user.id, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Document introuvable pour vos enfants' });

    const doc = rows[0];
    res.download(cheminAbsolu(nomFichier), path.basename(nomFichier), (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
});

// Données du reçu pour la page reçu imprimable/PDF du portail (scopées aux enfants du parent)
router.get('/recus/:paiementId', async (req, res, next) => {
  const id = parseInt(req.params.paiementId, 10);
  try {
    const { rows: paiements } = await db.query(
      'SELECT * FROM paiements WHERE id = $1 AND ecole_id = $2',
      [id, req.user.ecole_id]
    );
    if (paiements.length === 0) return res.status(404).json({ error: 'Paiement introuvable' });
    const paiement = paiements[0];
    const enfant = await enfantDuParent(req.user.id, req.user.ecole_id, paiement.eleve_id);
    if (!enfant) return res.status(404).json({ error: 'Paiement introuvable pour vos enfants' });

    const [{ rows: eleves }, { rows: ecoles }, { rows: tuteurs }] = await Promise.all([
      db.query(
        `SELECT e.prenom, e.nom, e.matricule, c.libelle AS classe_libelle
         FROM eleves e LEFT JOIN classes c ON c.id = e.classe_id
         WHERE e.id = $1`,
        [paiement.eleve_id]
      ),
      db.query('SELECT nom, adresse, telephone, email, slogan, logo_base64 FROM ecoles WHERE id = $1', [paiement.ecole_id]),
      db.query(
        `SELECT t.prenom, t.nom
         FROM tuteurs t JOIN eleve_tuteurs et ON et.tuteur_id = t.id
         WHERE et.eleve_id = $1 AND t.user_id = $2
         LIMIT 1`,
        [paiement.eleve_id, req.user.id]
      ),
    ]);

    let echeancier = null;
    if (paiement.echeancier_id) {
      const { rows: ech } = await db.query(
        `SELECT ec.libelle, ec.date_echeance, a.libelle AS annee_libelle
         FROM echeanciers ec JOIN annees_scolaires a ON a.id = ec.annee_scolaire_id
         WHERE ec.id = $1`,
        [paiement.echeancier_id]
      );
      echeancier = ech[0] ?? null;
    }

    res.json({
      paiement: {
        id: paiement.id, numero_recu: paiement.numero_recu, montant: Number(paiement.montant),
        mode: paiement.mode, motif: paiement.motif, transaction_ref: paiement.transaction_ref,
        date_paiement: paiement.date_paiement, recu_annule: paiement.recu_annule,
        date_modification: paiement.modifie_le,
      },
      eleve: eleves[0] ?? null,
      echeancier,
      ecole: ecoles[0] ?? null,
      payePar: tuteurs[0] ? `${tuteurs[0].prenom} ${tuteurs[0].nom}` : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;