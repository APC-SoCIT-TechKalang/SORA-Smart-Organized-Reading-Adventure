import { createClient } from '@supabase/supabase-js';
import { cleanQuestText as clean, difficultyBounds, templateQuestDraft, validateQuestDraft, type Difficulty } from '../../../shared/quest-engine';

type RequestLike={method?:string;headers:Record<string,string|string[]|undefined>};
type ResponseLike={status:(code:number)=>ResponseLike;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
const header=(request:RequestLike,name:string)=>{const value=request.headers[name]??request.headers[name.toLowerCase()];return Array.isArray(value)?value[0]:value;};
const sameOrigin=(request:RequestLike)=>{const origin=header(request,'origin');const host=header(request,'x-forwarded-host')??header(request,'host');if(!origin||!host)return false;try{return new URL(origin).host.toLowerCase()===host.toLowerCase();}catch{return false;}};
const rankDifficulty=(points:number):Difficulty=>points>=750?'Hard':points>=250?'Medium':'Easy';

export default async function handler(request:RequestLike,response:ResponseLike){
  response.setHeader('Cache-Control','no-store, max-age=0');
  if(request.method!=='POST')return response.status(405).json({error:'Method not allowed.'});
  if(!sameOrigin(request))return response.status(403).json({error:'Same-origin request required.'});
  const url=process.env.VITE_SUPABASE_URL; const publishable=process.env.VITE_SUPABASE_PUBLISHABLE_KEY; const secret=process.env.SUPABASE_SECRET_KEY;
  const authorization=header(request,'authorization');
  if(!url||!publishable||!secret)return response.status(503).json({error:'Quest generation is not configured.'});
  if(!authorization?.startsWith('Bearer '))return response.status(401).json({error:'Reader sign-in required.'});
  const caller=createClient(url,publishable,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const account=await caller.schema('sora_v2').rpc('current_user_id');
  if(account.error||!account.data)return response.status(403).json({error:'Linked reader account required.'});
  const readerId=String(account.data);
  const active=await caller.schema('sora_v2').from('user_quests').select('user_quest_id').eq('user_id',readerId).eq('quest_status','IN PROGRESS').limit(1);
  if(active.data?.length)return response.status(200).json({status:'existing'});
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const [catalog,history,feedback,pointRows]=await Promise.all([
    admin.schema('sora_v2').from('books').select('book_genre,book_copies(copy_status)'),
    admin.schema('sora_v2').from('user_quests').select('quest_id,points_awarded,quests(target_genre)').eq('user_id',readerId).order('assigned_at',{ascending:false}).limit(12),
    admin.schema('sora_v2').from('quests').select('revised_parameters').not('revised_parameters','is',null).order('updated_at',{ascending:false}).limit(10),
    admin.schema('sora_v2').from('user_quests').select('points_awarded').eq('user_id',readerId),
  ]);
  const inventory=new Map<string,number>();
  for(const book of (catalog.data??[]) as {book_genre:string|null;book_copies:{copy_status:string}[]|null}[]){const genre=book.book_genre?.trim();if(genre&&book.book_copies?.some(copy=>copy.copy_status==='In-Shelf'))inventory.set(genre,(inventory.get(genre)??0)+1);}
  const recentGenres=(history.data??[]).map(item=>{const relation=item.quests as unknown as {target_genre?:string|null}|null;return clean(relation?.target_genre,100);}).filter(Boolean);
  const earnedPoints=(pointRows.data??[]).reduce((sum,item)=>sum+Number(item.points_awarded??0),0); const difficulty=rankDifficulty(earnedPoints); const fallback=templateQuestDraft(difficulty,inventory,recentGenres);
  if(!fallback)return response.status(422).json({error:'No achievable quest is available for the current catalog.'});
  let draft=null; let failure='AI key is not configured'; const apiKey=process.env.OPENROUTER_API_KEY;
  if(apiKey){
    const prompt=`Generate one achievable ${difficulty} manga-focused reading quest for ${earnedPoints} earned quest points. The description must contain only the measurable reading goal. Do not mention venue, library policies, availability checks, verification, or session tracking. Never use em dash or en dash characters. Use only catalog inventory. Avoid recent genres and never invent chapter completion. Return JSON with title, description, targetGenre, bookCount, timeLimitDays, points. BOUNDS: ${JSON.stringify(difficultyBounds[difficulty])}. INVENTORY: ${JSON.stringify(Object.fromEntries(inventory))}. READER RECENT GENRES: ${JSON.stringify(recentGenres)}. LIBRARIAN FEEDBACK: ${JSON.stringify((feedback.data??[]).map(item=>item.revised_parameters))}.`;
    try{const configuredModel=process.env.OPENROUTER_MODEL?.trim()||'';const model=/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(configuredModel)&&!configuredModel.startsWith('sk-')?configuredModel:'deepseek/deepseek-v4-flash-0731';const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','HTTP-Referer':process.env.OPENROUTER_SITE_URL||'https://tankobonbon-reader.vercel.app','X-Title':'S.O.R.A. Reader Quest Cycle'},body:JSON.stringify({model,temperature:.65,max_tokens:220,...(model.startsWith('deepseek/')?{reasoning:{enabled:false}}:{}),response_format:{type:'json_object'},messages:[{role:'user',content:prompt}]}),signal:AbortSignal.timeout(8000)});if(upstream.ok){const result=await upstream.json() as {choices?:{message?:{content?:string}}[]};draft=validateQuestDraft(JSON.parse(result.choices?.[0]?.message?.content??'null'),difficulty,inventory);failure=draft?'':'AI returned an invalid objective';}else failure=`AI provider returned ${upstream.status}`;}catch{failure='AI request failed or timed out';}
  }
  if(draft){const assigned=await admin.schema('sora_v2').rpc('system_assign_generated_quest',{p_user_id:readerId,p_name:draft.title,p_difficulty:draft.difficulty,p_description:draft.requirement,p_target_value:draft.targetValue,p_points:draft.points,p_days:draft.timeLimitDays,p_target_genre:draft.targetGenre});if(!assigned.error)return response.status(200).json({status:'assigned',source:'ai'});failure=assigned.error.message;}
  await admin.schema('sora_v2').from('ai_requests').insert({user_id:readerId,request_prompt:`Automatic ${difficulty} quest cycle`,request_category:'QUEST_HELP',validation_status:'REJECTED',rejection_reason:failure.slice(0,255),response_text:null,completed_at:new Date().toISOString()});
  const fallbackAssignment=await caller.schema('sora_v2').rpc('ensure_reader_quest');
  if(fallbackAssignment.error)return response.status(503).json({error:'A quest could not be assigned safely.'});
  return response.status(200).json({status:'assigned',source:'template'});
}
