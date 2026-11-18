import { redirect } from 'next/navigation';
import { currentUser, publicUser } from '@/lib/server/auth';
import { AppShell } from '@/components/app/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/');
  return <AppShell user={publicUser(user)}>{children}</AppShell>;
}
