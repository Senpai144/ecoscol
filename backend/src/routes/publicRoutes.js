import { Router } from 'express';
import db from '../db/index.js';
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '../services/cache.js';

const router = Router();

// Données publiques (pré-connexion) d'un établissement, résolues par sous-domaine :
// permet d'afficher le bon logo / les bonnes couleurs sur la page de connexion.
// Aucune donnée métier n'est exposée ici.
// Données mises en cache (Redis, 1h) car appelées à chaque affichage du login.
router.get('/etablissement', async (req, res, next) => {
  const sousDomaine = String(req.query.domaine ?? req.query.sous_domaine ?? '').trim().toLowerCase();
  try {
    if (!sousDomaine) return res.status(400).json({ error: 'Paramètre domaine requis' });

    const key = `ecoscol:public:etablissement:${sousDomaine}`;
    const cached = await getCache(key);
    if (cached) {
      if (cached === 'NOT_FOUND') return res.status(404).json({ error: 'Établissement inconnu' });
      return res.json({ etablissement: cached });
    }

    const { rows } = await db.query(
      `SELECT id, nom, sous_domaine, logo_base64, adresse, telephone, email, slogan,
              couleur_principale, statut
       FROM ecoles WHERE LOWER(sous_domaine) = $1`,
      [sousDomaine]
    );
    if (rows.length === 0) {
      await setCache(key, 'NOT_FOUND', 300);
      return res.status(404).json({ error: 'Établissement inconnu' });
    }
    const e = rows[0];
    const etablissement = {
      id: e.id,
      nom: e.nom,
      sous_domaine: e.sous_domaine,
      logo_base64: e.logo_base64,
      adresse: e.adresse,
      telephone: e.telephone,
      email: e.email,
      slogan: e.slogan,
      couleur_principale: e.couleur_principale,
      disponible: e.statut === 'actif',
    };
    await setCache(key, etablissement, CACHE_TTL.ECOLE);
    res.json({ etablissement });
  } catch (err) {
    next(err);
  }
});

export default router;
