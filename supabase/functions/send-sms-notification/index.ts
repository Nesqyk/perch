const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-perch-session',
};

type WhatsAppNotification = {
  id: string;
  phone_e164: string;
  message_body: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== 'POST') {
      return _json({ error: 'Method not allowed.' }, 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const infobipBaseUrl = Deno.env.get('INFOBIP_BASE_URL');
    const infobipApiKey = Deno.env.get('INFOBIP_API_KEY');
    const infobipSender = Deno.env.get('INFOBIP_WHATSAPP_SENDER') ?? Deno.env.get('INFOBIP_SENDER');

    if (!supabaseUrl || !serviceKey || !infobipBaseUrl || !infobipApiKey || !infobipSender) {
      return _json({ error: 'WhatsApp provider is not configured.' }, 500);
    }

    const body = await _readJson(req);
    const notificationIds = Array.isArray(body?.notificationIds)
      ? body.notificationIds.filter((id: unknown) => typeof id === 'string')
      : [];
    const spotId = typeof body?.spotId === 'string' ? body.spotId : '';
    const status = typeof body?.status === 'string' ? body.status : '';
    const templateKey = status === 'available'
      ? 'spot_available'
      : status === 'occupied'
        ? 'spot_occupied'
        : '';

    const notifications = await _fetchQueuedNotifications({
      supabaseUrl,
      serviceKey,
      notificationIds,
      spotId,
      templateKey,
    });

    let sent = 0;
    let failed = 0;

    for (const notification of notifications) {
      await _updateNotification({
        supabaseUrl,
        serviceKey,
        id: notification.id,
        patch: { status: 'sending', updated_at: new Date().toISOString() },
      });

      const result = await _sendInfobipWhatsApp({
        baseUrl: infobipBaseUrl,
        apiKey: infobipApiKey,
        sender: infobipSender,
        to: notification.phone_e164,
        body: notification.message_body,
      });

      if (result.ok) {
        sent += 1;
        await _updateNotification({
          supabaseUrl,
          serviceKey,
          id: notification.id,
          patch: {
            status: 'sent',
            provider: 'infobip_whatsapp',
            provider_message_id: result.messageId,
            error_message: null,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        failed += 1;
        await _updateNotification({
          supabaseUrl,
          serviceKey,
          id: notification.id,
          patch: {
            status: 'failed',
            provider: 'infobip_whatsapp',
            error_message: result.error,
            updated_at: new Date().toISOString(),
          },
        });
      }
    }

    return _json({ queued: notifications.length, sent, failed });
  } catch (err) {
    console.error('[send-sms-notification] unhandled error:', err);
    return _json({ error: _errorMessage(err) }, 500);
  }
});

async function _fetchQueuedNotifications({
  supabaseUrl,
  serviceKey,
  notificationIds,
  spotId,
  templateKey,
}: {
  supabaseUrl: string;
  serviceKey: string;
  notificationIds: string[];
  spotId: string;
  templateKey: string;
}): Promise<WhatsAppNotification[]> {
  const params = new URLSearchParams({
    select: 'id,phone_e164,message_body',
    status: 'eq.queued',
    order: 'created_at.asc',
    limit: '20',
  });

  if (notificationIds.length) {
    params.set('id', `in.(${notificationIds.join(',')})`);
  }
  if (spotId) {
    params.set('spot_id', `eq.${spotId}`);
  }
  if (templateKey) {
    params.set('template_key', `eq.${templateKey}`);
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/sms_notifications?${params}`, {
    headers: _serviceHeaders(serviceKey),
  });

  if (!res.ok) return [];
  return await res.json();
}

async function _updateNotification({
  supabaseUrl,
  serviceKey,
  id,
  patch,
}: {
  supabaseUrl: string;
  serviceKey: string;
  id: string;
  patch: Record<string, unknown>;
}) {
  await fetch(`${supabaseUrl}/rest/v1/sms_notifications?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      ..._serviceHeaders(serviceKey),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
}

async function _sendInfobipWhatsApp({
  baseUrl,
  apiKey,
  sender,
  to,
  body,
}: {
  baseUrl: string;
  apiKey: string;
  sender: string;
  to: string;
  body: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/whatsapp/1/message/text`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `App ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: _normalizeInfobipDestination(sender),
      to: _normalizeInfobipDestination(to),
      content: { text: body },
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: _infobipErrorMessage(payload, res.status),
    };
  }

  return {
    ok: true,
    messageId: payload?.messages?.[0]?.messageId ?? payload?.messageId ?? payload?.bulkId ?? '',
  };
}

function _serviceHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
}

async function _readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function _normalizeInfobipDestination(value: string) {
  return String(value ?? '').replace(/^\+/, '');
}

function _infobipErrorMessage(payload: any, status: number) {
  return payload?.requestError?.serviceException?.text
    ?? payload?.requestError?.serviceException?.messageId
    ?? payload?.message
    ?? `Infobip request failed with ${status}`;
}

function _errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'WhatsApp notification failed.';
}

function _json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}
