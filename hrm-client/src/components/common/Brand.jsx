import {useBrand} from '../../context/BrandContext';
export default function Brand({compact=false,className=''}) {
 const {brand}=useBrand();
 return <div className={'uyf-brand '+(compact?'uyf-brand-compact ':'')+className}>
  <img src={brand.logo_url} alt={brand.name+' logo'} className="uyf-brand-logo" onError={event=>{if(!event.currentTarget.src.endsWith('/logo.svg'))event.currentTarget.src='/logo.svg';}}/>
  <div className="uyf-brand-copy"><span className="uyf-brand-name">{brand.name}</span><span className="uyf-brand-caption">{brand.tagline}</span></div>
 </div>;
}

export function BrandText({caption=false}){const {brand}=useBrand();return <>{brand.name}{caption?' · '+brand.tagline:''}</>;}
