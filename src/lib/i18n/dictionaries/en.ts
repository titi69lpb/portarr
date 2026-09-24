import type { fr } from './fr';

type Dictionary<T> = { [K in keyof T]: T[K] extends string ? string : Dictionary<T[K]> };

export const en: Dictionary<typeof fr> = {
  common: {
    language: 'Language',
    french: 'French',
    english: 'English',
    close: 'Close',
    loading: 'Loading…',
    previous: 'Previous',
    next: 'Next',
    pageOf: 'Page {{page}} of {{total}}',
  },
  nav: {
    portal: 'Portal',
    history: 'History',
    files: 'Files',
    profile: 'Profile',
    logout: 'Log out',
  },
};
