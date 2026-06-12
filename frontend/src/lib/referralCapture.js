// Referral code capture from URL and storage
const COOKIE_NAME = 'pb_ref_code';
const STORAGE_KEY = 'pb_referral_code';
const COOKIE_DAYS = 30;

const setCookie = (name, value, days) => {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
};

// Capture referral code from URL and store it
export const captureReferralCode = () => {
  if (typeof window === 'undefined') return null;
  
  const url = new URL(window.location.href);
  const code = url.searchParams.get('ref');
  
  if (code && /^[A-Z0-9]{4,12}$/i.test(code)) {
    const normalizedCode = code.toUpperCase();
    
    // Store in cookie (30 days) and localStorage (fallback)
    setCookie(COOKIE_NAME, normalizedCode, COOKIE_DAYS);
    localStorage.setItem(STORAGE_KEY, normalizedCode);
    
    // Remove from URL without reloading
    url.searchParams.delete('ref');
    const newUrl = url.toString();
    window.history.replaceState({}, document.title, newUrl);
    
    return normalizedCode;
  }
  
  return null;
};

// Get stored referral code (cookie first, then localStorage)
export const getStoredReferralCode = () => {
  if (typeof window === 'undefined') return null;
  
  return getCookie(COOKIE_NAME) || localStorage.getItem(STORAGE_KEY) || null;
};

// Clear stored referral code
export const clearStoredReferralCode = () => {
  if (typeof window === 'undefined') return;
  
  deleteCookie(COOKIE_NAME);
  localStorage.removeItem(STORAGE_KEY);
};

// Check if we should show referral input (within 7 days, no trades)
export const shouldShowReferralInput = (user) => {
  if (!user) return false;
  if (user.referralCodeUsed) return false;
  
  const daysSinceCreation = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceCreation <= 7;
};
