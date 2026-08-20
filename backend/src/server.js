import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import db from './db/index.js';
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

const app = express();

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT NOW() AS now, 1 AS ok');
    res.json({ status: 'ok', database: 'ok', time: rows[0].now });
  } catch (err) {
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

app.use((req, res) => {
  res.status(404).json({ error: 'Route inconnue' });
});

app.use((err, req, res, next) => {
  console.error('[api] Erreur non gérée:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

app.listen(config.port, () => {
  console.log(`[api] ECOSCOL backend démarré en mode ${config.env} sur le port ${config.port}`);
});