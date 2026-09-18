import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { AppSidebar } from '@/components/AppSidebar';

export function AppSidebarServer() {
  const config = loadConfig(process.env, getDb());
  return <AppSidebar shortcuts={config.shortcuts} filesEnabled={config.filesRootPath !== null} />;
}
