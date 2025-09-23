// src/utils/serverLogout.js
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');

export async function serverLogout() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    await axios.post(`${API_BASE}/auth/logout`, null, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: false, // set true only if you use cookie sessions
    });
  } catch {
    // ignore network errors; client-side clear still proceeds
  }
}