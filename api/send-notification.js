/**
 * api/send-notification.js
 *
 * Vercel Serverless Function that sends demo spot notification emails through
 * Ethereal Email. Ethereal does not deliver to real inboxes; it returns a
 * preview URL that is perfect for capstone/demo verification.
 */

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SPOT_IMAGES_BUCKET = 'spot-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const DEFAULT_RECIPIENT = 'demo@perch.local';
const DEFAULT_APP_BASE_URL = 'https://perch.tyronemt.dev';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SPOT_SELECT = `
  id,
  name,
  type,
  campus_id,
  area_id,
  building,
  floor,
  walk_time_min,
  rough_capacity,
  has_outlets,
  wifi_strength,
  noise_baseline,
  has_food,
  lat,
  lng,
  image_path,
  availability_status,
  campuses (
    id,
    name,
    short_name,
    city
  ),
  areas (
    id,
    sitio,
    barangay,
    city_municipality
  )
`;

const SPOT_SELECT_WITH_DESCRIPTION = `
  id,
  name,
  description,
  type,
  campus_id,
  area_id,
  building,
  floor,
  walk_time_min,
  rough_capacity,
  has_outlets,
  wifi_strength,
  noise_baseline,
  has_food,
  lat,
  lng,
  image_path,
  availability_status,
  campuses (
    id,
    name,
    short_name,
    city
  ),
  areas (
    id,
    sitio,
    barangay,
    city_municipality
  )
`;

/** @type {Promise<nodemailer.TestAccount> | null} */
let etherealAccountPromise = null;

