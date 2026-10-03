import { z } from 'zod';
export const ExtractedInvoiceItemSchema = z.object({rawDescription:z.string().min(1),matchedProductId:z.string().uuid().nullable(),quantity:z.number().positive().max(99999999999.999).multipleOf(0.001),unitCost:z.number().nonnegative().nullable(),totalCost:z.number().nonnegative().nullable(),gstRate:z.number().min(0).max(100),confidence:z.number().min(0).max(1)});
export const ExtractedInvoiceSchema = z.object({supplierName:z.string().min(1),supplierGstin:z.string().nullable(),invoiceNumber:z.string().nullable(),invoiceDate:z.string().nullable(),totalAmount:z.number().nullable(),items:z.array(ExtractedInvoiceItemSchema).min(1),requiresManualReview:z.boolean(),notes:z.string().nullable()});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
