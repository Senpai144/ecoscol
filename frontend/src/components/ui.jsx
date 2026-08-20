import { useState } from 'react';

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export { JOURS };

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function Pagination({ page, pages, total, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <span>
        Page {page} / {pages} — {total} résultat{total > 1 ? 's' : ''}
      </span>
      <div>
        <button className="btn btn-ghost-dark" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Précédent</button>
        <button className="btn btn-ghost-dark" disabled={page >= pages} onClick={() => onChange(page + 1)}>Suivant →</button>
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'badge-slate',
    green: 'badge-teal',
    red: 'badge-coral',
    amber: 'badge-amber',
    blue: 'badge-ink',
  };
  return <span className={`badge ${tones[tone] || tones.slate}`}>{children}</span>;
}

export function EtatVide({ texte }) {
  return (
    <div className="etat-vide">
      <p>{texte}</p>
    </div>
  );
}

export function StatutEleveBadge({ statut }) {
  const map = {
    actif: <Badge tone="green">Actif</Badge>,
    transfere: <Badge tone="blue">Transféré</Badge>,
    exclu: <Badge tone="red">Exclu</Badge>,
    diplome: <Badge tone="amber">Diplômé</Badge>,
    archive: <Badge tone="slate">Archivé</Badge>,
  };
  return map[statut] ?? <Badge>{statut}</Badge>;
}