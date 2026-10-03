import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiInvoiceService } from '../services/geminiInvoiceService.js';
import { ExtractedInvoiceItemSchema } from '../services/invoiceSchemas.js';

const invoice = {
  supplierName: 'Example Supplier',
  supplierGstin: null,
  invoiceNumber: 'INV-1',
  invoiceDate: null,
  totalAmount: 125,
  items: [{
    rawDescription: 'Example item',
    matchedProductId: null,
    quantity: 1,
    unitCost: 125,
    totalCost: 125,
    gstRate: 0,
    confidence: 0.5
  }],
  requiresManualReview: true,
  notes: null
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GeminiInvoiceService', () => {
  it('allows missing supplier cost to remain null for explicit owner review', () => {
    expect(ExtractedInvoiceItemSchema.safeParse({
      ...invoice.items[0],
      unitCost: null,
      totalCost: null
    }).success).toBe(true);
  });

  it('sends the bill as inline data and validates Gemini JSON output', async () => {
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('GEMINI_VISION_MODEL', 'gemini-test-model');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(invoice) }] } }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new GeminiInvoiceService();
    const result = await service.extractInvoice(Buffer.from('bill'), 'application/pdf', []);

    expect(result).toEqual(invoice);
    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain('/models/gemini-test-model:generateContent');
    expect(url.search).toBe('');
    expect(new Headers(request.headers).get('x-goog-api-key')).toBe('test-gemini-key');
    expect(JSON.parse(String(request.body))).toMatchObject({
      contents: [{ parts: [{ text: expect.stringContaining('30 kg outer bag for a product with packWeightKg 0.5 contains 60 packets') }, { inlineData: { mimeType: 'application/pdf', data: 'YmlsbA==' } }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });
  });

  it('fails explicitly when the API key is not configured', async () => {
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', '');
    await expect(new GeminiInvoiceService().extractInvoice(Buffer.from('bill'), 'image/jpeg', []))
      .rejects.toThrow('Set GOOGLE_GEMINI_API_KEY on the server.');
  });

  it('reports provider HTTP errors without returning provider response data', async () => {
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'test-gemini-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive provider response', { status: 403 })));
    await expect(new GeminiInvoiceService().extractInvoice(Buffer.from('bill'), 'image/jpeg', []))
      .rejects.toThrow('Gemini invoice extraction failed with status 403.');
  });

  it('retries a temporary Gemini 503 once before returning the extraction', async () => {
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'test-gemini-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(invoice) }] } }]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GeminiInvoiceService().extractInvoice(Buffer.from('bill'), 'image/jpeg', []))
      .resolves.toEqual(invoice);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('explains when Gemini remains unavailable after retrying', async () => {
    vi.stubEnv('GOOGLE_GEMINI_API_KEY', 'test-gemini-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GeminiInvoiceService().extractInvoice(Buffer.from('bill'), 'image/jpeg', []))
      .rejects.toThrow('Gemini is temporarily unavailable. Please try uploading the invoice again in a minute.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
