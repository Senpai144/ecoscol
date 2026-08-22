-- =============================================================
-- ECOSCOL — Migration 002: Index de performance pour scalabilité
-- Ajoute les index composites critiques pour requêtes multi-tenant
-- =============================================================

-- Eleves : filtres fréquents (classe + statut + recherche nom)
CREATE INDEX IF NOT EXISTS idx_eleves_ecole_classe_statut 
  ON eleves (ecole_id, classe_id, statut);

CREATE INDEX IF NOT EXISTS idx_eleves_ecole_nom_prenom 
  ON eleves (ecole_id, nom, prenom);

-- Notes : bulletins, moyennes par séquence/matière
CREATE INDEX IF NOT EXISTS idx_notes_ecole_sequence_matiere 
  ON notes (eleve_id, sequence_id, matiere_id); -- eleve_id a ecole_id via JOIN

-- Alternative plus directe pour notes par séquence (via JOIN eleves)
-- On utilise une vue matérialisée ou index partiel si besoin

-- Paiements : rapports financiers par date/état
CREATE INDEX IF NOT EXISTS idx_paiements_ecole_date_annule 
  ON paiements (ecole_id, date_paiement DESC, recu_annule);

-- Absences : rapports vie scolaire
CREATE INDEX IF NOT EXISTS idx_absences_ecole_date_type 
  ON absences (ecole_id, date DESC, type);

-- Emplois du temps : affichage par classe/jour
CREATE INDEX IF NOT EXISTS idx_emplois_ecole_classe_jour 
  ON emplois_du_temps (ecole_id, classe_id, jour_semaine);

-- Echeanciers : dossiers élèves
CREATE INDEX IF NOT EXISTS idx_echeanciers_ecole_eleve 
  ON echeanciers (eleve_id, annee_scolaire_id); -- eleve_id a ecole_id

-- Documents générés : recherche par type/élève
CREATE INDEX IF NOT EXISTS idx_documents_ecole_type_eleve 
  ON documents_generes (ecole_id, type, eleve_id);

-- Journal actions : audit trail
CREATE INDEX IF NOT EXISTS idx_journal_actions_ecole_date 
  ON journal_actions (ecole_id, date DESC);

-- Notifications : lecture non lues par user
CREATE INDEX IF NOT EXISTS idx_notifications_user_lu 
  ON notifications (user_id, lu, date DESC);

-- Creneaux horaires pour vérif chevauchement EDT
CREATE INDEX IF NOT EXISTS idx_emplois_chevauchement 
  ON emplois_du_temps (ecole_id, classe_id, jour_semaine, heure_debut, heure_fin);

-- Users : login déjà indexé (unique ecole_id, identifiant)
-- Ecoles : sous_domaine déjà indexé (unique)