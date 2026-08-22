import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import bcrypt from 'bcrypt';
import db, { withTransaction } from '../db/index.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { signToken } from '../utils/jwt.js';
import { journaliserAction } from '../services/authService.js';
import { delCache } from '../services/cache.js';

const router = Router();

const SOUS_DOMAINE_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const LOGOS_DIR = path.join(process.cwd(), 'uploads', 'etablissements');
fs.mkdirSync(LOGOS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: LOGOS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      const etabId = req.etablissement_id ?? req.user?.ecole_id ?? 'tmp';
      cb(null, `logo-etab-${etabId}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
      return cb(new Error('Format d\'image non supporté (PNG, JPG, WEBP, SVG)'));
    }
    cb(null, true);
  },
});

const MIME_POUR_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function extraireInfoEtablissement(rows0) {
  return {
    id: rows0.id,
    nom: rows0.nom,
    sous_domaine: rows0.sous_domaine,
    logo_base64: rows0.logo_base64,
    adresse: rows0.adresse,
    telephone: rows0.telephone,
    email_contact: rows0.email,
    slogan: rows0.slogan,
    couleur_principale: rows0.couleur_principale,
    plan: rows0.plan,
    statut: rows0.statut,
  };
}

router.post('/', async (req, res, next) => {
  const { nom, sous_domaine, email, mot_de_passe } = req.body ?? {};
  try {
    if (!nom || !sous_domaine || !email || !mot_de_passe) {
      return res.status(400).json({ error: 'Nom, sous-domaine, email et mot de passe requis' });
    }
    const domaine = String(sous_domaine).trim().toLowerCase();
    if (!SOUS_DOMAINE_RE.test(domaine)) {
      return res.status(400).json({ error: 'Sous-domaine invalide (a-z, 0-9, tirets uniquement)' });
    }
    if (mot_de_passe.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);
    let resultat = null;
    try {
      resultat = await withTransaction(async (client) => {
        const { rows: etabs } = await client.query(
          `INSERT INTO ecoles (nom, sous_domaine, email, statut, plan)
           VALUES ($1, $2, $3, 'actif', 'free')
           RETURNING *`,
          [nom, domaine, email]
        );
        const etab = etabs[0];
        const identifiant = `admin.${domaine}`;
        const { rows: users } = await client.query(
          `INSERT INTO users (ecole_id, nom, prenom, identifiant, mot_de_passe_hash, email, statut)
           VALUES ($1, $2, $3, $4, $5, $6, 'actif')
           RETURNING *`,
          [etab.id, 'Administrateur', '', identifiant, hash, email]
        );
        await client.query(
          'INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)',
          [users[0].id, 'ADMIN']
        );
        return { etab: etabs[0], user: users[0] };
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Sous-domaine déjà utilisé' });
      }
      throw err;
    }

    const token = signToken({ userId: resultat.user.id, ecoleId: resultat.etab.id, etablissementId: resultat.etab.id });
    await journaliserAction({
      userId: resultat.user.id, action: 'inscription_etablissement', cible: 'ecoles',
      details: { nom: resultat.etab.nom, sous_domaine: resultat.etab.sous_domaine },
    });

    res.status(201).json({
      token,
      etablissement: extraireInfoEtablissement(resultat.etab),
      user: {
        id: resultat.user.id,
        nom: resultat.user.nom,
        prenom: resultat.user.prenom,
        identifiant: resultat.user.identifiant,
        ecoleId: resultat.etab.id,
        ecoleNom: resultat.etab.nom,
        roles: ['ADMIN'],
        etablissement: extraireInfoEtablissement(resultat.etab),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---- Vérification de disponibilité du sous-domaine (public) ----
router.get('/verifier-sous-domaine', async (req, res, next) => {
  const nom = String(req.query.nom ?? '').trim().toLowerCase();
  try {
    if (!nom || !SOUS_DOMAINE_RE.test(nom)) {
      return res.json({ disponible: false, raison: 'format_invalide' });
    }
    const { rows } = await db.query('SELECT 1 FROM ecoles WHERE sous_domaine = $1', [nom]);
    res.json({ disponible: rows.length === 0, raison: rows.length ? 'deja_utilise' : null });
  } catch (err) {
    next(err);
  }
});

// ---- Infos de son propre établissement (admin) ----
router.get('/moi', authenticate, requireRoles('ADMIN'), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM ecoles WHERE id = $1', [req.etablissement_id]);
    res.json({ etablissement: rows[0] ? extraireInfoEtablissement(rows[0]) : null });
  } catch (err) {
    next(err);
  }
});

router.patch('/moi', authenticate, requireRoles('ADMIN'), async (req, res, next) => {
  const { nom, adresse, telephone, email_contact, slogan, couleur_principale } = req.body ?? {};
  try {
    if (!nom) return res.status(400).json({ error: 'Nom de l\'établissement requis' });
    if (couleur_principale && !/^#[0-9a-fA-F]{6}$/.test(couleur_principale)) {
      return res.status(400).json({ error: 'Couleur principale invalide (format #RRGGBB)' });
    }
    const { rows } = await db.query(
      `UPDATE ecoles
       SET nom = $1, adresse = $2, telephone = $3, email = $4, slogan = $5,
           couleur_principale = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [nom, adresse ?? null, telephone ?? null, email_contact ?? null, slogan ?? null,
       couleur_principale ?? null, req.etablissement_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Établissement introuvable' });
    await delCache(`ecoscol:public:etablissement:${rows[0].sous_domaine}`);
    await journaliserAction({
      userId: req.user.id, action: 'mise_a_jour_etablissement', cible: 'ecoles',
      details: { nom: rows[0].nom },
    });
    res.json({ etablissement: extraireInfoEtablissement(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// ---- Upload / remplacement du logo (admin) ----
router.post('/moi/logo', authenticate, requireRoles('ADMIN'), upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier logo requis' });
    const mime = MIME_POUR_EXT[path.extname(req.file.filename).toLowerCase()] ?? 'image/png';
    const base64 = fs.readFileSync(req.file.path).toString('base64');
    const { rows } = await db.query(
      `UPDATE ecoles SET logo_path = $1, logo_base64 = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [req.file.filename, `data:${mime};base64,${base64}`, req.etablissement_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Établissement introuvable' });
    await delCache(`ecoscol:public:etablissement:${rows[0].sous_domaine}`);
    await journaliserAction({
      userId: req.user.id, action: 'upload_logo_etablissement', cible: 'ecoles', details: {},
    });
    res.json({ etablissement: extraireInfoEtablissement(rows[0]) });
  } catch (err) {
    if (err.message?.includes('non supporté')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

export default router;