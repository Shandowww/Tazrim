import {providerKey} from '../../lib/accounts/brands'
import hapoalim from '../../../../../public/tazrim/wallet-hapoalim.svg'
import oneZero from '../../../../../public/tazrim/wallet-one-zero.svg'
import cal from '../../../../../public/tazrim/wallet-cal.svg'
import max from '../../../../../public/tazrim/wallet-max.svg'
import isracard from '../../../../../public/icons/wallet-isracard.png'
const marks:Record<string,{src:string;label:string}>={hapoalim:{src:hapoalim,label:'בנק הפועלים'},'one-zero':{src:oneZero,label:'ONE ZERO'},cal:{src:cal,label:'כאל'},max:{src:max,label:'max'},isracard:{src:isracard,label:'ישראכרט'}}
export function ProviderLogo({provider}:{provider:string}){const key=providerKey(provider),mark=marks[key];return mark?<span className="wallet-provider-logo" data-provider={key}><img src={mark.src} alt={mark.label} width="92" height="28" decoding="async"/></span>:null}
export function hasProviderLogo(provider:string){return !!marks[providerKey(provider)]}
