// Centralized API configuration supporting local dev, Docker proxy, and Render cloud deployments
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim() !== '') {
    const url = import.meta.env.VITE_API_URL.trim();
    return url.startsWith('http') ? url : `https://${url}`;
  }
  
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }
    // When served via Nginx or same-origin domain
    return window.location.origin;
  }
  
  return 'http://localhost:8000';
};

export const API_BASE = getApiBase();
export const API = API_BASE;
export default API_BASE;
