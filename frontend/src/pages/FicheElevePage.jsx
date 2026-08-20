import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getEleve, changerStatutEleve } from '../api.scolarite.js';
import { apiFetch } from '../api.js';
import { Badge, StatutEleveBadge, formatDate, EtatVide } from '../components/ui.jsx';

const API_URL = import.meta.env.VITE_API_URL;

export default function FicheElevePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [eleve, setEleve] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [generation, setGeneration] = useState(false);
  const [certificat, setCertificat] = useState(null);

  useEffect(() => {
    getEleve(id)
      .then((d) => setEleve(d.eleve))
      .catch((err) => setErreur(err.message))
      .finally(() => setChargement(false));
  }, [id]);

  async function archiver() {
    if (!window.confirm('Archiver ce dossier ? L\'élève devient non modifiable.')) return;
    try {
      await changerStatutEleve(id, 'archive');
      const d = await getEleve(id);
      setEleve(d.eleve);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function genererCertificat() {
    setGeneration(true);
    setErreur(null);
    try {
      const token = localStorage.getItem('ecoscol_token');
      const d = await apiFetch(`/api/documents/certificat-scolarite/${id}`, {
        method: 'POST',
        token,
      });
      setCertificat(d);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setGeneration(false);
    }
  }

  async function telechargerCertificat() {
    const token = localStorage.getItem('ecoscol_token');
    const res = await fetch(`${API_URL}/api/documents/documents/${certificat.fichier}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Téléchargement impossible');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = certificat.fichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (chargement) return <main className="container"><p className="status status-pending">Chargement…</p></main>;
  if (erreur) return <main className="container"><div className="alert alert-error">{erreur}</div></main>;
  if (!eleve) return <main className="container"><EtatVide texte="Élève introuvable." /></main>;

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>{eleve.prenom} {eleve.nom}</h1>
          <p>
            <Badge tone="blue">{eleve.matricule}</Badge> <StatutEleveBadge statut={eleve.statut} />
          </p>
        </div>
        <div>
          <Link to="/eleves" className="btn btn-secondary">← Liste</Link>
          <button className="btn btn-primary" onClick={genererCertificat} disabled={generation}>
            {generation ? 'Génération…' : certificat ? 'Régénérer le certificat' : 'Certificat de scolarité'}
          </button>
          {certificat && (
            <button className="btn btn-secondary" onClick={telechargerCertificat}>
              ↓ Télécharger (PDF)
            </button>
          )}
          {eleve.statut === 'actif' && (
            <button className="btn btn-danger" onClick={archiver}>Archiver le dossier</button>
          )}
        </div>
      </div>

      <div className="grid">
        <section>
          <h2>Identité</h2>
          <p><strong>Date de naissance :</strong> {formatDate(eleve.date_naissance)}</p>
          <p><strong>Sexe :</strong> {eleve.sexe === 'M' ? 'Masculin' : eleve.sexe === 'F' ? 'Féminin' : '—'}</p>
          <p><strong>Adresse :</strong> {eleve.adresse || '—'}</p>
          <p><strong>Classe :</strong> {eleve.classe_libelle || 'Non affecté'}</p>
        </section>

        <section>
          <h2>Parents / tuteurs</h2>
          {eleve.tuteurs.length === 0 ? (
            <EtatVide texte="Aucun parent enregistré." />
          ) : (
            eleve.tuteurs.map((t) => (
              <div key={t.id} className="carte-tuteur">
                <p><strong>{t.prenom || ''} {t.nom}</strong></p>
                <p>{t.telephone}</p>
                {t.email && <p>{t.email}</p>}
              </div>
            ))
          )}
        </section>
      </div>

      <section className="section">
        <h2>Historique scolaire</h2>
        {eleve.historique.length === 0 ? (
          <EtatVide texte="Aucun historique enregistré." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Année scolaire</th>
                  <th>Classe</th>
                  <th>Redoublement</th>
                </tr>
              </thead>
              <tbody>
                {eleve.historique.map((h) => (
                  <tr key={h.id}>
                    <td>{h.annee_libelle}</td>
                    <td>{h.classe_libelle || '—'}</td>
                    <td>{h.redoublement ? 'Oui' : 'Non'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}