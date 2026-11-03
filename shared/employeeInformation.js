// One vocabulary for the employee form, validation and review screen.
// Employment, pay and account privileges are never accepted from this form.
export const INFORMATION_SECTIONS = [
  [
    "basic",
    "Personal details",
    "ကိုယ်ရေးအချက်အလက်",
    [
      ["full_name", "Full name", "အမည်အပြည့်အစုံ", "text", true],
      ["thai_name", "Thai name", "ထိုင်းအမည်"],
      ["gender", "Gender", "ကျား/မ", "select", false, ["Male", "Female"]],
      ["date_of_birth", "Date of birth", "မွေးသက္ကရာဇ်", "date"],
      ["nationality", "Nationality", "နိုင်ငံသား"],
      [
        "marital_status",
        "Marital status",
        "အိမ်ထောင်ရေး",
        "select",
        false,
        ["Single", "Married", "Other"],
      ],
      ["phone", "Phone", "ဖုန်းနံပါတ်", "tel", true],
      ["email", "Email", "အီးမေးလ်", "email"],
      ["address", "Current address", "လက်ရှိနေရပ်လိပ်စာ", "textarea", true],
    ],
  ],
  [
    "identity",
    "Identification",
    "အထောက်အထား",
    [
      [
        "national_id",
        "ID / house registration number",
        "မှတ်ပုံတင် / အိမ်ထောင်စုအမှတ်",
      ],
      ["passport_no", "Passport number", "နိုင်ငံကူးလက်မှတ်အမှတ်"],
      ["work_permit_no", "Work permit number", "အလုပ်လုပ်ခွင့်လက်မှတ်အမှတ်"],
      ["visa_type", "Visa type", "ဗီဇာအမျိုးအစား"],
      ["visa_expiry_date", "Visa expiry", "ဗီဇာသက်တမ်းကုန်ရက်", "date"],
      [
        "work_permit_expiry_date",
        "Work permit expiry",
        "အလုပ်လုပ်ခွင့်သက်တမ်းကုန်ရက်",
        "date",
      ],
    ],
  ],
  [
    "emergency",
    "Emergency contact",
    "အရေးပေါ်ဆက်သွယ်ရန်",
    [
      ["emergency_name", "Contact name", "ဆက်သွယ်ရန်အမည်", "text", true],
      ["emergency_relationship", "Relationship", "တော်စပ်ပုံ"],
      ["emergency_phone", "Contact phone", "ဆက်သွယ်ရန်ဖုန်း", "tel", true],
      ["emergency_address", "Contact address", "ဆက်သွယ်ရန်လိပ်စာ", "textarea"],
    ],
  ],
  [
    "education",
    "Education & experience",
    "ပညာရေးနှင့် အတွေ့အကြုံ",
    [
      ["highest_education", "Highest education", "အမြင့်ဆုံးပညာအရည်အချင်း"],
      [
        "previous_experience",
        "Previous work experience",
        "ယခင်လုပ်ငန်းအတွေ့အကြုံ",
        "textarea",
      ],
      ["special_skills", "Special skills", "အထူးကျွမ်းကျင်မှု", "textarea"],
      ["other_language", "Other languages", "အခြားဘာသာစကား"],
    ],
  ],
  [
    "bank",
    "Payment details",
    "ငွေလက်ခံရန်အချက်အလက်",
    [
      ["bank_name", "Bank name", "ဘဏ်အမည်"],
      ["bank_account_name", "Account name", "ဘဏ်စာရင်းအမည်"],
      ["bank_account_no", "Account number", "ဘဏ်စာရင်းနံပါတ်"],
      [
        "payment_method",
        "Payment method",
        "ပေးချေမှုနည်းလမ်း",
        "select",
        false,
        ["Bank Transfer", "Cash"],
      ],
    ],
  ],
];
export const FAMILY_FIELDS = [
  ["name", "Name", "အမည်"],
  ["relationship", "Relationship", "တော်စပ်ပုံ"],
  ["phone", "Phone", "ဖုန်း"],
  ["occupation", "Occupation", "အလုပ်အကိုင်"],
];
export const INFORMATION_DOCUMENTS = [
  ["passport", "Passport", "နိုင်ငံကူးလက်မှတ်", "identity"],
  ["visa", "Visa", "ဗီဇာ", "identity"],
  ["work_permit", "Work permit", "အလုပ်လုပ်ခွင့်လက်မှတ်", "identity"],
  [
    "id_registration",
    "ID / house registration",
    "မှတ်ပုံတင် / အိမ်ထောင်စု",
    "identity",
  ],
  ["contract", "Employment contract", "အလုပ်ခန့်စာချုပ်", "salary"],
  ["photo", "Passport photo", "လိုင်စင်ဓာတ်ပုံ", "identity"],
  ["bank", "Bank information", "ဘဏ်အထောက်အထား", "bank"],
  ["other", "Other", "အခြား", "all"],
];
export const INFORMATION_FIELDS = INFORMATION_SECTIONS.flatMap((s) => s[3]);
export function canReviewInformation(user) {
  return (
    !!user?.is_owner ||
    (user?.access?.modules?.employees?.includes("approve") &&
      ["identity", "bank", "salary"].every((k) => user?.access?.sensitive?.[k]))
  );
}
