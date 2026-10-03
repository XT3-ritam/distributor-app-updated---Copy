import crypto from 'node:crypto';
import { ExtractedInvoice, ExtractedInvoiceSchema } from './invoiceSchemas.js';

type CatalogItem = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  packSize: string | null;
  unit: string | null;
  packWeightKg: number | null;
  masterRate: number;
  gstRate: number;
  hsnCode: string | null;
};

export class GeminiInvoiceService {
  private readonly apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  private readonly model = process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite';

  isAvailable() {
    return Boolean(this.apiKey && !this.apiKey.startsWith('replace-with-'));
  }

  async extractInvoice(fileBuffer: Buffer, mimeType: string, catalog: CatalogItem[]): Promise<ExtractedInvoice> {
    if (!this.isAvailable()) {
      throw new Error('AI extraction is not configured. Set GOOGLE_GEMINI_API_KEY on the server.');
    }

    const prompt = `Read this supplier invoice carefully. Extract only information visibly present on the document. Return one JSON object with fields supplierName (string), supplierGstin (string or null), invoiceNumber (string or null), invoiceDate (string or null), totalAmount (number or null), items (array of {rawDescription, matchedProductId, quantity, unitCost, totalCost, gstRate, confidence}), requiresManualReview (boolean), and notes (string or null). Match each line to the supplied catalog using name, brand, packSize and unit; matchedProductId must be a catalog ID. Every catalog selling rate is per kilogram and is only for sale-price reference; never use it as the supplier purchase cost. Catalog unit KG means loose product: express quantity in kilograms and unitCost per kilogram. Catalog unit PACKET means a fixed-weight packet: use packWeightKg (the weight of one packet), convert only when the bill clearly states the total product weight or pack count, and output quantity as the whole number of packets. Example: a clearly stated 30 kg outer bag for a product with packWeightKg 0.5 contains 60 packets. If only a bag count is shown without explicit total weight, do not assume its weight. For packets, unitCost is per packet (visible line total divided by packet count when both are clear); for KG products it is per kg. Extract unitCost and totalCost only from visible invoice values or calculate from another visible invoice value and an unambiguous quantity. If a cost is not supported by the invoice, return null for that cost and explain in notes; the owner must fill it in before confirmation. Never estimate purchase costs from masterRate. Never change unit meaning or invent conversions. If product match, weight, or count is uncertain, set matchedProductId to null and explain in notes for owner review. Preserve the visible line total as totalCost when present. Owner reviews every suggestion before stock changes. Include GSTIN when visible, null for missing fields, and return JSON only without markdown.\nCatalog:\n${JSON.stringify(catalog)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`);
      const requestBody = JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: fileBuffer.toString('base64') } }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json' }
      });
      let response: Response;
      for (let attempt = 0; ; attempt++) {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey! },
          body: requestBody,
          signal: controller.signal
        });
        if (response.status !== 503 || attempt >= 1) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!response.ok) {
        const detail = response.status === 503
          ? 'Gemini is temporarily unavailable. Please try uploading the invoice again in a minute.'
          : `Gemini invoice extraction failed with status ${response.status}.`;
        throw new Error(detail);
      }

      const result = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const outputText = result.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!outputText) {
        throw new Error('Gemini returned no invoice extraction.');
      }
      return ExtractedInvoiceSchema.parse(JSON.parse(outputText));
    } finally {
      clearTimeout(timer);
    }
  }

  hash(buffer: Buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
