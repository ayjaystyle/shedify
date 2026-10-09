import {z} from 'zod';
import {type Assignment,type Snapshot} from '@/domain/model';
export const TIMEFOLD_BASE='https://app.timefold.ai/api/models/employee-scheduling/v1';
export interface SolverAdapter{submit(input:unknown):Promise<string>;status(id:string):Promise<string>;result(id:string):Promise<unknown>;cancel(id:string):Promise<void>}
export class SolverError extends Error{constructor(message:string,public retryable=false,public uncertain=false){super(message);}}
export class TimefoldAdapter implements SolverAdapter{
 constructor(private key=process.env.TIMEFOLD_API_KEY,private transport:typeof fetch=fetch){}
 private async request(path:string,method='GET',body?:unknown){
  if(!this.key)throw new SolverError('TIMEFOLD_API_KEY is not configured.');
  let response:Response;try{response=await this.transport(`${TIMEFOLD_BASE}${path}`,{method,headers:{'X-API-KEY':this.key,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),cache:'no-store'});}catch{throw new SolverError('Timefold could not be reached. Submission may require reconciliation.',method==='GET',method==='POST');}
  if(!response.ok)throw new SolverError(response.status===401||response.status===403?'Timefold access was denied. Check the server key and API access.':response.status===429?'Timefold rate limit reached.':`Timefold returned HTTP ${response.status}.`,response.status===429||response.status>=500,method==='POST'&&response.status>=500);
  try{return await response.json();}catch{throw new SolverError('Timefold returned an invalid JSON response.',false,method==='POST');}
 }
 async submit(input:unknown){const data=await this.request('/schedules','POST',input);const parsed=z.object({id:z.string().min(1)}).safeParse(data);if(!parsed.success)throw new SolverError('Timefold did not return a job identifier.',false,true);return parsed.data.id;}
 async status(id:string){return z.object({solverStatus:z.string()}).parse(await this.request(`/schedules/${encodeURIComponent(id)}/metadata`)).solverStatus;}
 result(id:string){return this.request(`/schedules/${encodeURIComponent(id)}`);}
 async cancel(id:string){await this.request(`/schedules/${encodeURIComponent(id)}`,'DELETE');}
}
export function mapRequest(data:Snapshot){
 const rule=(kind:string)=>data.rules.find(x=>x.active&&x.kind===kind)?.value;
 const eligible=data.staff.filter(s=>s.active&&s.eligible&&s.ward_id===data.roster.ward_id);
 if(!eligible.length||!data.shifts.length)throw new SolverError('Eligible staff and dated shifts are required.');
 const contract={id:'ward-contract',
  ...(rule('one_shift_per_day')?{periodRules:[{id:'one-per-day',period:'DAY',shiftsWorkedMax:1,satisfiability:'REQUIRED'}]}:{}),
  ...(rule('max_consecutive_days')?{consecutiveDaysWorkedRules:[{id:'consecutive-days',maximum:rule('max_consecutive_days'),satisfiability:'REQUIRED'}]}:{}),
  ...(rule('min_rest_minutes')!==undefined?{minutesBetweenShiftsRules:[{id:'rest',minimumMinutesBetweenShifts:rule('min_rest_minutes'),satisfiability:'REQUIRED'}]}:{})};
 const employees=eligible.map(s=>({id:s.id,contracts:['ward-contract'],skills:[...s.skills,...(s.rank_id?[`rank:${s.rank_id}`]:[])].map(id=>({id})),
  unavailableTimeSpans:data.availability.filter(x=>x.staff_id===s.id).map(x=>({start:x.start_at,end:x.end_at})),
  preferredTimeSpans:data.preferences.filter(x=>x.staff_id===s.id&&x.preferred).map(x=>({start:x.start_at,end:x.end_at})),
  unpreferredTimeSpans:data.preferences.filter(x=>x.staff_id===s.id&&!x.preferred).map(x=>({start:x.start_at,end:x.end_at}))}));
 // Each shift instance is expanded into required staffing seats. No optional seats are silently invented.
 const shifts=data.shifts.flatMap(s=>Array.from({length:s.min_staff},(_,i)=>({id:`${s.id}:${i}`,start:s.start_at,end:s.end_at,requiredSkills:s.required_skills,requiredSkillsMatchKind:'ALL'})));
 const employeeIds=new Set(employees.map(e=>e.id));
 const history=data.history.filter(x=>employeeIds.has(x.staff_id)).map((x,i)=>({id:`history:${i}`,start:x.shift.start_at,end:x.shift.end_at,employee:x.staff_id,pinned:true}));
 return {modelInput:{contracts:[contract],employees,shifts:[...history,...shifts],globalRules:{
  ...(rule('fair_shifts')?{balanceShiftCountRules:[{id:'fair-shifts'}]}:{}),
  ...(rule('fair_workload')?{balanceTimeWorkedRules:[{id:'fair-workload'}]}:{})}};
}
export function parseResult(raw:unknown,data:Snapshot):Assignment[]{
 const parsed=z.object({modelOutput:z.object({shifts:z.array(z.object({id:z.string(),employee:z.string().nullable().optional()}))})}).parse(raw);
 const expected=new Map(data.shifts.flatMap(s=>Array.from({length:s.min_staff},(_,i)=>[`${s.id}:${i}`,s.id] as const)));
 const allowedStaff=new Set(data.staff.filter(s=>s.active&&s.eligible&&s.ward_id===data.roster.ward_id).map(s=>s.id));
 const seen=new Set<string>();const assignments:Assignment[]=[];
 for(const shift of parsed.modelOutput.shifts){if(shift.id.startsWith('history:'))continue;
  if(!expected.has(shift.id)||seen.has(shift.id))throw new SolverError('Timefold returned an unknown or duplicate staffing seat.');
  seen.add(shift.id);if(!shift.employee)continue;
  if(!allowedStaff.has(shift.employee))throw new SolverError('Timefold returned an unknown or ineligible employee.');
  assignments.push({shift_id:expected.get(shift.id)!,staff_id:shift.employee});
 }
 if(seen.size!==expected.size)throw new SolverError('Timefold omitted expected staffing seats.');
 return assignments;
}
