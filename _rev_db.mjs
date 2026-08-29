import fs from 'fs';
import pg from 'pg';
const env = Object.fromEntries(fs.readFileSync('/Users/macbookl/Developer/TELEFUTURACRM-FW/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
export const client = new pg.Client({
  host:'aws-1-eu-central-2.pooler.supabase.com', port:5432, database:'postgres',
  user:'postgres.'+ref, password: env.SUPABASE_DB_PASSWORD, ssl:{rejectUnauthorized:false},
});
export async function q(sql, params){ const r = await client.query(sql, params); return r; }
if (process.argv[2]) {
  await client.connect();
  const sql = process.argv[2];
  try { const r = await client.query(sql); console.log(JSON.stringify(r.rows ?? r.map(x=>x.rows), null, 1)); }
  catch(e){ console.error('ERR', e.message); }
  await client.end();
}
