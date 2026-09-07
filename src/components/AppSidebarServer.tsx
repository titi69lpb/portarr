import { loadConfig } from '@/lib/config';
import { AppSidebar } from '@/components/AppSidebar';

export function AppSidebarServer() {
  const config = loadConfig();
  return <AppSidebar shortcuts={config.shortcuts} filesEnabled={config.filesRootPath !== null} />;
}
