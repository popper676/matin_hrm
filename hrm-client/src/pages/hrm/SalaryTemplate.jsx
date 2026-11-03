import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../../components/layout/Layout';
import Modal from '../../components/experience/Modal';
import Icon from '../../components/common/Icon';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useBrand } from '../../context/BrandContext';
import { SALARY_COLUMNS, SALARY_INPUTS, calculateSalaryTemplate, salaryPeriod } from '../../../../shared/salaryTemplate.js';
import { todayBangkok } from '../../../../shared/operations.js';
import { exportSalaryWorkbook } from '../../utils/salaryExport';
import { downloadPayslip } from '../../utils/payslipDownload';
import '../../styles/salary.css';

const amount = value => Number(value ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const myLabels = {
 basic_salary:'အခြေခံလစာ', fixed_allowance:'ပုံမှန်ထောက်ပံ့ကြေး', ot_hours:'OT နာရီ',
 special_allowance:'အထူးထောက်ပံ့ကြေး', scarcity_allowance:'ရှားပါးကျွမ်းကျင်မှု ထောက်ပံ့ကြေး',
 ssb_employee:'ဝန်ထမ်း SSB', ssb_employer:'အလုပ်ရှင် SSB', income_tax:'ဝင်ငွေခွန်',
 staff_loan:'ဝန်ထမ်းချေးငွေ နုတ်ရန်', unpaid_leave_days:'လစာမဲ့ခွင့်ရက်', other_deduction:'အခြားနုတ်ငွေ',
};

function SalaryEditor({ employee, record, month, onClose, onSaved }) {
 const { language } = useLanguage(), my = language === 'my', l = (en, mm) => my ? mm : en;
 const [input, setInput] = useState(() => Object.fromEntries(SALARY_INPUTS.map(key => [key, record?.salary_template?.[key] ?? (key === 'basic_salary' ? Number(employee.salary ?? 0) : 0)])));
 const [notes, setNotes] = useState(record?.notes || '');
 let preview, error = '';
 try {
  preview = calculateSalaryTemplate(month, input);
  if (preview.net_salary < 0) error = l('Deductions exceed gross salary.', 'နုတ်ငွေက စုစုပေါင်းလစာထက် များနေပါတယ်။');
 } catch (e) { error = e.message; }
 const save = useMutation({
  mutationFn: () => api.post('/payroll/salary-template', { employee_id:employee.id, month, version:record?.salary_template?.version ?? 0, input, notes }),
  onSuccess: () => { toast.success(l('Salary saved', 'လစာသိမ်းပြီးပါပြီ')); onSaved(); },
  onError: e => toast.error(e.response?.data?.error || e.message),
 });
 return <Modal open wide busy={save.isPending} title={l('Salary template', 'လစာပုံစံ') + ' · ' + employee.Full_name} onClose={onClose}>
  <form className="ux-modal-body salary-editor" onSubmit={e => { e.preventDefault(); if (!error) save.mutate(); }}>
   <p>{month} · THB · {l('Review OT, unpaid leave, SSB, tax and loan amounts before saving.', 'မသိမ်းမီ OT၊ လစာမဲ့ခွင့်၊ SSB၊ အခွန်နှင့် ချေးငွေပမာဏများကို စစ်ဆေးပါ။')}</p>
   <div className="salary-inputs">{SALARY_INPUTS.map(key => <label key={key}>
    <span>{my ? myLabels[key] : SALARY_COLUMNS.find(([k]) => k === key)[1]}</span>
    <input aria-label={SALARY_COLUMNS.find(([k]) => k === key)[1]} required type="number" min="0" max={key === 'unpaid_leave_days' ? salaryPeriod(month).days : 100000000} step={key === 'unpaid_leave_days' ? '.5' : '.01'} value={input[key]} onChange={e => setInput(old => ({ ...old, [key]:e.target.value === '' ? '' : Number(e.target.value) }))}/>
   </label>)}</div>
   {error && <p role="alert" className="salary-error">{error}</p>}
   {preview && <div className="salary-preview"><dl>{[
    ['total_salary','Total Salary'], ['attendance_days','Attendance Day'], ['salary_after_attendance','Salary After Attendance Deduction'],
    ['ot_amount','OT Amount'], ['gross_salary','Gross Salary'], ['unpaid_leave','Unpaid Leave'], ['total_deduction','Total Deduction'], ['net_salary','Net Salary'],
   ].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{amount(preview[key])}{key === 'attendance_days' ? ' days' : ' THB'}</dd></div>)}</dl>
    <p>{l('Unpaid leave = Total Salary ÷ 30 × unpaid days. OT follows the uploaded template. The attendance preview is informational; unpaid leave is deducted once. Employer SSB is an employer cost.', 'လစာမဲ့ခွင့်နုတ်ငွေ = စုစုပေါင်းလစာ ÷ ၃၀ × ခွင့်ရက်။ OT ကို ပေးထားသောပုံစံအတိုင်း တွက်သည်။ Attendance preview ကို အချက်အလက်အဖြစ်ပြပြီး လစာမဲ့ခွင့်ကို တစ်ကြိမ်သာနုတ်သည်။ အလုပ်ရှင် SSB ကို ဝန်ထမ်းလစာမှ မနုတ်ပါ။')}</p>
   </div>}
   <label>{l('Notes','မှတ်ချက်')}<textarea maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)}/></label>
   <div className="salary-actions"><button type="button" className="salary-button" onClick={onClose}>{l('Cancel','ပယ်ဖျက်')}</button><button className="salary-button salary-button-primary" disabled={!!error || save.isPending}>{save.isPending ? l('Saving…','သိမ်းနေသည်…') : l('Save pending salary','စစ်ဆေးရန်လစာအဖြစ် သိမ်းရန်')}</button></div>
  </form>
 </Modal>;
}

