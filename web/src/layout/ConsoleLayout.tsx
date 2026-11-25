import AppLayout from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup, { type BreadcrumbGroupProps } from '@cloudscape-design/components/breadcrumb-group';
import Flashbar from '@cloudscape-design/components/flashbar';
import SideNavigation, { type SideNavigationProps } from '@cloudscape-design/components/side-navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FidelityPanel } from '../pages/emulator/FidelityPanel';
import { FidelityBadge } from '../pages/emulator/FidelityBadge';
import { useFidelity } from './fidelity';
import { useNotifications } from './notifications';
import { CATEGORIES, type ServiceEntry } from './services';
import { useServiceDirectory } from './serviceDirectory';
import { TopBar } from './TopBar';

interface PageChrome {
  setBreadcrumbs: (items: BreadcrumbGroupProps.Item[]) => void;
}

const PageChromeContext = createContext<PageChrome | null>(null);

/** Cada página declara suas breadcrumbs, como no console da AWS. */
export function useBreadcrumbs(items: BreadcrumbGroupProps.Item[]): void {
  const chrome = useContext(PageChromeContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    chrome?.setBreadcrumbs(JSON.parse(key) as BreadcrumbGroupProps.Item[]);
  }, [chrome, key]);
}

/** Navegação interna sem recarregar a página (links do Cloudscape usam href). */
export function useFollow() {
  const navigate = useNavigate();
  return (event: CustomEvent<{ href?: string; external?: boolean }>) => {
    const href = event.detail.href;
    if (!href || event.detail.external) return;
    event.preventDefault();
    navigate(href);
  };
}

function navItems(services: readonly ServiceEntry[], badge: (id: string) => ReactNode): SideNavigationProps.Item[] {
  return [
    { type: 'link', text: 'Página inicial do console', href: '/' },
    { type: 'divider' },
    ...CATEGORIES.map(
      (category): SideNavigationProps.Item => ({
        type: 'section-group',
        title: category,
        items: services
          .filter((s) => s.category === category)
          // Com dezenas de serviços, os grupos ficam fechados; o do serviço aberto expande sozinho.
          .map((service) => ({
            type: 'expandable-link-group',
            text: service.name,
            href: service.links[0]?.href ?? '/',
            info: badge(service.id),
            items: service.links.map((link) => ({ type: 'link', text: link.text, href: link.href })),
          })),
      }),
    ).filter((group) => group.type === 'section-group' && group.items.length > 0),
    { type: 'divider' },
    { type: 'link', text: 'Atividade recente', href: '/activity' },
  ];
}

export function ConsoleLayout({ children }: { children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbGroupProps.Item[]>([]);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const notifications = useNotifications();
  const location = useLocation();
  const follow = useFollow();
  const chrome = useMemo<PageChrome>(() => ({ setBreadcrumbs }), []);
  const { services } = useServiceDirectory();
  const fidelity = useFidelity();
  const items = useMemo(() => navItems(services, (id) => <FidelityBadge summary={fidelity.summary(id)} />), [services, fidelity]);
  const [toolsOpen, setToolsOpen] = useState(false);

  // Destaca o link da seção atual, mesmo em páginas de detalhe (o prefixo mais longo vence).
  const activeHref =
    services.flatMap((s) => s.links)
      .filter((link) => location.pathname === link.href || location.pathname.startsWith(`${link.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ??
    services.find((s) => location.pathname.startsWith(s.basePath))?.links[0]?.href ??
    location.pathname;
  const activeService = services.find((s) => location.pathname.startsWith(s.basePath));

  return (
    <PageChromeContext.Provider value={chrome}>
      <div id="top-bar" style={{ position: 'sticky', top: 0, zIndex: 1002 }}>
        <TopBar />
      </div>
      <AppLayout
        headerSelector="#top-bar"
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        navigation={
          <SideNavigation
            header={{ text: 'Console local', href: '/' }}
            activeHref={activeHref}
            items={items}
            onFollow={follow}
          />
        }
        breadcrumbs={<BreadcrumbGroup items={breadcrumbs} onFollow={follow} ariaLabel="Navegação estrutural" />}
        notifications={<Flashbar items={notifications.items} stackItems />}
        stickyNotifications
        // O painel "i" mostra a fidelidade do serviço aberto no emulador, como a ajuda do console.
        toolsHide={!activeService || !fidelity.summary(activeService.id)}
        toolsOpen={toolsOpen}
        onToolsChange={({ detail }) => setToolsOpen(detail.open)}
        tools={activeService && <FidelityPanel serviceId={activeService.id} serviceName={activeService.name} />}
        ariaLabels={{ tools: 'Fidelidade no emulador', toolsToggle: 'Abrir fidelidade no emulador', toolsClose: 'Fechar fidelidade no emulador' }}
        content={children}
      />
    </PageChromeContext.Provider>
  );
}
