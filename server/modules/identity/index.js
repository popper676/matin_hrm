import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { dbFetchOne, dbInsert, dbUpdate } from '../../lib/supabase.js';
import { hashPassword } from '../../middleware/auth.js';

export const identityModule = {
  provisionAccountForEmployee: async (employeeId, employeeExtId, employeeFullName, positionId) => {
    try {
      const username = employeeExtId.toLowerCase();
      const role = 'employee'; // Access is granted explicitly by the owner.
      const defaultPassword = crypto.randomBytes(9).toString('base64url');
      await dbInsert('sys_users', {
        username,
        password_hash: 'MUST_CHANGE:' + await bcrypt.hash(defaultPassword, 12),
        role,
        employee_id: employeeId,
        full_name: employeeFullName,
      });
      return { username, defaultPassword };
    } catch (e) {
      throw e;
    }
  },

  syncUsername: async (employeeId, newEmployeeExtId) => {
    try {
      if (!newEmployeeExtId) return false;
      const sysUser = await dbFetchOne('sys_users', 'id', { employee_id: employeeId });
      if (sysUser) {
        await dbUpdate('sys_users', sysUser.id, { username: newEmployeeExtId.toLowerCase() });
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Syncing sys_users username on employee_id edit failed:', e.message);
      return false;
    }
  },

  deactivateAccountForEmployee: async (employeeId) => {
    try {
      const sysUser = await dbFetchOne('sys_users', 'id', { employee_id: employeeId });
      if (sysUser) await dbUpdate('sys_users', sysUser.id, { is_active: false });
      return true;
    } catch (e) {
      console.error('Failed to deactivate sys_user:', e);
      throw e;
    }
  },

  reactivateAccountForEmployee: async (employeeId) => {
    try {
      const sysUser = await dbFetchOne('sys_users', 'id', { employee_id: employeeId });
      if (sysUser) await dbUpdate('sys_users', sysUser.id, { is_active: true });
      return true;
    } catch (e) {
      console.error('Failed to reactivate sys_user:', e);
      throw e;
    }
  },

  deleteAccountForEmployee: async (employeeId) => {
    try {
      const { supabase } = await import('../../lib/supabase.js');
      const { error } = await supabase.from('sys_users').delete().eq('employee_id', employeeId);
      if (error && error.code !== '42P01' && error.code !== 'PGRST205') { 
        console.error(`Error deleting from sys_users:`, error);
        throw new Error(`Cannot delete: referenced in sys_users`);
      }
      return true;
    } catch (e) {
      throw e;
    }
  }
};
