import db from '../db/index.js';

// Notification au(x) parent(s) connecté(s) d'un élève (compte lié via tuteur)
export async function notifierParents(eleveId, ecoleId, type, message) {
  const { rows } = await db.query(
    `SELECT t.user_id
     FROM eleve_tuteurs et
     JOIN tuteurs t ON t.id = et.tuteur_id
     WHERE et.eleve_id = $1 AND t.ecole_id = $2 AND t.user_id IS NOT NULL`,
    [eleveId, ecoleId]
  );
  for (const r of rows) {
    await db.query(
      'INSERT INTO notifications (ecole_id, user_id, type, message) VALUES ($1, $2, $3, $4)',
      [ecoleId, r.user_id, type, message]
    );
  }
}