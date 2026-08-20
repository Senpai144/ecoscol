import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { journaliserAction } from '../services/authService.js';
import { genererCertificatScolarite, cheminAbsolu } from '../services/pdfService.js';

const router = Router();

router.post('/certificat-scolarite/:eleveId', authenticate, requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR'), async (req, res, next) => {
  const eleveId = parseInt(req.params.eleveId, 10);

  try {
    const { rows } = await db.query(
      `SELECT e.*, c.libelle AS classe_libelle, c.id AS classe_id,
              n.libelle AS niveau_libelle
       FROM eleves e
       LEFT JOIN classes c ON c.id = e.classe_id
       LEFT JOIN niveaux n ON n.id = c.niveau_id
       WHERE e.id = $1 AND e.ecole_id = $2`,
      [eleveId, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Élève introuvable' });
    const eleve = rows[0];

    const annee = await db.query(
      'SELECT * FROM annees_scolaires WHERE ecole_id = $1 AND active = TRUE',
      [req.user.ecole_id]
    );
    const ecole = await db.query('SELECT * FROM ecoles WHERE id = $1', [req.user.ecole_id]);

    const classe = eleve.classe_id
      ? await db.query('SELECT * FROM classes WHERE id = $1', [eleve.classe_id])
      : null;

    const identifiant = `CERT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const resultat = await genererCertificatScolarite({
      ecole: ecole.rows[0],
      eleve,
      classe: classe?.rows[0] ?? null,
      annee: annee.rows[0] ?? null,
      identifiant,
    });

    await db.query(
      `INSERT INTO documents_generes (ecole_id, type, identifiant_unique, eleve_id, chemin_fichier, genere_par)
       VALUES ($1, 'certificat_scolarite', $2, $3, $4, $5)`,
      [req.user.ecole_id, identifiant, eleveId, resultat.nomFichier, req.user.id]
    );

    await journaliserAction({
      userId: req.user.id,
      action: 'generation_certificat',
      cible: 'documents_generes',
      details: { identifiant_unique: identifiant, eleve_id: eleveId },
    });

    res.status(201).json({ identifiant, fichier: resultat.nomFichier });
  } catch (err) {
    next(err);
  }
});

router.get('/documents/:nomFichier', authenticate, requireRoles('ADMIN', 'SECRETARIAT', 'CENSEUR', 'COMPTABLE'), async (req, res, next) => {
  const nomFichier = req.params.nomFichier;
  try {
    const { rows } = await db.query(
      `SELECT * FROM documents_generes
       WHERE chemin_fichier = $1 AND ecole_id = $2`,
      [nomFichier, req.user.ecole_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Document introuvable' });

    const doc = rows[0];
    const { eleve_id, type } = doc;

    if (type === 'certificat_scolarite' || type === 'bulletin') {
      const { rows: eleves } = await db.query(
        'SELECT id FROM eleves WHERE id = $1 AND ecole_id = $2',
        [eleve_id, req.user.ecole_id]
      );
      if (eleves.length === 0 && !req.user.roles.some((r) => ['ADMIN', 'SECRETARIAT', 'CENSEUR'].includes(r))) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    } else if (type === 'recu') {
      const { rows: eleves } = await db.query(
        'SELECT id FROM eleves WHERE id = $1 AND ecole_id = $2',
        [eleve_id, req.user.ecole_id]
      );
      if (eleves.length === 0 && !req.user.roles.some((r) => ['ADMIN', 'SECRETARIAT', 'CENSEUR', 'COMPTABLE'].includes(r))) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    res.download(cheminAbsolu(nomFichier), nomFichier.replace(/\.pdf$/, '.pdf'), (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
});

export default router;