/**
 * Send a demo spot notification email.
 *
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 * @param {import('http').ServerResponse & {
 *   status: (code: number) => { json: (body: unknown) => void },
 *   setHeader: (name: string, value: string) => void,
 * }} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  const body = await _readBody(req);
  const spotId = String(body?.spotId ?? '').trim();
  const userEmail = _cleanEmail(body?.userEmail) || DEFAULT_RECIPIENT;

  if (!UUID_RE.test(spotId)) {
    res.status(400).json({ ok: false, error: 'A valid spotId is required.' });
    return;
  }

  try {
    const supabase = _createSupabaseClient();
    const { spot, fetchError } = await _fetchSpot(supabase, spotId);
    const imageUrl = spot?.image_path
      ? await _signSpotImageUrl(supabase, spot.image_path)
      : '';
    const emailSpot = _normalizeSpot(spot, spotId, imageUrl);
    const html = _emailHtml(emailSpot);
    const text = _emailText(emailSpot);
    const transporter = await _createTransporter();

    if (fetchError) {
      console.error('[send-notification] Supabase fetch fallback:', fetchError);
    }

    const info = await transporter.sendMail({
      from: '"Perch Demo" <notifications@perch.local>',
      to: userEmail,
      subject: `Perch update: ${emailSpot.name} is ${emailSpot.statusLabel}`,
      text,
      html,
    });

    res.status(200).json({
      ok: true,
      previewUrl: nodemailer.getTestMessageUrl(info) || false,
      messageId: info.messageId,
    });
  } catch (err) {
    console.error('[send-notification] send error:', err);
    res.status(500).json({
      ok: false,
      error: _publicErrorMessage(err),
    });
  }
}

async function _createTransporter() {
  if (!etherealAccountPromise) {
    etherealAccountPromise = nodemailer.createTestAccount();
  }

  const account = await etherealAccountPromise;
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });
}

function _createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured.');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function _fetchSpot(supabase, spotId) {
  const richResult = await supabase
    .from('spots')
    .select(SPOT_SELECT_WITH_DESCRIPTION)
    .eq('id', spotId)
    .maybeSingle();

  if (!richResult.error) {
    return { spot: richResult.data, fetchError: null };
  }

  const shouldRetryWithoutDescription = String(richResult.error.message ?? '')
    .toLowerCase()
    .includes('description');

  if (!shouldRetryWithoutDescription) {
    return { spot: null, fetchError: richResult.error.message };
  }

  const fallbackResult = await supabase
    .from('spots')
    .select(SPOT_SELECT)
    .eq('id', spotId)
    .maybeSingle();

  if (fallbackResult.error) {
    return { spot: null, fetchError: fallbackResult.error.message };
  }

  return { spot: fallbackResult.data, fetchError: richResult.error.message };
}

async function _signSpotImageUrl(supabase, imagePath) {
  const { data, error } = await supabase
    .storage
    .from(SPOT_IMAGES_BUCKET)
    .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('[send-notification] image sign error:', error.message);
    return '';
  }

  return data?.signedUrl ?? '';
}

function _normalizeSpot(spot, spotId, imageUrl) {
  const campus = Array.isArray(spot?.campuses) ? spot.campuses[0] : spot?.campuses;
  const area = Array.isArray(spot?.areas) ? spot.areas[0] : spot?.areas;
  const status = String(spot?.availability_status ?? 'unknown').toLowerCase();
  const building = spot?.building || 'Study area';
  const room = spot?.floor ? `Floor ${spot.floor}` : '';
  const campusName = campus?.short_name || campus?.name || campus?.city || area?.city_municipality || 'Perch area';
  const areaLabel = [area?.sitio, area?.barangay, area?.city_municipality]
    .filter(Boolean)
    .join(', ');

  return {
    id: spot?.id || spotId,
    name: spot?.name || 'Perch study spot',
    description: spot?.description || _fallbackDescription(spot),
    building,
    room,
    campusName,
    areaLabel,
    status,
    statusLabel: _statusLabel(status),
    badgeColor: _statusColor(status),
    imageUrl,
    appUrl: _spotUrl(spot?.id || spotId),
  };
}

function _fallbackDescription(spot) {
  if (!spot) {
    return 'We could not load the full spot details, but Perch still prepared this demo notification.';
  }

  const details = [
    spot.has_outlets ? 'power outlets nearby' : '',
    spot.has_food ? 'food and drinks nearby' : '',
    spot.wifi_strength ? `${spot.wifi_strength} WiFi` : '',
    spot.noise_baseline ? `${spot.noise_baseline} noise level` : '',
    spot.rough_capacity ? `${spot.rough_capacity} capacity` : '',
  ].filter(Boolean);

  return details.length
    ? `This spot has ${details.join(', ')}.`
    : 'A Perch community study spot is ready for your next session.';
}

function _statusLabel(status) {
  if (status === 'available') return 'available';
  if (status === 'occupied') return 'occupied';
  return 'status unknown';
}

function _statusColor(status) {
  if (status === 'available') return '#16a34a';
  if (status === 'occupied') return '#dc2626';
  return '#d97706';
}

function _spotUrl(spotId) {
  const baseUrl = String(process.env.APP_BASE_URL || process.env.VERCEL_URL || DEFAULT_APP_BASE_URL)
    .replace(/^([^h])/, 'https://$1')
    .replace(/\/+$/, '');
  return `${baseUrl}/?spot=${encodeURIComponent(spotId)}#/spot`;
}

function _emailText(spot) {
  return [
    `${spot.name} is ${spot.statusLabel}.`,
    `Location: ${[spot.campusName, spot.building, spot.room].filter(Boolean).join(' - ')}`,
    spot.areaLabel ? `Area: ${spot.areaLabel}` : '',
    spot.description,
    `View Spot: ${spot.appUrl}`,
    'This is a demo notification from Perch, sent via Ethereal Email.',
  ].filter(Boolean).join('\n\n');
}

function _emailHtml(spot) {
  const imageMarkup = spot.imageUrl
    ? `<img src="${_escapeAttr(spot.imageUrl)}" alt="${_escapeAttr(spot.name)}" style="display:block;width:100%;max-height:320px;object-fit:cover;border-radius:22px;">`
    : `<div style="height:220px;border-radius:22px;background:linear-gradient(135deg,#dcfce7,#ecfdf5);display:flex;align-items:center;justify-content:center;color:#047857;font:700 18px Arial,sans-serif;">Photo coming soon</div>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4fbf7;font-family:Arial,Helvetica,sans-serif;color:#10231b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4fbf7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 22px 60px rgba(15,118,79,0.14);">
            <tr>
              <td style="padding:28px 28px 16px;">
                <div style="font-size:14px;font-weight:700;color:#10b981;letter-spacing:0.08em;text-transform:uppercase;">Perch notification</div>
                <h1 style="margin:10px 0 12px;font-size:32px;line-height:1.12;color:#063f2f;">${_escapeHtml(spot.name)}</h1>
                <span style="display:inline-block;background:${spot.badgeColor};color:#ffffff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${_escapeHtml(spot.statusLabel)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                ${imageMarkup}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fbf9;border:1px solid #dceee6;border-radius:22px;">
                  <tr>
                    <td style="padding:18px 20px;font-size:15px;line-height:1.55;">
                      <div style="margin-bottom:8px;"><strong>📍 Campus</strong><br>${_escapeHtml(spot.campusName)}</div>
                      <div style="margin-bottom:8px;"><strong>🏢 Building / Room</strong><br>${_escapeHtml([spot.building, spot.room].filter(Boolean).join(' - '))}</div>
                      ${spot.areaLabel ? `<div><strong>🗺️ Area</strong><br>${_escapeHtml(spot.areaLabel)}</div>` : ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 8px;">
                <p style="margin:0;font-size:16px;line-height:1.7;color:#385347;">${_escapeHtml(spot.description)}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 28px 34px;">
                <a href="${_escapeAttr(spot.appUrl)}" style="display:inline-block;background:#34e99a;color:#06452f;text-decoration:none;font-size:16px;font-weight:800;padding:14px 28px;border-radius:999px;box-shadow:0 12px 28px rgba(16,185,129,0.28);">View Spot</a>
              </td>
            </tr>
          </table>
          <p style="max-width:640px;margin:18px auto 0;color:#6b7f76;font-size:13px;line-height:1.5;">This is a demo notification from Perch – sent via Ethereal Email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function _readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); }
    catch { return {}; }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function _cleanEmail(value) {
  const email = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function _publicErrorMessage(err) {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (message.includes('SUPABASE_URL')) return message;
  return 'Unable to send the demo email right now.';
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeAttr(value) {
  return _escapeHtml(value).replace(/`/g, '&#96;');
}
