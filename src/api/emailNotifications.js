/**
 * src/api/emailNotifications.js
 *
 * Thin frontend client for demo email notifications. The Vercel API route
 * performs the real Supabase lookup and Ethereal SMTP delivery.
 */

/**
 * Send a demo spot notification email and return the Ethereal preview URL.
 *
 * @param {{ spotId: string, userEmail?: string | null }} params
 * @returns {Promise<{ previewUrl: string, error: string | null }>}
 */
export async function sendSpotEmailNotification({ spotId, userEmail = null }) {
  if (!spotId) {
    return { previewUrl: '', error: 'A spot is required before sending an email.' };
  }

  try {
    const response = await fetch('/api/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spotId,
        userEmail,
      }),
    });

    const payload = await _readJson(response);
    if (!response.ok || !payload?.ok) {
      return {
        previewUrl: '',
        error: payload?.error || 'Unable to send the demo email.',
      };
    }

    return {
      previewUrl: typeof payload.previewUrl === 'string' ? payload.previewUrl : '',
      error: null,
    };
  } catch (err) {
    console.error('[emailNotifications] sendSpotEmailNotification error:', err);
    return { previewUrl: '', error: 'Unable to reach the demo email service.' };
  }
}

async function _readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
