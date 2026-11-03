import {readFile,mkdir,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),guides=JSON.parse(await readFile(new URL('shared/systemGuides.json',root),'utf8'));
for(const [role,topics]of Object.entries(guides))for(const language of ['en','my']){
 const titles=language==='en'?{owner:'Owner operating guide',employee:'Employee operating guide'}:{owner:'Owner အသုံးပြုလမ်းညွှန်',employee:'ဝန်ထမ်း အသုံးပြုလမ်းညွှန်'};
 let text='# '+titles[role]+'\n\nUnlock Your Future HR · Release 016\n\n';
 for(const topic of topics)text+='## '+topic.title[language]+'\n\n'+topic.steps[language].map((step,i)=>`${i+1}. ${step}`).join('\n')+'\n\n';
 for(const folder of ['docs/guides/','hrm-client/public/guides/']){await mkdir(new URL(folder,root),{recursive:true});await writeFile(new URL(folder+role.toUpperCase()+'_GUIDE_'+language.toUpperCase()+'.md',root),text.trimEnd()+'\n');}
}
console.log('Owner and Employee guides generated in English and Myanmar.');
