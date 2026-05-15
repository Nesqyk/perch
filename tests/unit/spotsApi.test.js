import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMock = vi.hoisted(() => vi.fn());
const createSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        createSignedUrl: createSignedUrlMock,
      })),
    },
  },
}));

describe('uploadSpotImage', () => {
  const spotId = '2a3a3fc6-0fb7-4f5f-8f43-b8d1f5f7b6c1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    uploadMock.mockResolvedValue({ error: null });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    });
  });

  it('uploads spot images without storage upsert', async () => {
    const file = { name: 'quiet-room.png', type: 'image/png' };

    const { uploadSpotImage } = await import('../../src/api/spots.js');
    const result = await uploadSpotImage({ spotId, file });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toMatch(new RegExp(`^spots/${spotId}/\\d+-quiet-room\\.png$`));
    expect(uploadMock.mock.calls[0][2]).toMatchObject({
      cacheControl: '3600',
      contentType: 'image/png',
      upsert: false,
    });
    expect(result.error).toBeNull();
    expect(result.url).toBe('https://example.com/signed');
  });

  it('returns a readable error before upload when spot id is invalid', async () => {
    const file = { name: 'quiet-room.png', type: 'image/png' };

    const { uploadSpotImage } = await import('../../src/api/spots.js');
    const result = await uploadSpotImage({ spotId: 'spot-1', file });

    expect(uploadMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      path: '',
      url: '',
      error: 'A valid spot is required before uploading an image.',
    });
  });
});
