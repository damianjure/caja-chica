import test from 'node:test';
import assert from 'node:assert/strict';

import { invitationEmailFeedback } from '../src/dashboard/inviteFeedback';

test('invitationEmailFeedback: email sent → success', () => {
  assert.deepEqual(invitationEmailFeedback('invite', 'ana@x.com', true), {
    tone: 'success',
    message: 'Invitación enviada a ana@x.com',
  });
  assert.deepEqual(invitationEmailFeedback('resend', 'ana@x.com', true), {
    tone: 'success',
    message: 'Recordatorio enviado a ana@x.com',
  });
});

test('invitationEmailFeedback: email not sent → warning that points to sharing the link', () => {
  assert.deepEqual(invitationEmailFeedback('invite', 'ana@x.com', false), {
    tone: 'warning',
    message: 'La invitación para ana@x.com se creó, pero el email no se pudo enviar. Compartile el link de invitación.',
  });
  assert.deepEqual(invitationEmailFeedback('resend', 'ana@x.com', false), {
    tone: 'warning',
    message: 'No se pudo enviar el email a ana@x.com. Compartile el link de invitación.',
  });
});

test('invitationEmailFeedback: backend without email_sent (older deploy) → success', () => {
  assert.equal(invitationEmailFeedback('invite', 'ana@x.com', undefined).tone, 'success');
});
