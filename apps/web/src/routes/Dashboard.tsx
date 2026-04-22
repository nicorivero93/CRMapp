import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Inbox, Target, CheckCircle2, Recycle, TrendingUp, AlertTriangle } from 'lucide-react';
import type { DashboardReport } from '@mycrm/shared';
import { api, type PublicUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<{ report: DashboardReport }>('/api/analytics/dashboard'),
  });
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: PublicUser[] }>('/api/users'),
  });

  const userName = (id: string | null): string => {
    if (!id) return '—';
    return usersQ.data?.users.find((u) => u.id === id)?.name ?? id.slice(0, 6);
  };

  const report = data?.report;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Hola{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-text-dim">Resumen del pipeline de leads.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi
          label="Leads totales"
          value={report?.totals.total ?? 0}
          icon={<Inbox size={16} />}
          loading={isLoading}
        />
        <Kpi
          label="Asignados hoy"
          value={report?.todayAssigned ?? 0}
          icon={<Target size={16} />}
          loading={isLoading}
          color="text-brand-400"
        />
        <Kpi
          label="Convertidos"
          value={report?.totals.converted ?? 0}
          icon={<CheckCircle2 size={16} />}
          loading={isLoading}
          color="text-emerald-400"
        />
        <Kpi
          label="Para reciclar"
          value={report?.pendingRecycling ?? 0}
          icon={<Recycle size={16} />}
          loading={isLoading}
          color={report && report.pendingRecycling > 0 ? 'text-amber-400' : undefined}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-lg border border-border bg-bg-soft p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-dim">Funnel</h2>
            <Link to="/app/sources" className="text-xs text-brand-400 hover:underline">
              <TrendingUp size={12} className="mr-1 inline" /> Ver por fuente
            </Link>
          </div>
          {report && <FunnelList totals={report.totals} />}
        </section>

        <section className="rounded-lg border border-border bg-bg-soft p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-dim">Para reciclar</h2>
            {user?.role === 'owner' && (
              <Link
                to="/app/settings/recycling"
                className="text-xs text-brand-400 hover:underline"
              >
                Configurar
              </Link>
            )}
          </div>
          {report && report.pendingRecycling === 0 && (
            <div className="text-sm text-text-dim">Nada pendiente. Todo limpio.</div>
          )}
          {report && report.pendingRecycling > 0 && (
            <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle size={18} className="text-amber-400" />
              <div className="flex-1 text-sm">
                <div className="font-medium">
                  {report.pendingRecycling} lead
                  {report.pendingRecycling === 1 ? '' : 's'} para reciclar
                </div>
                <div className="text-xs text-text-dim">
                  {user?.role === 'owner'
                    ? 'Corré el ciclo manual o esperá al cron diario.'
                    : 'El dueño configurará cuándo se reciclan.'}
                </div>
              </div>
              {user?.role === 'owner' && (
                <Link to="/app/settings/recycling" className="btn-outline text-xs">
                  Revisar
                </Link>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-dim">Últimos leads</h2>
          <Link to="/app/leads" className="text-xs text-brand-400 hover:underline">
            Ver todos
          </Link>
        </div>
        <div className="divide-y divide-border">
          {!isLoading && report?.recentLeads.length === 0 && (
            <div className="py-6 text-center text-sm text-text-dim">
              Aún no hay leads. <Link to="/app/leads/import" className="text-brand-400">Importá</Link>.
            </div>
          )}
          {report?.recentLeads.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <Link to={`/app/leads/${l.id}`} className="text-brand-400 hover:underline">
                  {l.name ?? <span className="italic text-text-faint">Sin nombre</span>}
                </Link>
                <div className="text-xs text-text-faint">
                  <span className="font-mono">{l.phone}</span> · {l.source}
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-mono uppercase tracking-wide text-text-dim">{l.status}</div>
                <div className="text-text-faint">
                  {userName(l.assignedTo)} ·{' '}
                  {formatDistanceToNow(new Date(l.createdAt), { addSuffix: true, locale: es })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  color,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-soft p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-text-faint">
        <span>{label}</span>
        <span className="text-text-dim">{icon}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${color ?? 'text-text'}`}>
        {loading ? '…' : value}
      </div>
    </div>
  );
}

function FunnelList({ totals }: { totals: DashboardReport['totals'] }) {
  const stages: Array<{ key: keyof DashboardReport['totals']; label: string; color: string }> = [
    { key: 'new', label: 'Nuevos', color: 'bg-brand-500/60' },
    { key: 'assigned', label: 'Asignados', color: 'bg-amber-500/60' },
    { key: 'contacted', label: 'Contactados', color: 'bg-sky-500/60' },
    { key: 'responded', label: 'Respondieron', color: 'bg-emerald-500/60' },
    { key: 'converted', label: 'Convertidos', color: 'bg-green-500/70' },
    { key: 'discarded', label: 'Descartados', color: 'bg-red-500/60' },
  ];
  const max = Math.max(1, ...stages.map((s) => totals[s.key]));
  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const v = totals[s.key];
        const pct = v === 0 ? 0 : Math.max(5, (v / max) * 100);
        return (
          <div key={s.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-text-dim">{s.label}</span>
              <span className="font-mono text-text">{v}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg/40">
              <div className={`h-full rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
