import { withTransaction } from '../db/index.js';
import db from '../db/index.js';
import { genererRecu } from './pdfService.js';

export const MODES_PAIEMENT = ['especes', 'cheque', 'mobile_money', 'virement'];

function numeroRecuSuivant(annee, dernier) {
  const seq = dernier ? parseInt(dernier.split('-')[2], 10) + 1 : 1;
  return `REC-${annee}-${String(seq).padStart(4, '0')}`;
}

// BR-04 reçu unique séquentiel, BR-05 non modifiable, BR-06 solde recalculé à chaque paiement.
// Pour l'année, le numéro de reçu est unique et séquentiel (l'ordre de grandeur reflète l'ordre de saisie).
export async function creerPaiement({
  ecoleId, saisiPar, eleveId, echeancierId = null, montant, motif, mode,
  transactionRef = null, date = null, origine = 'regie',
}) {
  const montantNum = Number(montant);
  const anneeCourante = new Date().getFullYear();
  const datePaiement = date || new Date().toISOString().slice(0, 10);

  let paiement = null;
  for (let tentative = 0; tentative < 5; tentative++) {
    try {
      paiement = await withTransaction(async (client) => {
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
          [ecoleId, eleveId, echeancierId, montantNum, motif, mode, numero,
           transactionRef, datePaiement, saisiPar]
        );
        if (echeancierId) {
          await client.query(
            `UPDATE echeanciers SET solde = GREATEST(solde - $1, 0)
             WHERE id = $2 AND eleve_id = $3`,
            [montantNum, echeancierId, eleveId]
          );
        }
        return paiements[0];
      });
      break;
    } catch (err) {
      if (err.code !== '23505' || tentative === 4) throw err;
    }
  }

  return { ...paiement, origine };
}

// BR-06 : un paiement erroné est corrigé (montant/mode/motif/référence), jamais supprimé ;
// le solde de l'échéance est recalculé de la différence entre l'ancien et le nouveau montant.
export async function modifierPaiement({
  ecoleId, paiementId, modifiePar, montant, mode, motif, transactionRef = null, date = null,
}) {
  const montantNum = Number(montant);
  if (!(montantNum > 0)) throw new Error('Montant invalide');

  return withTransaction(async (client) => {
    const { rows: existants } = await client.query(
      `SELECT * FROM paiements WHERE id = $1 AND ecole_id = $2 AND recu_annule = FALSE FOR UPDATE`,
      [paiementId, ecoleId]
    );
    if (existants.length === 0) return null;

    const ancien = existants[0];
    const { rows: misAJour } = await client.query(
      `UPDATE paiements
       SET montant = $1, mode = $2, motif = $3, transaction_ref = $4, date_paiement = $5,
           modifie_le = NOW(), modifie_par = $6
       WHERE id = $7
       RETURNING *`,
      [montantNum, mode, motif, transactionRef ?? ancien.transaction_ref,
       date ?? ancien.date_paiement, modifiePar, paiementId]
    );

    if (ancien.echeancier_id) {
      const ecart = Number(ancien.montant) - montantNum;
      await client.query(
        `UPDATE echeanciers SET solde = LEAST(GREATEST(solde + $1, 0), montant_du)
         WHERE id = $2 AND eleve_id = $3`,
        [ecart, ancien.echeancier_id, ancien.eleve_id]
      );
    }
    return { ancien, paiement: misAJour[0] };
  });
}

// BR-04 : le reçu PDF est régénéré avec les données corrigées (même fichier, même numéro).
export async function regenererRecuPaiement({ ecoleId, eleveId, paiementId, genrePar }) {
  const { rows: ecoles } = await db.query('SELECT * FROM ecoles WHERE id = $1', [ecoleId]);
  const { rows: eleves } = await db.query(
    'SELECT prenom, nom, matricule, classe_id FROM eleves WHERE id = $1', [eleveId]
  );
  if (ecoles.length === 0 || eleves.length === 0) return null;
  const { rows: classes } = await db.query('SELECT libelle FROM classes WHERE id = $1', [eleves[0].classe_id]);
  const { rows: paiements } = await db.query(
    `SELECT p.*, ec.libelle AS echeancier_libelle
     FROM paiements p LEFT JOIN echeanciers ec ON ec.id = p.echeancier_id
     WHERE p.id = $1`,
    [paiementId]
  );
  if (paiements.length === 0) return null;

  const resultat = await genererRecu({
    ecole: ecoles[0],
    eleve: { prenom: eleves[0].prenom, nom: eleves[0].nom, matricule: eleves[0].matricule },
    classe: classes[0] ?? null,
    paiement: paiements[0],
    echeancier: { libelle: paiements[0].echeancier_libelle ?? null },
  });

  await db.query(
    `INSERT INTO documents_generes (ecole_id, type, identifiant_unique, eleve_id, paiement_id, chemin_fichier, genere_par)
     VALUES ($1, 'recu', $2, $3, $4, $5, $6)
     ON CONFLICT (identifiant_unique)
     DO UPDATE SET chemin_fichier = EXCLUDED.chemin_fichier, genere_par = EXCLUDED.genere_par,
                   date_generation = NOW()`,
    [ecoleId, paiements[0].numero_recu, eleveId, paiementId, resultat.nomFichier, genrePar]
  );
  return resultat.nomFichier;
}