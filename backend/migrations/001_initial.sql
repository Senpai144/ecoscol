-- =============================================================
-- ECOSCOL — Migration 001: schéma initial
-- Cf. cahier des charges section 14 (modèle de données)
-- =============================================================

-- Établissements (préparation SaaS multi-établissements)
CREATE TABLE ecoles (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  logo_path TEXT,
  cachet_path TEXT,
  signature_path TEXT,
  slogan TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rôles (unique ou multiple par utilisateur)
CREATE TABLE roles (
  code TEXT PRIMARY KEY,
  libelle TEXT NOT NULL
);

INSERT INTO roles (code, libelle) VALUES
  ('ADMIN',       'Administrateur système'),
  ('SECRETARIAT', 'Secrétariat / Scolarité'),
  ('CENSEUR',     'Censeur / Direction pédagogique'),
  ('ENSEIGNANT',  'Enseignant'),
  ('SURVEILLANT', 'Surveillant'),
  ('COMPTABLE',   'Comptable'),
  ('PARENT',      'Parent / Tuteur');

-- Utilisateurs (mot de passe haché, jamais en clair)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT,
  identifiant TEXT NOT NULL,
  mot_de_passe_hash TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'desactive')),
  dernier_acces TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ecole_id, identifiant)
);

-- Rôles par utilisateur (plusieurs rôles possibles par compte)
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL REFERENCES roles(code),
  PRIMARY KEY (user_id, role_code)
);

-- Années scolaires
CREATE TABLE annees_scolaires (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (ecole_id, libelle)
);

-- Niveaux (6ème à Terminale) et séries (lycée: A, C, D...)
CREATE TABLE niveaux (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  ordre INTEGER NOT NULL,
  UNIQUE (ecole_id, libelle)
);

CREATE TABLE series (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  UNIQUE (ecole_id, libelle)
);

-- Matières (coefficient par série/niveau)
CREATE TABLE matieres (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  code TEXT,
  UNIQUE (ecole_id, nom)
);

-- Coefficients par matière / niveau / série / année scolaire
CREATE TABLE coefficients (
  id BIGSERIAL PRIMARY KEY,
  matiere_id BIGINT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
  annee_scolaire_id BIGINT NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
  niveau_id BIGINT REFERENCES niveaux(id) ON DELETE CASCADE,
  serie_id BIGINT REFERENCES series(id) ON DELETE CASCADE,
  coefficient NUMERIC(5,2) NOT NULL DEFAULT 1,
  UNIQUE (matiere_id, annee_scolaire_id, niveau_id, serie_id)
);

-- Classes
CREATE TABLE classes (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  annee_scolaire_id BIGINT NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
  niveau_id BIGINT NOT NULL REFERENCES niveaux(id) ON DELETE CASCADE,
  serie_id BIGINT REFERENCES series(id),
  libelle TEXT NOT NULL,
  capacite INTEGER NOT NULL DEFAULT 40,
  salle TEXT,
  UNIQUE (ecole_id, annee_scolaire_id, libelle)
);

-- Enseignants (liés à un compte utilisateur)
CREATE TABLE enseignants (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);

-- Affectation: un enseignant enseigne une matière dans une classe
CREATE TABLE enseignements (
  id BIGSERIAL PRIMARY KEY,
  enseignant_id BIGINT NOT NULL REFERENCES enseignants(id) ON DELETE CASCADE,
  classe_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  matiere_id BIGINT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
  UNIQUE (enseignant_id, classe_id, matiere_id)
);

