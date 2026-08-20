import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getEleves, getNiveaux, getAnneesScolaires, getClasses } from '../api.scolarite.js';
import { Pagination, Badge, EtatVide, StatutEleveBadge } from '../components/ui.jsx';

export default function ElevesPage() {
  const [q, setQ] = useState('');
  const [classe, setClasse] = useState('');
  const [statut, setStatut] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [niveaux, setNiveaux] = useState([]);
  const [annees, setAnnees] = useState([]);
  const [classes, setClasses] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const navigate = useNavigate();

  async function charger(params) {
    setChargement(true);
    setErreur(null);
    try {
      const d = await getEleves(params);
      setData(d);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    getNiveaux().then((d) => setNiveaux(d.niveaux || []));
    getAnneesScolaires().then((d) => setAnnees(d.anneesScolaires || []));
    getClasses().then((d) => setClasses(d.classes || []));
    charger({ page: 1 });
  }, []);

  function filtrer(e) {
    e.preventDefault();
    setPage(1);
    charger({ q, classe, statut, page: 1 });
  }

  function changerPage(p) {
    setPage(p);
    charger({ q, classe, statut, page: p });
  }

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1>Élèves</h1>
          <p>Inscription, dossiers et gestion des élèves</p>
        </div>
        <Link to="/eleves/inscription" className="btn btn-primary">+ Inscrire un élève</Link>
      </div>

      <form className="filtres" onSubmit={filtrer}>
        <input
          type="search"
          placeholder="Rechercher par nom, prénom ou matricule…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={classe} onChange={(e) => setClasse(e.target.value)}>
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="transfere">Transféré</option>
          <option value="exclu">Exclu</option>
          <option value="diplome">Diplômé</option>
          <option value="archive">Archivé</option>
        </select>
        <button className="btn btn-secondary" type="submit">Filtrer</button>
      </form>

      {chargement && <p className="status status-pending">Chargement…</p>}
      {erreur && <div className="alert alert-error">{erreur}</div>}

      {data && !chargement && (
        <>
          {data.eleves.length === 0 ? (
            <EtatVide texte="Aucun élève trouvé. Vérifiez vos filtres ou inscrivez un nouvel élève." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Matricule</th>
                    <th>Nom</th>
                    <th>Prénom</th>
                    <th>Classe</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.eleves.map((e) => (
                    <tr key={e.id} onClick={() => navigate(`/eleves/${e.id}`)}>
                      <td><Badge tone="blue">{e.matricule}</Badge></td>
                      <td>{e.nom}</td>
                      <td>{e.prenom}</td>
                      <td>{e.classe_libelle || '—'}</td>
                      <td><StatutEleveBadge statut={e.statut} /></td>
                      <td>
                        <Link to={`/eleves/${e.id}`} className="btn btn-small">Voir</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={data.pagination.page}
            pages={data.pagination.pages}
            total={data.pagination.total}
            onChange={changerPage}
          />
        </>
      )}
    </main>
  );
}