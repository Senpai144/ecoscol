const API_URL = import.meta.env.VITE_API_URL;

const TOKEN_KEY = 'ecoscol_token';
const USER_KEY = 'ecoscol_user';

export async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error || `Erreur ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Serveur injoignable — vérifiez votre connexion');
    }
    throw err;
  }
}

export function sauvegarderSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function recupererSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
}

export function effacerSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function seConnecter(identifiant, motDePasse) {
  const data = await apiFetch('/api/auth/login', { method: 'POST', body: { identifiant, mot_de_passe: motDePasse } });
  sauvegarderSession({ token: data.token, user: data.user });
  return data.user;
}

export async function getParametresEcole(token) {
  return apiFetch('/api/etablissements/moi', { token });
}

export async function updateParametresEcole(data, token) {
  return apiFetch('/api/etablissements/moi', { method: 'PATCH', body: data, token });
}

export async function uploadLogoEtablissement(formData, token) {
  return apiFetch('/api/etablissements/moi/logo', { method: 'POST', body: formData, token });
}

export async function getEtablissementPublic(domaine) {
  return apiFetch(`/api/public/etablissement?domaine=${encodeURIComponent(domaine)}`);
}

export async function verifierSousDomaine(nom) {
  return apiFetch(`/api/etablissements/verifier-sous-domaine?nom=${encodeURIComponent(nom)}`);
}

export async function creerEtablissement(data) {
  return apiFetch('/api/etablissements', { method: 'POST', body: data });
}

export async function seDeconnecter(token) {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST', token });
  } catch {
    // même hors ligne, la session locale est supprimée
  }
  effacerSession();
}