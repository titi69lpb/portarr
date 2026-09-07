'use client';

export function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <button
      onClick={handleLogout}
      className="rounded text-sm font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen"
    >
      Déconnexion
    </button>
  );
}
