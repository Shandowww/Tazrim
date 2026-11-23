export function StatementNoticeCardLabel({card}:{card?:{name:string;lastFour:string}|null}){
 if(!card)return null
 return <p className="break-words text-sm font-medium"><bdi>{card.name}</bdi>{card.lastFour&&<> · <bdi dir="ltr">{card.lastFour}</bdi></>}</p>
}
