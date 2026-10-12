import React, { useState } from 'react';

interface EmployeeAvatarProps {
  employeeId: string;
  fullName: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Renders a resilient employee portrait avatar with Zero-Broken-Image compliance.
 * Uses clean vector portrait artwork for the 3 demo profiles and automatic initials
 * fallback if an external avatar URL is absent or fails to load.
 */
export const EmployeeAvatar: React.FC<EmployeeAvatarProps> = ({
  employeeId,
  fullName,
  avatarUrl,
  size = 'md',
}) => {
  const [imgError, setImgError] = useState(false);
  const cleanId = (employeeId || '').toUpperCase();

  const initials = (fullName || employeeId || 'EM')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const sizeClass =
    size === 'lg' ? 'emp-avatar-lg' : size === 'sm' ? 'emp-avatar-sm' : 'emp-avatar-md';

  if (avatarUrl && !imgError) {
    return (
      <div className={`emp-avatar ${sizeClass}`}>
        <img
          src={avatarUrl}
          alt={fullName || employeeId}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Distinct studio-style vector portraits for DEMO001, DEMO002, DEMO003
  if (cleanId === 'DEMO001') {
    return (
      <div className={`emp-avatar ${sizeClass} emp-avatar-demo1`} aria-label={fullName || employeeId}>
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="80" rx="18" fill="#E0E7FF" />
          <circle cx="40" cy="40" r="36" fill="url(#grad_demo1)" />
          <path
            d="M20 74C21 59 29 53 40 53C51 53 59 59 60 74"
            fill="#1E40AF"
          />
          <path d="M33 53L40 63L47 53H33Z" fill="#F8FAFC" />
          <circle cx="40" cy="33" r="13" fill="#F3D2C1" />
          <path
            d="M25 34C25 22 31 16 40 16C49 16 55 22 55 34C53 28 49 24 40 24C31 24 27 28 25 34Z"
            fill="#312E81"
          />
          <circle cx="35.5" cy="33" r="1.4" fill="#1E293B" />
          <circle cx="44.5" cy="33" r="1.4" fill="#1E293B" />
          <path
            d="M36.5 38.5C38 40 42 40 43.5 38.5"
            stroke="#9A3412"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="grad_demo1" x1="8" y1="8" x2="72" y2="72" gradientUnits="userSpaceOnUse">
              <stop stopColor="#DBEAFE" />
              <stop offset="1" stopColor="#C7D2FE" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  if (cleanId === 'DEMO002') {
    return (
      <div className={`emp-avatar ${sizeClass} emp-avatar-demo2`} aria-label={fullName || employeeId}>
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="80" rx="18" fill="#DCFCE7" />
          <circle cx="40" cy="40" r="36" fill="url(#grad_demo2)" />
          <path
            d="M19 74C20.5 58 29 52 40 52C51 52 59.5 58 61 74"
            fill="#0F172A"
          />
          <path d="M34 52L40 61L46 52H34Z" fill="#38BDF8" />
          <circle cx="40" cy="32" r="13" fill="#E8B99B" />
          <path
            d="M27 29C27 20 33 16 40 16C47 16 53 20 53 29C50 24 45 22 40 22C35 22 30 24 27 29Z"
            fill="#1E293B"
          />
          <circle cx="35.5" cy="32.5" r="1.4" fill="#0F172A" />
          <circle cx="44.5" cy="32.5" r="1.4" fill="#0F172A" />
          <path
            d="M36.5 38C38.5 39.5 41.5 39.5 43.5 38"
            stroke="#7C2D12"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="grad_demo2" x1="8" y1="8" x2="72" y2="72" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E0F2FE" />
              <stop offset="1" stopColor="#BAE6FD" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  if (cleanId === 'DEMO003') {
    return (
      <div className={`emp-avatar ${sizeClass} emp-avatar-demo3`} aria-label={fullName || employeeId}>
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="80" rx="18" fill="#F3E8FF" />
          <circle cx="40" cy="40" r="36" fill="url(#grad_demo3)" />
          <path
            d="M20 74C21.5 59 29.5 53 40 53C50.5 53 58.5 59 60 74"
            fill="#0284C7"
          />
          <circle cx="40" cy="33" r="13" fill="#DCA788" />
          <path
            d="M25 35C25 21 31 15 40 15C49 15 55 21 55 35C52 27 47 24 40 24C33 24 28 27 25 35Z"
            fill="#1E1B4B"
          />
          <circle cx="35.5" cy="33" r="1.4" fill="#0F172A" />
          <circle cx="44.5" cy="33" r="1.4" fill="#0F172A" />
          <circle cx="40" cy="29.5" r="1" fill="#BE123C" />
          <path
            d="M36.5 38.5C38.2 40 41.8 40 43.5 38.5"
            stroke="#7C2D12"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="grad_demo3" x1="8" y1="8" x2="72" y2="72" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F1F5F9" />
              <stop offset="1" stopColor="#E2E8F0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`emp-avatar ${sizeClass} emp-avatar-initials`}
      aria-label={fullName || employeeId}
    >
      <span>{initials}</span>
    </div>
  );
};
