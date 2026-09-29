import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
export function passwordMatches(input,password){return typeof input==='string'&&input.length<=256&&timingSafeEqual(digest(input),digest(password));}
export function makeSession(secret,now=Date.now()){
  const payload=Buffer.from(JSON.stringify({exp:now+2*60*60*1000,role:'admin'})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
export function validSession(token,secret,now=Date.now()){
  try{
    const [payload,signature,extra]=token.split('.');if(extra||!payload||!signature)return false;
    const expected=createHmac('sha256',secret).update(payload).digest('base64url');
    if(!passwordMatches(signature,expected))return false;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return data.role==='admin'&&Number.isFinite(data.exp)&&data.exp>now;
  }catch{return false;}
}
export function cookie(token='',expired=false){return `urna_admin=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${expired?0:7200}`;}
