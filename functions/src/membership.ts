// mp_users.status: 'pending' (signed up, waiting for approval) | 'disabled' | missing/'active'.
// Pending and disabled people are not members: no callables, no lead routing, no notifications.
export const isInactiveStatus = (status: unknown) => status === 'pending' || status === 'disabled';
/** An mp_users doc (data) that counts as an active member. */
export const isActiveMember = (data: Record<string, unknown> | undefined | null) => !!data && !isInactiveStatus(data.status);
