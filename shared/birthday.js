export function nextBirthday(dob,today) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dob||'')||!/^\d{4}-\d{2}-\d{2}$/.test(today||''))return null;
 const [,month,day]=dob.split('-').map(Number),year=Number(today.slice(0,4));
 if(month<1||month>12||day<1||day>31)return null;
 const occurrence=y=>new Date(Date.UTC(y,month-1,Math.min(day,new Date(Date.UTC(y,month,0)).getUTCDate()))).toISOString().slice(0,10);
 const date=occurrence(year)<today?occurrence(year+1):occurrence(year);
 return {date,days:Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000)};
}
