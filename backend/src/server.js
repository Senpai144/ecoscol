import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import db from './db/index.js';
import logger from './services/logger.js';
import { connectCache } from './services/cache.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import structureRoutes from './routes/structureRoutes.js';
import classRoutes from './routes/classRoutes.js';
import eleveRoutes from './routes/eleveRoutes.js';
import pedagogiqueRoutes from './routes/pedagogiqueRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import bulletinRoutes from './routes/bulletinRoutes.js';
import portailRoutes from './routes/portailRoutes.js';
import vieScolaireRoutes from './routes/vieScolaireRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import etablissementsRoutes from './routes/etablissementsRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import path from 'node:path';

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
  process.exit(1);
});

const app = express();

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const requestLogger = logger.child({
    req: { method: req.method, url: req.originalUrl, ip: req.ip },
  });
  
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    requestLogger.info(
      { res: { statusCode: res.statusCode }, durationMs },
      `${req.method} ${req.originalUrl} ${res.statusCode}`
    );
  });
  
  req.log = requestLogger;
  next();
});

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT NOW() AS now, 1 AS ok');
    res.json({ status: 'ok', database: 'ok', time: rows[0].now });
  } catch (err) {
    req.log.error({ err }, 'Health check failed');
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/structure', structureRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/eleves', eleveRoutes);
app.use('/api/pedagogique', pedagogiqueRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/bulletins', bulletinRoutes);
app.use('/api/portail', portailRoutes);
app.use('/api/vie-scolaire', vieScolaireRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/etablissements', etablissementsRoutes);
app.use('/api/public', publicRoutes);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use((req, res) => {
  res.status(404).json({ error: 'Route inconnue' });
});

app.use((err, req, res, next) => {
  const log = req.log || logger;
  log.error({ err, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Connexion Redis non bloquante : l'API démarre même si Redis est absent
// (le cache se désactive proprement, toutes les requêtes passent par la DB)
connectCache().catch((err) => {
  logger.warn({ err: err.message }, 'Redis indisponible — cache désactivé, fallback DB actif');
});

// Arrêt gracieux : indispensable en cloud (Cloud Run/Railway envoient SIGTERM)
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'ECOSCOL backend started');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Arrêt gracieux démarré');
  server.close(async () => {
    try { await db.end(); } catch {}
    process.exit(0);
  });
  // Force l'arrêt si les connexions ne se ferment pas en 10s
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));