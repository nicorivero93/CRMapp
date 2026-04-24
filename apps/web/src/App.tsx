import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import Login from '@/routes/Login';
import Signup from '@/routes/Signup';
import Dashboard from '@/routes/Dashboard';
import Leads from '@/routes/Leads';
import MyLeads from '@/routes/MyLeads';
import LeadsImport from '@/routes/LeadsImport';
import LeadDetail from '@/routes/LeadDetail';
import Lines from '@/routes/Lines';
import Templates from '@/routes/Templates';
import Sources from '@/routes/Sources';
import SettingsAssignment from '@/routes/SettingsAssignment';
import SettingsRecycling from '@/routes/SettingsRecycling';
import SettingsWhatsApp from '@/routes/SettingsWhatsApp';
import SettingsStages from '@/routes/SettingsStages';
import SettingsUpdater from '@/routes/SettingsUpdater';
import Pipeline from '@/routes/Pipeline';
import Contacts from '@/routes/Contacts';
import Calendar from '@/routes/Calendar';
import Automations from '@/routes/Automations';
import Conocimiento from '@/routes/Conocimiento';
import Settings from '@/routes/Settings';
import Profile from '@/routes/Profile';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading, ownerExists } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-text-dim">Cargando…</div>;
  if (!user) {
    if (ownerExists === false) return <Navigate to="/signup" replace />;
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/app" element={<Protected><AppShell /></Protected>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/mine" element={<MyLeads />} />
        <Route path="leads/import" element={<LeadsImport />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="lines" element={<Lines />} />
        <Route path="sources" element={<Sources />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="automations" element={<Automations />} />
        <Route path="conocimiento" element={<Conocimiento />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/assignment" element={<SettingsAssignment />} />
        <Route path="settings/templates" element={<Templates />} />
        <Route path="settings/recycling" element={<SettingsRecycling />} />
        <Route path="settings/whatsapp" element={<SettingsWhatsApp />} />
        <Route path="settings/stages" element={<SettingsStages />} />
        <Route path="settings/updater" element={<SettingsUpdater />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
