import 'dotenv/config';
import bcrypt from 'bcrypt';
import pool from '../src/db/index.js';

async function seed() {
  const { rows: existing } = await pool.query('SELECT COUNT(*)::int AS n FROM ecoles');
  if (existing[0].n > 0) {
    console.log('[seed] base déjà alimentée, rien à faire');
    return;
  }

  await pool.query('BEGIN');
  try {
    const ecole = await pool.query(
      `INSERT INTO ecoles (nom, adresse, telephone, email, slogan)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['École Pilote ECOSCOL', 'Dakar, Sénégal', '+221 33 000 00 00', 'contact@ecolepilote.sn', 'Savoir, réussir, grandir']
    );
    const ecoleId = ecole.rows[0].id;

    const mdpAdmin = await bcrypt.hash('Admin@2026', 10);
    const admin = await pool.query(
      `INSERT INTO users (ecole_id, nom, prenom, identifiant, mot_de_passe_hash, email)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [ecoleId, 'Ndiaye', 'Awa', 'admin', mdpAdmin, 'admin@ecolepilote.sn']
    );
    await pool.query('INSERT INTO user_roles (user_id, role_code) VALUES ($1, $2)', [admin.rows[0].id, 'ADMIN']);

    await pool.query(`INSERT INTO annees_scolaires (ecole_id, libelle, date_debut, date_fin, active)
      VALUES ($1, '2026-2027', '2026-10-01', '2027-07-31', TRUE)`, [ecoleId]);

    console.log('[seed] jeu de données de démonstration créé');
    console.log('[seed] Connexion admin: identifiant=admin, mot de passe=Admin@2026');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  await pool.query('COMMIT');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] échec:', err.message);
    process.exit(1);
  });