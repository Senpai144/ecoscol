import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { inscrireEleve, getClasses, getNiveaux, getAnneesScolaires } from '../api.scolarite.js';

export default function InscriptionPage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [succes, setSucces] = useState(null);

  const [form, setForm] = useState({
    nom: '', prenom: '', date_naissance: '', sexe: '', adresse: '',
    classe_id: '',
    tuteur_nom: '', tuteur_prenom: '', tuteur_telephone: '', tuteur_email: '',
  });

  useEffect(() => {
    getClasses().then((d) => setClasses(d.classes || []));
  }, []);

  function set(champ) {
    return (e) => setForm({ ...form, [champ]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);

    if (!form.nom.trim() || !form.prenom.trim()) {
      setErreur('Le nom et le prénom sont obligatoires.');
      return;
    }
    if (!form.classe_id) {
      setErreur('Choisissez une classe.');
      return;
    }
    if (form.tuteur_telephone && !/^[+0-9 ]{9,20}$/.test(form.tuteur_telephone.trim())) {
      setErreur('Numéro de téléphone du parent invalide.');
      return;
    }

    setChargement(true);
    try {
      const body = {
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        date_naissance: form.date_naissance || undefined,
        sexe: form.sexe || undefined,
        adresse: form.adresse || undefined,
        classe_id: parseInt(form.classe_id, 10),
        tuteurs: form.tuteur_telephone ? [{
          nom: form.tuteur_nom.trim() || 'Parent',
          prenom: form.tuteur_prenom.trim() || undefined,
          telephone: form.tuteur_telephone.trim(),
          email: form.tuteur_email.trim() || undefined,
        }] : [],
      };
      const result = await inscrireEleve(body);
      setSucces(`Élève inscrit avec succès — matricule ${result.eleve.matricule}`);
      setTimeout(() => navigate(`/eleves/${result.eleve.id}`), 1500);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Inscrire un élève</h1>
          <p>Le matricule est généré automatiquement et ne peut pas être modifié.</p>
        </div>
        <Link to="/eleves" className="btn btn-secondary">← Retour</Link>
      </div>

      {erreur && <div className="alert alert-error">{erreur}</div>}
      {succes && <div className="alert alert-ok">{succes}</div>}

      <form className="formulaire" onSubmit={handleSubmit} noValidate>
        <fieldset>
          <legend>Identité de l'élève</legend>
          <div className="form-grid">
            <label>
              Nom de famille *
              <input type="text" value={form.nom} onChange={set('nom')} />
            </label>
            <label>
              Prénom *
              <input type="text" value={form.prenom} onChange={set('prenom')} />
            </label>
            <label>
              Date de naissance
              <input type="date" value={form.date_naissance} onChange={set('date_naissance')} />
            </label>
            <label>
              Sexe
              <select value={form.sexe} onChange={set('sexe')}>
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </label>
            <label>
              Adresse
              <input type="text" value={form.adresse} onChange={set('adresse')} />
            </label>
            <label>
              Classe *
              <select value={form.classe_id} onChange={set('classe_id')}>
                <option value="">— Choisir —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle} {c.serie_libelle || ''} — {c.niveau_libelle} ({c.effectif}/{c.capacite})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Parent / tuteur (facultatif)</legend>
          <div className="form-grid">
            <label>
              Nom
              <input type="text" value={form.tuteur_nom} onChange={set('tuteur_nom')} />
            </label>
            <label>
              Prénom
              <input type="text" value={form.tuteur_prenom} onChange={set('tuteur_prenom')} />
            </label>
            <label>
              Téléphone
              <input type="tel" value={form.tuteur_telephone} onChange={set('tuteur_telephone')} placeholder="+221…" />
            </label>
            <label>
              Email
              <input type="email" value={form.tuteur_email} onChange={set('tuteur_email')} />
            </label>
          </div>
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={chargement}>
          {chargement ? 'Inscription en cours…' : "Inscrire l'élève"}
        </button>
      </form>
    </main>
  );
}