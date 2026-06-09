import { PrismaClient } from '@prisma/client';
import { SUPABASE_URL, SUPABASE_SECRET_KEY } from '../../lib/config.js';

const prisma = new PrismaClient();

export async function deactivateUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  if (user.supabase_id) {
    const supabaseUrl = SUPABASE_URL();
    const secretKey = SUPABASE_SECRET_KEY();
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.supabase_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({ ban_duration: 'none' }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase ban failed: ${response.status} ${body}`);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: 'disabled' },
  });
}
