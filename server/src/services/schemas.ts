import { z } from 'zod';

export const LoginSchema = z.object({ username: z.string().trim().min(3).max(120), password: z.string().min(8).max(200) });
export const SetupOwnerSchema = LoginSchema.extend({ displayName: z.string().trim().min(1).max(160), setupSecret: z.string().min(8).max(200) });
export const StaffCreateSchema = LoginSchema.extend({ displayName: z.string().trim().min(1).max(160) });
export const StaffUpdateSchema = z.object({ displayName: z.string().trim().min(1).max(160).optional(), active: z.boolean().optional(), password: z.string().min(8).max(200).optional() }).refine(v => Object.keys(v).length > 0);
const QuantitySchema = z.number().positive().max(99999999999.999).multipleOf(0.001);
const StockQuantitySchema = z.number().nonnegative().max(99999999999.999).multipleOf(0.001);

export const CustomerSchema = z.object({
  storeName: z.string().trim().min(1).max(255),
  address: z.string().trim().max(2000).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  gstin: z.string().trim().max(32).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  stateCode: z.string().trim().max(4).optional().nullable(),
  pan: z.string().trim().max(16).optional().nullable(),
  isTaxpayer: z.boolean().default(false),
  creditLimit: z.number().nonnegative().default(0),
  active: z.boolean().default(true)
});

const ProductUpdateFieldsSchema = z.object({
  sku: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(255),
  brand: z.string().trim().max(160).optional().nullable(),
  packSize: z.string().trim().max(120).optional().nullable(),
  unit: z.enum(['KG', 'PACKET']),
  packWeightKg: z.number().positive().max(999999.999999).nullable(),
  hsnCode: z.string().trim().max(32).optional().nullable(),
  masterRate: z.number().nonnegative(),
  gstRate: z.number().min(0).max(100),
  stockQuantity: StockQuantitySchema,
  active: z.boolean()
});

const ProductFieldsSchema = ProductUpdateFieldsSchema.extend({
  unit: ProductUpdateFieldsSchema.shape.unit.default('KG'),
  packWeightKg: ProductUpdateFieldsSchema.shape.packWeightKg.default(null),
  stockQuantity: ProductUpdateFieldsSchema.shape.stockQuantity.default(0),
  active: ProductUpdateFieldsSchema.shape.active.default(true)
});

export const ProductSchema = ProductFieldsSchema.superRefine((product, ctx) => {
  if (product.unit === 'PACKET' && !product.packWeightKg) {
    ctx.addIssue({ code: 'custom', path: ['packWeightKg'], message: 'Packet products need a packet weight in kilograms.' });
  }
  if (product.unit === 'KG' && product.packWeightKg !== null) {
    ctx.addIssue({ code: 'custom', path: ['packWeightKg'], message: 'Loose KG products must not have a packet weight.' });
  }
  if (product.unit === 'PACKET' && !Number.isInteger(product.stockQuantity)) {
    ctx.addIssue({ code: 'custom', path: ['stockQuantity'], message: 'Packet stock must be a whole packet count.' });
  }
});

export const ProductUpdateSchema = ProductUpdateFieldsSchema.omit({ stockQuantity: true }).partial().refine(v => Object.keys(v).length > 0);
export const StockAdjustSchema = z.object({ quantityDelta: z.number().min(-99999999999.999).max(99999999999.999).multipleOf(0.001), reason: z.string().trim().min(1).max(300) });

export const OrderSchema = z.object({
  customerId: z.string().uuid(),
  clientIdempotencyKey: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: QuantitySchema,
    ratePerKg: z.number().nonnegative().optional(),
    discountPercent: z.number().min(0).max(100).default(0)
  })).min(1)
});
export type OrderInput = z.infer<typeof OrderSchema>;

export const PaymentSchema = z.object({
  customerId: z.string().uuid(),
  orderId: z.string().uuid().optional().nullable(),
  method: z.enum(['CASH','UPI','BANK_TRANSFER','CHEQUE','OTHER']),
  amount: z.number().positive(),
  reference: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export const OrderSettlementSchema = z.object({
  choice: z.enum(['QR', 'CASH', 'CHEQUE', 'LEND']),
  amount: z.number().nonnegative().max(999999999999.99),
  collectionMethod: z.enum(['CASH', 'UPI', 'CHEQUE']).optional(),
  reference: z.string().trim().max(255).optional().nullable()
});

export const SettingsSchema = z.object({
  company: z.object({ businessName: z.string().trim().min(1).max(255), address: z.string().trim().max(2000), phone: z.string().trim().max(32), gstin: z.string().trim().max(32), state: z.string().trim().max(100), stateCode: z.string().trim().max(4) }),
  billing: z.object({ defaultCgstRate: z.number().min(0).max(100), defaultSgstRate: z.number().min(0).max(100), defaultIgstRate: z.number().min(0).max(100), invoicePrefix: z.string().trim().max(16), nextInvoiceNumber: z.number().int().positive(), copiesPerInvoice: z.number().int().min(1).max(5) })
});

export const SupplierConfirmSchema = z.object({
  supplierName: z.string().trim().min(1).max(255),
  supplierGstin: z.string().trim().max(32).optional().nullable(),
  invoiceNumber: z.string().trim().max(255).optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  totalAmount: z.number().nonnegative().optional().nullable(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    rawDescription: z.string().trim().min(1).max(255),
    quantity: QuantitySchema,
    unitCost: z.number().nonnegative(),
    totalCost: z.number().nonnegative(),
    gstRate: z.number().min(0).max(100).default(0),
    confidence: z.number().min(0).max(1).optional().nullable()
  })).min(1)
});
