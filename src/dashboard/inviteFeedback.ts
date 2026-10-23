export interface InviteFeedback {
  tone: 'success' | 'warning';
  message: string;
}

/**
 * Toast copy after creating or resending an invitation. The backend reports
 * `email_sent`; when the email did not go out the invitation still exists, so
 * the user is pointed to sharing the link instead. A missing `email_sent`
 * (backend not yet deployed) is treated as sent, as before.
 */
export function invitationEmailFeedback(
  action: 'invite' | 'resend',
  email: string,
  emailSent: boolean | undefined,
): InviteFeedback {
  if (emailSent === false) {
    return {
      tone: 'warning',
      message:
        action === 'invite'
          ? `La invitación para ${email} se creó, pero el email no se pudo enviar. Compartile el link de invitación.`
          : `No se pudo enviar el email a ${email}. Compartile el link de invitación.`,
    };
  }
  return {
    tone: 'success',
    message: action === 'invite' ? `Invitación enviada a ${email}` : `Recordatorio enviado a ${email}`,
  };
}
