export const normalizeWalletText=(s,max)=>typeof s==='string'?s.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().replace(/\s+/g,' ').slice(0,max):'';
