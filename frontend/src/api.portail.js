import { apiFetch } from './api.js';

const token = () => localStorage.getItem('ecoscol_token');

export async function getPaiementsPortail(eleveId) {
  return apiFetch(`/api/portail/paiements/${eleveId}`, { token: token() });
}

export async function payerEnLigne(data) {
  return apiFetch('/api/portail/paiements', { method: 'POST', body: data, token: token() });
}

export async function modifierPaiementPortail(paiementId, data) {
  return apiFetch(`/api/portail/paiements/${paiementId}`, { method: 'PATCH', body: data, token: token() });
}

export function telechargerDocumentPortail(nomFichier) {
  return fetch(`/api/portail/documents/${encodeURIComponent(nomFichier)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  }).then((resp) => {
    if (!resp.ok) throw new Error('Impossible de télécharger le document');
    return resp.blob();
  }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}