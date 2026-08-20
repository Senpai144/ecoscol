import { apiFetch } from './api.js';

const token = () => localStorage.getItem('ecoscol_token');

export async function getGrilleTarifaire() {
  return apiFetch('/api/finances/grille', { token: token() });
}

export async function ajouterTarif(data) {
  return apiFetch('/api/finances/grille', { method: 'POST', body: data, token: token() });
}

export async function supprimerTarif(id) {
  return apiFetch(`/api/finances/grille/${id}`, { method: 'DELETE', token: token() });
}

export async function getDossiersFinanciers({ classe = '', impaye = false } = {}) {
  const params = new URLSearchParams();
  if (classe) params.set('classe_id', classe);
  if (impaye) params.set('impaye', '1');
  const qs = params.toString();
  return apiFetch(`/api/finances/dossiers${qs ? `?${qs}` : ''}`, { token: token() });
}

export async function getDossierEleve(id) {
  return apiFetch(`/api/finances/eleves/${id}`, { token: token() });
}

export async function ajouterEcheancier(data) {
  return apiFetch('/api/finances/echeanciers', { method: 'POST', body: data, token: token() });
}

export async function supprimerEcheancier(id) {
  return apiFetch(`/api/finances/echeanciers/${id}`, { method: 'DELETE', token: token() });
}

export async function enregistrerPaiement(data) {
  return apiFetch('/api/finances/paiements', { method: 'POST', body: data, token: token() });
}

export async function annulerPaiement(id, motif) {
  return apiFetch(`/api/finances/paiements/${id}/annuler`, { method: 'POST', body: { motif }, token: token() });
}

export async function genererRecuPDF(paiementId) {
  return apiFetch(`/api/finances/paiements/${paiementId}/recu`, { method: 'POST', token: token() });
}

export async function getPaiements(filtres = {}) {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) params.set(k, v);
  });
  const qs = params.toString();
  return apiFetch(`/api/finances/paiements${qs ? `?${qs}` : ''}`, { token: token() });
}