// Choices and fields from the approved Expense Request workbook.
export const BUSINESS_UNITS = [
  ["UYF", "UYF"],
  ["AI_AUTONO", "AI Autono"],
  ["WISE_INVEST", "Wise Invest"],
  ["BBD", "Busy Boss Diet (BBD)"],
  ["LM_HOSTEL", "LM Hostel"],
];
export const EXPENSE_CATEGORIES = [
  "HR/Staff",
  "Sales & Marketing",
  "Training",
  "Travel & Transportation",
  "Office/Admin",
  "AI Tools / Software",
  "CRM",
  "Finance/Bank Charges",
  "Cloud/Hosting",
  "Customer Support",
  "Utilities",
  "Maintenance",
  "Events",
  "Procurement",
  "Petty Cash",
  "Other",
];
export const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "Mobile Payment",
  "Other",
];
export const URGENCY_LEVELS = ["Normal", "Urgent", "Critical"];
export const EXPENSE_FIELDS = [
  ["business_unit", "Business unit", "လုပ်ငန်း", "select", BUSINESS_UNITS],
  [
    "category",
    "Expense category",
    "အသုံးစရိတ်အမျိုးအစား",
    "select",
    EXPENSE_CATEGORIES,
  ],
  ["description", "Expense description", "အသုံးစရိတ်အသေးစိတ်", "textarea"],
  [
    "purpose",
    "Business purpose / justification",
    "လုပ်ငန်းအတွက် လိုအပ်ရသည့်အကြောင်း",
    "textarea",
  ],
  ["vendor", "Vendor / payee", "ပေးချေရမည့်သူ / ဆိုင်", "text"],
  ["expense_date", "Expense date", "အသုံးစရိတ်ရက်စွဲ", "date"],
  [
    "required_payment_date",
    "Required payment date",
    "ပေးချေရန်လိုသည့်ရက်",
    "date",
  ],
  ["urgency", "Urgency", "အရေးပေါ်အဆင့်", "select", URGENCY_LEVELS],
  [
    "payment_method",
    "Payment method",
    "ငွေပေးချေနည်း",
    "select",
    PAYMENT_METHODS,
  ],
  [
    "currency",
    "Currency (3-letter code)",
    "ငွေကြေးကုဒ် (စာလုံး ၃ လုံး)",
    "text",
  ],
  ["requested_amount", "Requested amount", "တောင်းဆိုသည့်ပမာဏ", "number"],
  ["budget_amount", "Budget amount", "Budget ပမာဏ", "number"],
];

export const SMART_EXPENSE_FIELDS = [
 ["destination","Destination","သွားမည့်နေရာ"],
 ["travel_date","Travel date","ခရီးသွားမည့်ရက်"],
 ["service_name","Software / service name","Software / ဝန်ဆောင်မှုအမည်"],
 ["is_recurring","Recurring subscription","ထပ်တလဲလဲငွေပေးချေမှု"],
 ["subscription_period","Subscription / billing period","Subscription / ငွေပေးချေမှုကာလ"],
 ["event_name","Training / event name","သင်တန်း / ပွဲအမည်"],
 ["has_scheduled_date","Scheduled date confirmed","ရက်ချိန်းအတည်ပြုပြီး"],
 ["planned_date","Scheduled date","သတ်မှတ်ရက်"],
 ["urgency_reason","Urgency reason","အရေးတကြီးဖြစ်ရသည့်အကြောင်း"]
];
// EXPENSE_FIELDS is retained for displaying pre-MOD-004 historical submissions,
// including their original budget data; the new form does not use it for input.
export function expenseDisplayFields(input = {}) {
 return [...EXPENSE_FIELDS,...SMART_EXPENSE_FIELDS].filter(([key])=>input[key] !== undefined && input[key] !== null && input[key] !== "");
}
export const EXPENSE_INSTRUCTIONS =
 "Submit requests before spending. Supporting documents are always optional. Approval and actual Finance payment are separate.";

const requiredText=(body,key,label,max=250)=>{
 const value=body[key];
 if(typeof value!=="string" || !value.trim() || value.trim().length>max)
  throw new Error(label+" is required (maximum "+max+" characters)");
 return value.trim();
};
const optionalText=(body,key,label,max=250)=>{
 const value=body[key];
 if(value==null||value==="")return null;
 if(typeof value!=="string" || value.trim().length>max)throw new Error("Enter a valid "+label);
 return value.trim()||null;
};
const dateValue=(value,label)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0,10)!==value)throw new Error("Enter a valid "+label);
 return value;
};
const yes=value=>value===true||value==="true";
export function expenseInput(body,businessUnits=BUSINESS_UNITS){
 const business_unit=requiredText(body,"business_unit","Expense business");
 if(!businessUnits.some(unit=>unit[0]===business_unit))throw new Error("Choose a valid expense business");
 const category=requiredText(body,"category","Expense category");
 if(!EXPENSE_CATEGORIES.includes(category))throw new Error("Choose a valid expense category");
 const description=requiredText(body,"description","Expense description",4000);
 const currency=String(body.currency||"THB").trim().toUpperCase();
 if(!/^[A-Z]{3}$/.test(currency))throw new Error("Use a 3-letter currency code");
 const amount=String(body.requested_amount??"");
 if(!/^\d{1,12}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0)
  throw new Error("Enter a positive request amount with up to 2 decimals");
 const urgency=body.urgency||"Normal";
 if(!URGENCY_LEVELS.includes(urgency))throw new Error("Choose a valid urgency");
 const expense_date=dateValue(requiredText(body,"expense_date","Expense date"),"expense date");
 const out={business_unit,category,description,requested_amount:Number(amount),currency,expense_date,urgency};
 const vendor=optionalText(body,"vendor","vendor");
 if(vendor)out.vendor=vendor;
 const due=optionalText(body,"required_payment_date","required payment date");
 if(due)out.required_payment_date=dateValue(due,"required payment date");
 if(urgency!=="Normal"){
  out.urgency_reason=requiredText(body,"urgency_reason","Urgency reason",4000);
  if(!due)throw new Error("Urgent requests need a payment deadline");
 }
 if(category==="Travel & Transportation"){
  out.destination=requiredText(body,"destination","Destination");
  out.travel_date=dateValue(requiredText(body,"travel_date","Travel date"),"travel date");
 }
 if(["AI Tools / Software","CRM","Cloud/Hosting"].includes(category)){
  out.service_name=requiredText(body,"service_name","Software / service name");
  out.is_recurring=yes(body.is_recurring);
  if(out.is_recurring)out.subscription_period=requiredText(body,"subscription_period","Subscription / billing period");
 }
 if(["Training","Events"].includes(category)){
  out.event_name=requiredText(body,"event_name","Training / event name");
  out.has_scheduled_date=yes(body.has_scheduled_date);
  if(out.has_scheduled_date)out.planned_date=dateValue(requiredText(body,"planned_date","Scheduled date"),"scheduled date");
 }
 return out;
}
