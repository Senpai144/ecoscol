import { query, withTransaction } from '../db/index.js';

export async function listerRolesParUtilisateur(userId) {
  const { rows } = await query(
    `SELECT r.code, r.libelle
     FROM user_roles ur
     JOIN roles r ON r.code = ur.role_code
     WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.code);
}

export async function connexionReussie({ userId, identifiant, ip, userAgent }) {
  await query(
    `INSERT INTO journal_connexions (user_id, identifiant_saisi, reussie, ip, user_agent)
     VALUES ($1, $2, TRUE, $3, $4)`,
    [userId, identifiant, ip, userAgent]
  );
  await query('UPDATE users SET dernier_acces = NOW() WHERE id = $1', [userId]);
}

export async function connexionEchouee({ identifiant, ip, userAgent }) {
  await query(
    `INSERT INTO journal_connexions (user_id, identifiant_saisi, reussie, ip, user_agent)
     VALUES (NULL, $1, FALSE, $2, $3)`,
    [identifiant, ip, userAgent]
  );
}

export async function compterTentativesRecentes(identifiant, windowMinutes) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
     FROM journal_connexions
     WHERE identifiant_saisi = $1
       AND reussie = FALSE
       AND date > NOW() - ($2 * INTERVAL '1 minute')`,
    [identifiant, windowMinutes]
  );
  return rows[0].n;
}

export async function journaliserAction({ userId, action, cible, details }) {
  const user = userId
    ? await query('SELECT ecole_id FROM users WHERE id = $1', [userId])
    : null;
  await query(
    `INSERT INTO journal_actions (ecole_id, user_id, action, cible, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [user?.rows[0]?.ecole_id ?? null, userId, action, cible, details ?? null]
  );
}