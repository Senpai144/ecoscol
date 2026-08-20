import { withTransaction } from '../db/index.js';

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