/**
 * src/utils/phone.js
 *
 * Small phone-number helpers for the WhatsApp opt-in flow. MVP validation is
 * scoped to Philippine mobile numbers and normalizes them to E.164.
 */

const PH_MOBILE_E164 = /^\+639\d{9}$/;

/**
 * Normalize a Philippine mobile number into E.164.
 *
 * @param {string} value
 * @returns {{ value: string, error: string | null }}
 */
export function normalizePhoneNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: '', error: 'Enter a phone number.' };

  const compact = raw.replace(/[\s().-]+/g, '');
  let normalized = '';

  if (compact.startsWith('+63')) {
    normalized = compact;
  } else if (compact.startsWith('09')) {
    normalized = `+63${compact.slice(1)}`;
  } else if (compact.startsWith('9')) {
    normalized = `+63${compact}`;
  } else if (compact.startsWith('639')) {
    normalized = `+${compact}`;
  } else {
    return { value: '', error: 'Use a PH mobile number like 0917 123 4567.' };
  }

  if (!PH_MOBILE_E164.test(normalized)) {
    return { value: '', error: 'Use a valid PH mobile number with 10 mobile digits.' };
  }

  return { value: normalized, error: null };
}

/**
 * Check whether a number is already valid E.164 for PH WhatsApp.
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isValidPhoneNumber(value) {
  return PH_MOBILE_E164.test(String(value ?? ''));
}
