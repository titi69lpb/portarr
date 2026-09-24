import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { AppSidebar } from '@/components/AppSidebar';
import type { Locale } from '@/lib/i18n/dictionaries';

export function AppSidebarServer({ locale }: { locale: Locale }) {
  const config = loadConfig(process.env, getDb());
  return <AppSidebar shortcuts={config.shortcuts} filesEnabled={config.filesRootPath !== null} locale={locale} />;
}
