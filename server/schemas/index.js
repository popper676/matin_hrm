import { z } from 'zod';

export const createEmployeeSchema = z.object({
  body: z.object({
    Full_name: z.string().min(2, "Full name is required and must be at least 2 characters"),
    Gender: z.enum(['Male', 'Female', 'Other']).optional(),
    DOB: z.string().optional(),
    Mobile_no: z.string().optional(),
    status: z.enum(['Active', 'Inactive']).default('Active'),
    position_id: z.string().uuid("Position must be a valid UUID").optional().nullable(),
    department_id: z.string().uuid("Department must be a valid UUID").optional().nullable(),
    basic_salary: z.string().optional().nullable()
  })
});

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    role: z.enum(['boss', 'hr_manager', 'finance', 'admin', 'employee']),
    full_name: z.string().optional(),
    employee_id: z.string().uuid("Employee ID must be a valid UUID").optional().nullable().or(z.literal(''))
  })
});
