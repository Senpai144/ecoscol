import { Queue } from 'bullmq';
import config from '../config/index.js';
import logger from './logger.js';

export const QUEUE_NAMES = {
  DOCUMENTS: 'documents',
  NOTIFICATIONS: 'notifications',
};

let connection = null;

function getConnection() {
  if (!connection) {
    connection = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    };
  }
  return connection;
}

const queues = new Map();

function getQueue(name) {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: getConnection(),
        defaultJobOptions: config.queue.defaultJobOptions,
      })
    );
  }
  return queues.get(name);
}

/**
 * Ajoute un job de génération de document PDF en arrière-plan.
 * L'API répond immédiatement ; le worker génère le fichier et met à jour
 * documents_generes. Le client peut ensuite télécharger le document.
 */
export async function ajouterJobDocument(payload) {
  const queue = getQueue(QUEUE_NAMES.DOCUMENTS);
  const job = await queue.add('generer-document', payload, {
    priority: payload.priority ?? 10,
  });
  logger.info({ jobId: job.id, type: payload.type }, 'Job document enqueued');
  return job.id;
}

/**
 * Ajoute un job d'envoi de notifications (parents d'une classe entière,
 * emails en masse...). Chaque notification est un job indépendant.
 */
export async function ajouterJobsNotifications(notifications) {
  const queue = getQueue(QUEUE_NAMES.NOTIFICATIONS);
  const jobs = await queue.addBulk(
    notifications.map((n) => ({ name: 'notifier', data: n }))
  );
  logger.info({ count: jobs.length }, 'Jobs notifications enqueued');
  return jobs.map((j) => j.id);
}

export async function fermerQueues() {
  for (const q of queues.values()) {
    await q.close();
  }
  queues.clear();
}