export default function SalaryTemplate() {
 const { can } = useAuth(), { language } = useLanguage(), { brand } = useBrand(), my = language === 'my', l = (en, mm) => my ? mm : en;
 const qc = useQueryClient();
 const [month, setMonth] = useState(todayBangkok().slice(0,7)), [employeeId, setEmployeeId] = useState('');
 const [editing, setEditing] = useState(null), [paying, setPaying] = useState(null), [downloading, setDownloading] = useState(null);
 const query = useQuery({ queryKey:['salary-template',month], queryFn:() => api.get('/payroll/salary-template', { params:{month} }).then(r => r.data), enabled:/^\d{4}-(0[1-9]|1[0-2])$/.test(month) });
 const employees = query.data?.employees || [], records = query.data?.payrolls || [];
 const rows = records.filter(p => p.salary_template), legacy = records.filter(p => !p.salary_template), selected = employees.find(e => e.id === employeeId);
 const refresh = () => {
  qc.invalidateQueries({queryKey:['salary-template']}); qc.invalidateQueries({queryKey:['payroll']}); qc.invalidateQueries({queryKey:['portal_data']});
  setEditing(null); setPaying(null);
 };
 const pay = useMutation({
  mutationFn:p => api.post(`/payroll/salary-template/${p.id}/pay`, {version:p.salary_template.version}),
  onSuccess:() => { toast.success(l('Payment recorded','ပေးချေမှုမှတ်တမ်းတင်ပြီးပါပြီ')); refresh(); },
  onError:e => { toast.error(e.response?.data?.error || e.message); refresh(); },
 });
 const start = () => {
  if (!selected) return;
  const record = records.find(p => p.employee_id === selected.id);
  if (record && !record.salary_template) return toast.error(l('This month already has a historical payroll. Open saved records.', 'ဒီလအတွက် လစာဟောင်း ရှိပြီးသားပါ။ သိမ်းထားသောမှတ်တမ်းကို ဖွင့်ပါ။'));
  if (record?.payment_status === 'Paid') return toast.error(l('Paid payroll cannot be changed.', 'ပေးပြီးသားလစာကို ပြင်၍မရပါ။'));
  if (record && !can('payroll','edit')) return toast.error(l('Payroll Edit is required.', 'လစာပြင်ခွင့် လိုအပ်ပါတယ်။'));
  setEditing({employee:selected,record});
 };
 const download = async p => { setDownloading(p.id); try { await downloadPayslip(p.id,p.month); } catch(e) { toast.error(e.message); } finally { setDownloading(null); } };
 let period; try { period = salaryPeriod(month); } catch { /* Invalid month has no preview. */ }
 return <Layout title={l('Salary Template','လစာပုံစံ')} subtitle={l('Monthly salary schedule · THB','လစဉ်လစာစာရင်း · THB')}>
  <div className="salary-toolbar">
   <label>{l('Salary month','လစာလ')}<input aria-label="Salary month" type="month" value={month} onChange={e => { setMonth(e.target.value); setEmployeeId(''); }}/></label>
   <Link className="salary-button" to="/payroll/records">{l('Saved payroll & settings','သိမ်းထားသောလစာနှင့် သတ်မှတ်ချက်များ')}</Link>
   <button className="salary-button" disabled={!rows.length} onClick={() => { try { exportSalaryWorkbook(rows.map(p => p.salary_template),month,brand.name); } catch(e) { toast.error(e.message); } }}><Icon name="download" size={16}/>{l('Export salary Excel','လစာ Excel ထုတ်ရန်')}</button>
  </div>
  {period && <p className="salary-period">{l('Pay period','လစာကာလ')}: {period.start} — {period.end} · {period.days} {l('calendar days','ပြက္ခဒိန်ရက်')}</p>}
  {can('payroll','create') && <div className="salary-create"><select aria-label="Salary employee" value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">{l('Choose an employee','ဝန်ထမ်းရွေးပါ')}</option>{employees.map(e => <option key={e.id} value={e.id}>{e.Full_name} · {e.employee_id}</option>)}</select><button className="salary-button salary-button-primary" disabled={!selected} onClick={start}>{l('Prepare salary','လစာပြင်ဆင်ရန်')}</button></div>}
  {query.isLoading && <p role="status">{l('Loading salary records…','လစာမှတ်တမ်း ဖတ်နေသည်…')}</p>}
  {query.error && <p role="alert" className="salary-error">{query.error.response?.data?.error || query.error.message}</p>}
  {!!legacy.length && <p className="salary-notice">{l(`${legacy.length} historical payroll record(s) retain their saved calculation. Open Saved payroll & settings to review them.`, `${legacy.length} ခုသော လစာဟောင်းကို မူလတွက်ချက်မှုအတိုင်း ထိန်းသိမ်းထားပါတယ်။ သိမ်းထားသောလစာနှင့် သတ်မှတ်ချက်များတွင် ကြည့်နိုင်ပါတယ်။`)}</p>}
  {!query.isLoading && !query.error && !rows.length && <div className="salary-empty">{l('No salary-template records for this month. Choose an employee to prepare the first salary.', 'ဒီလအတွက် လစာပုံစံအသစ်ဖြင့် သိမ်းထားသောမှတ်တမ်း မရှိသေးပါ။ ဝန်ထမ်းရွေးပြီး လစာပြင်ဆင်နိုင်ပါတယ်။')}</div>}
  {!!rows.length && <>
   <div className="salary-totals"><span>{rows.length} {l('employees','ယောက်')}</span><strong>{l('Net salary','ရရှိမည့်လစာ')}: {amount(rows.reduce((sum,p) => sum + Number(p.net_salary),0))} THB</strong></div>
   <p id="salary-table-help" className="salary-period">{l('Scroll horizontally to view all 23 salary columns.', 'လစာ column ၂၃ ခုလုံးကြည့်ရန် ဇယားကို ဘယ်ညာရွှေ့ကြည့်ပါ။')}</p>
   <div aria-describedby="salary-table-help" className="salary-table-scroll" tabIndex={0} role="region" aria-label="Salary template"><table className="salary-table"><thead><tr>{SALARY_COLUMNS.map(([key,label]) => <th key={key}>{label}</th>)}<th>{l('Actions','လုပ်ဆောင်ရန်')}</th></tr></thead>
    <tbody>{rows.map(p => <tr key={p.id}>{SALARY_COLUMNS.map(([key],index) => <td key={key} className={index >= 4 ? 'salary-number' : ''}>{index < 4 ? String(p.salary_template[key] || '—').slice(0,key === 'hire_date' ? 10 : 500) : amount(p.salary_template[key])}</td>)}
     <td><div className="salary-row-actions"><span>{p.payment_status}</span>
      {p.payment_status !== 'Paid' && can('payroll','edit') && <button onClick={() => { const employee = employees.find(e => e.id === p.employee_id); if(employee) setEditing({employee,record:p}); }}>{l('Edit','ပြင်ရန်')}</button>}
      {p.payment_status === 'Pending' && can('payroll','pay') && <button onClick={() => setPaying(p)}>{l('Record paid','ပေးပြီးကြောင်း မှတ်ရန်')}</button>}
      <button disabled={!!downloading} onClick={() => download(p)}>{downloading === p.id ? '…' : 'PDF'}</button>
     </div></td>
    </tr>)}</tbody></table></div>
  </>}
  {editing && <SalaryEditor key={editing.employee.id + month} {...editing} month={month} onClose={() => setEditing(null)} onSaved={refresh}/>}
  {paying && <Modal open busy={pay.isPending} title={l('Record salary payment','လစာပေးချေမှု မှတ်တမ်းတင်ရန်')} onClose={() => setPaying(null)}><div className="ux-modal-body"><p>{paying.salary_template.employee_name} · {paying.month}</p><p>{amount(paying.net_salary)} THB</p><p>{l('Confirm the salary was actually paid. This records payment and locks the saved salary; it does not transfer money.', 'လစာတကယ်ပေးချေပြီးဖြစ်ကြောင်း အတည်ပြုပါ။ ပေးပြီးကြောင်း မှတ်တမ်းတင်ပြီး ဤလစာကို ပြင်၍မရတော့ပါ။ ဤခလုတ်က ငွေလွှဲပေးခြင်း မဟုတ်ပါ။')}</p><button className="salary-button salary-button-primary" disabled={pay.isPending} onClick={() => pay.mutate(paying)}>{l('Confirm paid','ပေးပြီးကြောင်း အတည်ပြုရန်')}</button></div></Modal>}
 </Layout>;
}