-- Élèves (matricule unique, généré automatiquement - BR-01)
CREATE TABLE eleves (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  matricule TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  date_naissance DATE,
  sexe TEXT CHECK (sexe IN ('M', 'F')),
  photo_path TEXT,
  adresse TEXT,
  classe_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'transfere', 'exclu', 'diplome', 'archive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historique scolaire (classes précédentes, redoublements)
CREATE TABLE historique_scolaire (
  id BIGSERIAL PRIMARY KEY,
  eleve_id BIGINT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  annee_scolaire_id BIGINT NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
  classe_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
  redoublement BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT
);

-- Parents / tuteurs
CREATE TABLE tuteurs (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT,
  telephone TEXT NOT NULL,
  adresse TEXT,
  email TEXT
);

-- Lien parent ↔ élève (un parent peut avoir plusieurs enfants)
CREATE TABLE eleve_tuteurs (
  eleve_id BIGINT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  tuteur_id BIGINT NOT NULL REFERENCES tuteurs(id) ON DELETE CASCADE,
  PRIMARY KEY (eleve_id, tuteur_id)
);

-- Séquences / trimestres
CREATE TABLE sequences (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  annee_scolaire_id BIGINT NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  ordre INTEGER NOT NULL,
  date_debut DATE,
  date_fin DATE,
  validee BOOLEAN NOT NULL DEFAULT FALSE,
  validee_par BIGINT REFERENCES users(id),
  validee_le TIMESTAMPTZ,
  UNIQUE (ecole_id, annee_scolaire_id, ordre)
);

-- Notes (verrouillage après validation censeur - BR-03/BR-10)
CREATE TABLE notes (
  id BIGSERIAL PRIMARY KEY,
  eleve_id BIGINT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  matiere_id BIGINT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
  sequence_id BIGINT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  enseignant_id BIGINT REFERENCES enseignants(id) ON DELETE SET NULL,
  valeur NUMERIC(4,2) NOT NULL CHECK (valeur >= 0 AND valeur <= 20),
  coefficient NUMERIC(5,2) NOT NULL DEFAULT 1,
  verrouillee BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (eleve_id, matiere_id, sequence_id)
);

-- Absences / retards (justification obligatoire - BR-08)
CREATE TABLE absences (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  eleve_id BIGINT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('absence', 'retard')),
  justifiee BOOLEAN NOT NULL DEFAULT FALSE,
  justificatif_path TEXT,
  justificatif_note TEXT,
  saisi_par BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sanctions
CREATE TABLE sanctions (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  eleve_id BIGINT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  motif TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('avertissement', 'blame', 'exclusion', 'conseil_discipline')),
  date DATE NOT NULL,
  saisi_par BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cahier de texte numérique
CREATE TABLE cahiers_texte (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  enseignant_id BIGINT NOT NULL REFERENCES enseignants(id) ON DELETE CASCADE,
  classe_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  matiere_id BIGINT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
  date_cours DATE NOT NULL,
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Emploi du temps (sans chevauchement horaire)
CREATE TABLE emplois_du_temps (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  classe_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  enseignant_id BIGINT NOT NULL REFERENCES enseignants(id) ON DELETE CASCADE,
  matiere_id BIGINT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
  jour_semaine SMALLINT NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  CHECK (heure_fin > heure_debut)
);

-- Comptabilité
CREATE TABLE grille_tarifaire (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  annee_scolaire_id BIGINT NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
  niveau_id BIGINT REFERENCES niveaux(id) ON DELETE CASCADE,
  serie_id BIGINT REFERENCES series(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  montant NUMERIC(12,2) NOT NULL CHECK (montant >= 0)
);

-- Échéancier de paiement par élève
CREATE TABLE echeanciers (
  id BIGSERIAL PRIMARY KEY,
  eleve_id BIGINT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  annee_scolaire_id BIGINT NOT NULL REFERENCES annees_scolaires(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  montant_du NUMERIC(12,2) NOT NULL CHECK (montant_du > 0),
  date_echeance DATE NOT NULL,
  solde NUMERIC(12,2) NOT NULL DEFAULT 0,  -- BR-06: recalculé à chaque paiement
  UNIQUE (eleve_id, annee_scolaire_id, libelle)
);

-- Paiements (reçu unique et séquentiel - BR-04, non modifiable - BR-05)
CREATE TABLE paiements (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  eleve_id BIGINT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  echeancier_id BIGINT REFERENCES echeanciers(id) ON DELETE SET NULL,
  montant NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  motif TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('especes', 'cheque', 'mobile_money', 'virement')),
  numero_recu TEXT NOT NULL UNIQUE,
  recu_annule BOOLEAN NOT NULL DEFAULT FALSE,
  recu_annule_le TIMESTAMPTZ,
  recu_annule_par BIGINT REFERENCES users(id),
  transaction_ref TEXT,
  date_paiement DATE NOT NULL DEFAULT CURRENT_DATE,
  saisi_par BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents générés (bulletin, reçu, certificat - archivés, réimprimables)
CREATE TABLE documents_generes (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bulletin', 'recu', 'certificat_scolarite', 'attestation')),
  identifiant_unique TEXT NOT NULL UNIQUE,
  eleve_id BIGINT REFERENCES eleves(id) ON DELETE SET NULL,
  sequence_id BIGINT REFERENCES sequences(id) ON DELETE SET NULL,
  paiement_id BIGINT REFERENCES paiements(id) ON DELETE SET NULL,
  chemin_fichier TEXT NOT NULL,
  date_generation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  genere_par BIGINT REFERENCES users(id)
);

-- Journal des actions sensibles (BR-09) et des connexions
CREATE TABLE journal_actions (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  cible TEXT,
  details JSONB,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE journal_connexions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  identifiant_saisi TEXT,
  reussie BOOLEAN NOT NULL,
  ip TEXT,
  user_agent TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications internes
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  ecole_id BIGINT NOT NULL REFERENCES ecoles(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT FALSE,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les recherches fréquentes
CREATE INDEX idx_eleves_nom ON eleves (nom);
CREATE INDEX idx_eleves_classe ON eleves (classe_id);
CREATE INDEX idx_notes_eleve ON notes (eleve_id);
CREATE INDEX idx_notes_sequence ON notes (sequence_id);
CREATE INDEX idx_absences_eleve ON absences (eleve_id);
CREATE INDEX idx_absences_date ON absences (date);
CREATE INDEX idx_paiements_eleve ON paiements (eleve_id);
CREATE INDEX idx_paiements_date ON paiements (date_paiement);
CREATE INDEX idx_echeanciers_eleve ON echeanciers (eleve_id);
CREATE INDEX idx_journal_actions_date ON journal_actions (date);
CREATE INDEX idx_journal_actions_user ON journal_actions (user_id);
CREATE INDEX idx_journal_connexions_date ON journal_connexions (date);