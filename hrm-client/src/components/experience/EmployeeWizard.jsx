import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import Modal from './Modal';
import Icon from '../common/Icon';
const initial={employee_id:'',Full_name:'',email:'',phone:'',Dept_id:'',position_id:'',Manager_id:'',hire_date:'',date_of_birth:'',salary:'',national_id:'',address:'',employment_type:'Full-Time',status:'Active'};
export default function EmployeeWizard({open,onClose,departments=[],positions=[],managers=[],onSave,isPending,error}) {
  const {t}=useLanguage(),[form,setForm]=useState(initial),[step,setStep]=useState(0);
  const x=key=>t(`common.experience.${key}`),l=key=>t(`hrm.employees.labels.${key}`);
  useEffect(()=>{if(open){setForm({...initial});setStep(0);}},[open]);
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  const field=(key,label,type='text',required=false)=><div className="ux-field" key={key}><label htmlFor={`new-${key}`}>{label}{required?' *':''}</label><input id={`new-${key}`} name={key} type={type} step={type==='number'?'0.01':undefined} required={required} value={form[key]} onChange={e=>set(key,e.target.value)}/></div>;
  const select=(key,label,options)=><div className="ux-field" key={key}><label htmlFor={`new-${key}`}>{label}</label><select id={`new-${key}`} name={key} value={form[key]} onChange={e=>set(key,e.target.value)}>{options.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></div>;
  const next=e=>{e.preventDefault();if(step<2){setStep(v=>v+1);return;}if(!form.employee_id.trim()||!form.Full_name.trim()){setStep(0);return;}onSave({...form,employee_id:form.employee_id.trim(),Full_name:form.Full_name.trim()});};
  const review=[[l('empId'),form.employee_id],[l('fullName'),form.Full_name],[l('email'),form.email],[l('phone'),form.phone],[l('department'),departments.find(d=>d.id===form.Dept_id)?.Department_name],[l('position'),positions.find(p=>p.id===form.position_id)?.title],[l('boss'),managers.find(m=>m.id===form.Manager_id)?.Full_name],[l('hireDate'),form.hire_date],[l('dob'),form.date_of_birth],[l('salary'),form.salary],[l('nationalId'),form.national_id],[l('employmentType'),form.employment_type],[l('status'),form.status],[l('address'),form.address]];
  return <Modal open={open} onClose={onClose} title={t('hrm.employees.addModalTitle')} description={x(['profileStep','workStep','reviewHint'][step])} wide busy={isPending}>
    <nav className="ux-wizard-steps" aria-label="Employee setup steps">{['profileStep','workStep','reviewStep'].map((key,index)=><button key={key} type="button" disabled={index>step||isPending} aria-current={step===index?'step':undefined} onClick={()=>setStep(index)}><span>{index<step?<Icon name="active" size={16}/>:index+1}</span>{x(key)}</button>)}</nav>
    <form onSubmit={next}>
      <div className="ux-modal-body">
        {step===0&&<div className="ux-form-grid">{field('employee_id',l('empId').replace(' *',''),'text',true)}{field('Full_name',l('fullName').replace(' *',''),'text',true)}{field('email',l('email'),'email')}{field('phone',l('phone'),'tel')}{field('date_of_birth',l('dob'),'date')}{field('national_id',l('nationalId'))}</div>}
        {step===1&&<div className="ux-form-grid">{select('Dept_id',l('department'),[['',t('hrm.employees.selects.dept')],...departments.map(d=>[d.id,d.Department_name])])}{select('position_id',l('position'),[['',t('hrm.employees.selects.pos')],...positions.map(p=>[p.id,p.title])])}{select('Manager_id',l('boss'),[['',t('hrm.employees.selects.noBoss')],...managers.map(m=>[m.id,m.Full_name])])}{field('hire_date',l('hireDate'),'date')}{field('salary',l('salary'),'number')}{select('employment_type',l('employmentType'),[['Full-Time','fullTime'],['Part-Time','partTime'],['Contract','contract'],['Internship','internship']].map(([v,key])=>[v,t(`hrm.employees.empTypes.${key}`)]))}{select('status',l('status'),[['Active','active'],['On Leave','onLeave'],['Inactive','inactive']].map(([v,key])=>[v,t(`hrm.employees.${key}`)]))}{field('address',l('address'))}</div>}
        {step===2&&<dl className="ux-review-grid">{review.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>}
        {error&&<div className="ux-form-error" role="alert">{error}</div>}
      </div>
      <footer className="ux-modal-footer"><button type="button" disabled={isPending} onClick={step?()=>setStep(v=>v-1):onClose} className="ux-button ux-button-secondary">{step?x('back'):t('hrm.employees.cancel')}</button><span>{step+1} / 3</span><button type="submit" disabled={isPending} className="ux-button ux-button-primary">{isPending?x('saving'):step===2?t('hrm.employees.saveEmployee'):x('next')}<Icon name="arrowRight" size={16}/></button></footer>
    </form>
  </Modal>;
}
