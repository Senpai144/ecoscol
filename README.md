# ECOSCOL — Plateforme web de gestion scolaire (6ème à Terminale)

Application web SaaS de gestion administrative, pédagogique, disciplinaire et
financière pour collèges et lycées. Voir `cahier_des_charges_ecoscol_web.docx`
pour les spécifications complètes (règles métier BR-01 à BR-10, section 22).

## Architecture

```
Navigateur ──HTTPS──▶ Frontend (React + Vite)
                          │  API REST (JSON)
                          ▼
                     Backend (Node.js + Express) ──▶ PostgreSQL
                          ▼
                Documents PDF générés (bulletins, reçus, certificats)
```

Le frontend communique **uniquement** avec l'API REST. Aucun accès direct à la
base de données depuis le navigateur.

## Structure du monorepo

```
ecoscol/
├── backend/          API REST (Node.js + Express)
│   ├── src/
│   ├── scripts/      migrations et jeu de données
│   └── tests/        tests unitaires et d'intégration
├── frontend/         Interface React (responsive mobile → desktop)
├── cloud/            scripts de déploiement et sauvegarde
├── docker-compose.yml
└── .env.example
```

## Démarrage rapide (sans Docker)

Prérequis : Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
# 1. Base de données
createdb ecoscol

# 2. Backend
cp backend/.env.example backend/.env   # adapter DB_PASSWORD
cd backend && npm install && npm run migrate && npm run dev

# 3. Frontend
cp frontend/.env.example frontend/.env
cd frontend && npm install && npm run dev
```

Ouvrir http://localhost:5173 — l'accueil affiche l'état de l'API (`/api/health`).

## Démarrage avec Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

## Phases de développement

Phase | Contenu
------|--------
0 | Fondations : monorepo, Docker, PostgreSQL, schéma de données
1 | Authentification, rôles et permissions (JWT, bcrypt)
2 | Scolarité : classes, élèves, inscriptions, emplois du temps
3 | Notes et bulletins PDF (moyennes, rangs, mentions)
4 | Surveillance et discipline (appel, sanctions, assiduité)
5 | Comptabilité et finances (paiements, reçus, impayés)
6 | Portail parents et paiement en ligne
7 | Tableaux de bord, sauvegarde, connectivité, recherche
8 | Tests, documentation, recette des critères d'acceptation
9 | Déploiement HTTPS et mise en service de l'école pilote
10 | Commercialisation SaaS et offre licence/maintenance