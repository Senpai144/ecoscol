import { apiFetch } from './api.js';

const token = () => localStorage.getItem('ecoscol_token');

export async function getClasses({ page = 1, limit = 50 } = {}) {
  const d = await apiFetch(`/api/classes?page=${page}&limit=${limit}`, { token: token() });
  return d;
}

export async function creerClasse(data) {
  return apiFetch('/api/classes', { method: 'POST', body: data, token: token() });
}

export async function getEleves({ q = '', classe = '', statut = '', page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (classe) params.set('classe', classe);
  if (statut) params.set('statut', statut);
  params.set('page', page);
  params.set('limit', limit);
  const d = await apiFetch(`/api/eleves?${params.toString()}`, { token: token() });
  return d;
}

export async function getEleve(id) {
  return apiFetch(`/api/eleves/${id}`, { token: token() });
}

export async function inscrireEleve(data) {
  return apiFetch('/api/eleves', { method: 'POST', body: data, token: token() });
}

export async function modifierEleve(id, data) {
  return apiFetch(`/api/eleves/${id}`, { method: 'PATCH', body: data, token: token() });
}

export async function changerStatutEleve(id, statut) {
  return apiFetch(`/api/eleves/${id}/statut`, { method: 'PATCH', body: { statut }, token: token() });
}

export async function getNiveaux() {
  return apiFetch('/api/structure/niveaux', { token: token() });
}

export async function getSeries() {
  return apiFetch('/api/structure/series', { token: token() });
}

export async function getAnneesScolaires() {
  return apiFetch('/api/structure/annees-scolaires', { token: token() });
}

export async function getMatieres() {
  return apiFetch('/api/pedagogique/matieres', { token: token() });
}

export async function getEnseignants() {
  return apiFetch('/api/pedagogique/enseignants', { token: token() });
}

export async function affecterEnseignant(data) {
  return apiFetch('/api/pedagogique/enseignements', { method: 'POST', body: data, token: token() });
}