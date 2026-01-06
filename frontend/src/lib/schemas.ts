import { z } from 'zod';

// =============================================================================
// API ENVELOPE SCHEMAS
// =============================================================================

export const ApiMetaSchema = z.object({
  version: z.number().default(1),
  timestamp: z.string(),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }).optional(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  target: z.string().optional(),
  details: z.any().optional(),
});

// =============================================================================
// CANONICAL ENTITY SCHEMAS
// =============================================================================

export const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  version: z.number().default(1),
  created_at: z.string(),
  updated_at: z.string(),
  last_modified_by: z.string().uuid().nullable().optional(),
});

export const ProjectSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  technical_uncertainty: z.string().nullable().optional(),
  process_of_experimentation: z.string().nullable().optional(),
  qualification_status: z.enum(["qualified", "not_qualified", "pending", "needs_review"]).default("pending"),
});

export const EmployeeSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  title: z.string().nullable().optional(),
  total_wages: z.number().nonnegative().default(0),
  qualified_percent: z.number().min(0).max(100).default(0),
  state: z.string().nullable().optional(),
});

export const ContractorSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  cost: z.number().nonnegative().default(0),
  is_qualified: z.boolean().default(true),
  location: z.string().default("US"),
});

export const ExpenseSchema = BaseEntitySchema.extend({
  description: z.string().min(1),
  amount: z.number().nonnegative(),
  category: z.string(),
  vendor_name: z.string().nullable().optional(),
  expense_date: z.string(),
});

export const SavedViewSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  entity_type: z.enum(['projects', 'employees', 'contractors', 'tasks', 'expenses']),
  filters: z.array(z.any()).default([]),
  sort: z.array(z.any()).default([]),
  grouping: z.array(z.any()).default([]),
  visible_columns: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  is_shared: z.boolean().default(false),
});

// =============================================================================
// INLINE EDIT SCHEMAS
// =============================================================================

export const InlineEditSchema = z.object({
  field: z.string(),
  value: z.any(),
  version: z.number(), // For conflict detection
});

export type Project = z.infer<typeof ProjectSchema>;
export type Employee = z.infer<typeof EmployeeSchema>;
export type Contractor = z.infer<typeof ContractorSchema>;
export type Expense = z.infer<typeof ExpenseSchema>;
export type SavedView = z.infer<typeof SavedViewSchema>;



