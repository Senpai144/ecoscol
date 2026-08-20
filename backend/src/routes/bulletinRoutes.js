import { Router } from 'express';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';
import { genererBulletin } from '../services/pdfService.js';

const router = Router();
router.use(authenticate, requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR'));

router.post('/generer/:eleveId', async (req, res, next) => {
  const eleveId = parseInt(req.params.eleveId, 10);
  const { sequence_id, decision } = req.body ?? {};

  if (!sequence_id) {
    return res.status(400).json({ error: 'sequence_id requis' });
  }

  try {
    const { rows: sequenceRows } = await db.query(
      `SELECT s.*, a.libelle AS annee_libelle
       FROM sequences s
       JOIN annees_scolaires a ON a.id = s.annee_scolaire_id
       WHERE s.id = $1 AND s.ecole_id = $2`,
      [sequence_id, req.user.ecole_id]
    );
    if (sequenceRows.length === 0) return res.status(404).json({ error: 'Séquence introuvable' });
    const sequence = sequenceRows[0];

    // BR-10: le bulletin exige une séquence validée (notes verrouillées)
    if (!sequence.validee) {
      return res.status(409).json({ error: 'Séquence non validée : le bulletin exige la validation du censeur (BR-10)' });
    }

    const { rows: eleveRows } = await db.query(
      `SELECT e.*, c.libelle AS classe_libelle, c.serie_id,
              s.libelle AS serie_libelle
       FROM eleves e
       LEFT JOIN classes c ON c.id = e.classe_id
       LEFT JOIN series s ON s.id = c.serie_id
       WHERE e.id = $1 AND e.ecole_id = $2`,
      [eleveId, req.user.ecole_id]
    );
    if (eleveRows.length === 0) return res.status(404).json({ error: 'Élève introuvable' });
    const eleve = eleveRows[0];
    if (!eleve.classe_id) return res.status(400).json({ error: 'Élève non affecté à une classe' });

    const { rows: moyennesMatiere } = await db.query(
      `SELECT m.nom AS matiere, m.id AS matiere_id,
              ROUND(AVG(nt.valeur)::numeric, 2) AS moyenne,
              COALESCE(MAX(nt.coefficient), 1) AS coefficient,
              COUNT(nt.id)::int AS n_notes
       FROM matieres m
       JOIN enseignements ens ON ens.matiere_id = m.id AND ens.classe_id = $2
       LEFT JOIN notes nt ON nt.matiere_id = m.id
                          AND nt.sequence_id = $1
                          AND nt.eleve_id = $3
       WHERE m.ecole_id = $4
       GROUP BY m.nom, m.id
       ORDER BY m.nom`,
      [sequence_id, eleve.classe_id, eleveId, req.user.ecole_id]
    );

    for (const m of moyennesMatiere) {
      if (m.n_notes === 0) {
        return res.status(422).json({ error: `Bulletin impossible : aucune note pour ${m.matiere} (BR-10)` });
      }
    }

    // Moyenne générale pondérée par coefficient
    let somme = 0, totalCoeff = 0;
    for (const m of moyennesMatiere) {
      somme += Number(m.moyenne) * Number(m.coefficient);
      totalCoeff += Number(m.coefficient);
    }
    const moyenneGenerale = totalCoeff > 0 ? Number((somme / totalCoeff).toFixed(2)) : 0;

    // Rang de l'élève dans sa classe
    const { rows: rangs } = await db.query(
      `SELECT e.id AS eleve_id,
              COALESCE(ROUND(SUM(nt.valeur * nt.coefficient)::numeric / NULLIF(SUM(nt.coefficient), 0), 2), 0) AS moyenne
       FROM eleves e
       LEFT JOIN notes nt ON nt.eleve_id = e.id AND nt.sequence_id = $1
       WHERE e.classe_id = $2 AND e.statut = 'actif'
       GROUP BY e.id
       ORDER BY moyenne DESC`,
      [sequence_id, eleve.classe_id]
    );
    const rang = rangs.findIndex((r) => Number(r.eleve_id) === eleveId) + 1;
    const totalEleves = rangs.length;

    const ecole = await db.query('SELECT * FROM ecoles WHERE id = $1', [req.user.ecole_id]);
    const annee = sequence.annee_scolaire_id
      ? await db.query('SELECT * FROM annees_scolaires WHERE id = $1', [sequence.annee_scolaire_id])
      : null;

    const resultat = await genererBulletin({
      ecole: ecole.rows[0],
      eleve,
      classe: { ...eleve, libelle: eleve.classe_libelle, serie_libelle: eleve.serie_libelle },
      annee: annee.rows[0] ?? null,
      sequence,
      moyennesParMatiere: moyennesMatiere,
      moyenneGenerale,
      rang,
      TOTAL_ELEVES: totalEleves,
      decision: decision ?? null,
    });

    await db.query(
      `INSERT INTO documents_generes (ecole_id, type, identifiant_unique, eleve_id, sequence_id, chemin_fichier, genere_par)
       VALUES ($1, 'bulletin', $2, $3, $4, $5, $6)
       ON CONFLICT (identifiant_unique)
       DO UPDATE SET chemin_fichier = EXCLUDED.chemin_fichier, genere_par = EXCLUDED.genere_par, date_generation = NOW()`,
      [req.user.ecole_id, resultat.identifiant, eleveId, sequence_id, resultat.nomFichier, req.user.id]
    );

    await journaliserAction({
      userId: req.user.id,
      action: 'generation_bulletin',
      cible: 'documents_generes',
      details: { identifiant_unique: resultat.identifiant, eleve_id: eleveId, sequence_id },
    });

    res.status(201).json({
      bulletin: {
        identifiant: resultat.identifiant,
        fichier: resultat.nomFichier,
        moyenne_generale: moyenneGenerale,
        moyenne_classement: totalEleves,
        rang,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;