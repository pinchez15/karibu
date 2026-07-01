'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'

const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password is too long')

export async function setStaffLoginPassword(
  password: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Not signed in' }

  const parsed = PasswordSchema.safeParse(password)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid password' }
  }

  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)

  if (user.passwordEnabled) {
    return {
      success: false,
      error: 'You already have a password. Contact your clinic admin if you need to reset it.',
    }
  }

  try {
    await clerk.users.updateUser(userId, { password: parsed.data })
    return { success: true }
  } catch (e) {
    const message =
      e instanceof Error && e.message ? e.message : 'Could not save password. Try a stronger one.'
    return { success: false, error: message }
  }
}
