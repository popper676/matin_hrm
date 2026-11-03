import api from '../api/client';
export async function downloadPayslip(id,month) {
 const {data}=await api.get(`/payroll/${id}/payslip`,{responseType:'blob'}),url=URL.createObjectURL(data),link=document.createElement('a');
 link.href=url;link.download=`Payslip_${month}.pdf`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
