/**
 * dateUtils.js — Shared Date Utilities
 *
 * Centralised here to avoid the previous duplication across:
 *   - compensationService.js
 *   - attendanceService.js
 *   - payroll_engine.js
 *
 * All date comparisons in this HRM system use Asia/Bangkok (UTC+7).
 * LM_HR operates in Bangkok timezone. This must not be changed per company
 * without also adding timezone to the future Company Policy configuration.
 */

const PAYROLL_TIMEZONE = 'Asia/Bangkok';

/**
 * Returns a YYYY-MM-DD string for the given date input, interpreted in
 * Asia/Bangkok timezone (UTC+7). Safe for cross-midnight date comparisons.
 *
 * @param {Date|string|number} dateInput - Any value parseable by new Date()
 * @returns {string} YYYY-MM-DD formatted date string
 */
export function getBkkDateString(dateInput) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PAYROLL_TIMEZONE }).format(
    new Date(dateInput)
  );
}

export function bkkMonthBounds(month) {
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1000)
  throw Object.assign(new Error('month must be YYYY-MM.'),{status:400});
 const [year,m]=month.split('-').map(Number),next=new Date(Date.UTC(year,m,1)),last=new Date(Date.UTC(year,m,0));
 const startDay=month+'-01',nextDay=next.toISOString().slice(0,10),endDay=last.toISOString().slice(0,10);
 return {start:new Date(startDay+'T00:00:00+07:00').toISOString(),end:new Date(nextDay+'T00:00:00+07:00').toISOString(),startDay,endDay,nextDay};
}
export function bkkDayBounds(day) {
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
  throw Object.assign(new Error('date must be a valid YYYY-MM-DD.'),{status:400});
 const start=new Date(day+'T00:00:00+07:00');
 return {start:start.toISOString(),end:new Date(start.getTime()+86400000).toISOString()};
}
