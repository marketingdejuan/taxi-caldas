import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import DashboardClient from '@/components/DashboardClient';

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect('/login');
  }
  return <DashboardClient />;
}
