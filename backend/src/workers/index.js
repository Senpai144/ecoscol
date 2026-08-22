import { Worker } from 'bullmq';
import config from '../config/index.js';
import logger from '../services/logger.js';
import db from '../db/index.js';
import { genererRecu, genererBulletin, cheminDocument } from '../services/pdfService.js';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
};

const concurrency = config.queue.concurrency;

// ---- Worker documents (génération PDF asynchrone) ----
const documentsWorker = new Worker(
  'documents',
  async (job) => {
    const { type } = job.data;
    logger.info({ jobId: job.id, type }, 'Génération document démarrée');

    if (type === 'recu') {
      const { ecoleId, paiementId } = job.data;
      const { rows: ecoles } = await db.query('SELECT * FROM ecoles WHERE id = $1', [ecoleId]);
      const { rows: paiements } = await db.query(
        `SELECT p.*, e.prenom AS eleve_prenom, e.nom AS eleve_nom, e.matricule,
                c.libelle AS classe_libelle, ec.libelle AS echeancier_libelle,
                u.nom AS saisie_par_nom
         FROM paiements p
         JOIN eleves e ON e.id = p.eleve_id
         LEFT JOIN classes c ON c.id = e.classe_id
         LEFT JOIN echeanciers ec ON ec.id = p.echeancier_id
         LEFT JOIN users u ON u.id = p.saisi_par
         WHERE p.id = $1`,
        [paiementId]
      );
      if (ecoles.length === 0 || paiements.length === 0) throw new Error('Données introuvables');
      const resultat = await genererRecu({
        ecole: ecoles[0],
        eleve: { prenom: paiements[0].eleve_prenom, nom: paiements[0].eleve_nom, matricule: paiements[0].matricule },
        classe: { libelle: paiements[0].classe_libelle },
        paiement: paiements[0],
        echeancier: { libelle: paiements[0].echeancier_libelle },
      });
      return { fichier: resultat.nomFichier };
    }

    if (type === 'bulletin') {
      const { payload } = job.data;
      const resultat = await genererBulletin(payload);
      return { fichier: resultat.nomFichier, identifiant: resultat.identifiant };
    }

    throw new Error(`Type de document inconnu : ${type}`);
  },
  { connection, concurrency }
);

documentsWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, fichier: result?.fichier }, 'Document généré');
});

documentsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message, attempts: job?.attemptsMade }, 'Génération document échouée');
});

// ---- Worker notifications (insertion en masse non bloquante pour l'API) ----
const notificationsWorker = new Worker(
  'notifications',
  async (job) => {
    const { ecole_id, user_id, type, message } = job.data;
    await db.query(
      'INSERT INTO notifications (ecole_id, user_id, type, message) VALUES ($1, $2, $3, $4)',
      [ecole_id, user_id, type, message]
    );
  },
  { connection, concurrency: concurrency * 2 }
);

notificationsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Notification échouée');
});

logger.info({ concurrency }, 'Workers ECOSCOL démarrés (documents, notifications)');

process.on('SIGTERM', async () => {
  logger.info('Arrêt des workers...');
  await Promise.all([documentsWorker.close(), notificationsWorker.close()]);
  process.exit(0);
});
