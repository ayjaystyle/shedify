import {dayIndex,localDay,type Snapshot,type Assignment,type Shift,type Validation,type Violation} from './model';
const baseRules=['minimum_staffing','maximum_staffing','qualifications','ward_eligibility','overlap','unavailability','data_integrity'];
export function validateRoster(data:Snapshot,assignments:Assignment[]=data.assignments):Validation{
 const violations:Violation[]=[];
 const fail=(rule:string,message:string,staffIds:string[]=[],shiftIds:string[]=[])=>violations.push({rule,message,staffIds,shiftIds});
 const shifts=new Map(data.shifts.map(s=>[s.id,s]));const staff=new Map(data.staff.map(s=>[s.id,s]));
 const seen=new Set<string>();const counts=new Map<string,number>();const byStaff=new Map<string,{shift:Shift;candidate:boolean}[]>();
 const add=(id:string,shift:Shift,candidate:boolean)=>{const existing=byStaff.get(id)||[];existing.push({shift,candidate});byStaff.set(id,existing);};
 for(const {shift_id,staff_id} of assignments){
  const shift=shifts.get(shift_id);const nurse=staff.get(staff_id);const key=`${shift_id}/${staff_id}`;
  if(!shift||!nurse||seen.has(key)){fail('data_integrity','Assignment contains an unknown record or duplicate.',[staff_id],[shift_id]);continue;}
  seen.add(key);counts.set(shift_id,(counts.get(shift_id)||0)+1);add(staff_id,shift,true);
  if(!nurse.active||!nurse.eligible||nurse.ward_id!==shift.ward_id||nurse.hospital_id!==data.hospital_id||shift.hospital_id!==data.hospital_id||shift.ward_id!==data.roster.ward_id)fail('ward_eligibility','Staff must be active, eligible and assigned to this ward.',[staff_id],[shift_id]);
  const qualifications=new Set([...nurse.skills,...(nurse.rank_id?[`rank:${nurse.rank_id}`]:[])]);
  if(shift.required_skills.some(x=>!qualifications.has(x)))fail('qualifications','Required qualifications or rank are missing.',[staff_id],[shift_id]);
  if(data.availability.some(x=>x.staff_id===staff_id&&Date.parse(x.start_at)<Date.parse(shift.end_at)&&Date.parse(x.end_at)>Date.parse(shift.start_at)))fail('unavailability','Assignment overlaps mandatory unavailability.',[staff_id],[shift_id]);
 }
 for(const shift of data.shifts){const count=counts.get(shift.id)||0;const day=localDay(shift.start_at,data.timezone);
  if(!(Date.parse(shift.end_at)>Date.parse(shift.start_at))||day<data.roster.start_date||day>data.roster.end_date||shift.max_staff<shift.min_staff)fail('data_integrity','Shift is outside the period or has invalid timing or staffing.',[],[shift.id]);
  if(count<shift.min_staff)fail('minimum_staffing',`${shift.name} needs ${shift.min_staff} staff; ${count} assigned.`,[],[shift.id]);
  if(count>shift.max_staff)fail('maximum_staffing',`${shift.name} permits at most ${shift.max_staff} staff; ${count} assigned.`,[],[shift.id]);
 }
 if(data.shifts.length===0)fail('data_integrity','Roster has no dated shifts.');
 for(const historical of data.history)add(historical.staff_id,historical.shift,false);
 const rule=(kind:string)=>data.rules.find(x=>x.kind===kind&&x.active)?.value;
 const rest=rule('min_rest_minutes');const one=rule('one_shift_per_day');const consecutive=rule('max_consecutive_days');
 for(const [staffId,items] of byStaff){items.sort((a,b)=>Date.parse(a.shift.start_at)-Date.parse(b.shift.start_at));
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
   const a=items[i],b=items[j];if(!a.candidate&&!b.candidate)continue;
   const gap=(Date.parse(b.shift.start_at)-Date.parse(a.shift.end_at))/60000;
   if(gap<0)fail('overlap','Staff cannot work overlapping shifts.',[staffId],[a.shift.id,b.shift.id]);
   else if(rest!==undefined&&gap<rest)fail('min_rest_minutes',`At least ${rest} minutes of rest are required.`,[staffId],[a.shift.id,b.shift.id]);
   if(one&&localDay(a.shift.start_at,data.timezone)===localDay(b.shift.start_at,data.timezone))fail('one_shift_per_day','Only one shift per local scheduling day is permitted.',[staffId],[a.shift.id,b.shift.id]);
  }
  if(consecutive){const dates=[...new Set(items.map(x=>localDay(x.shift.start_at,data.timezone)))].sort();let sequence:string[]=[];
   for(const day of dates){if(sequence.length&&dayIndex(day)-dayIndex(sequence.at(-1)!)!==1)sequence=[];sequence.push(day);
    if(sequence.length>consecutive&&items.some(x=>x.candidate&&sequence.includes(localDay(x.shift.start_at,data.timezone))))fail('max_consecutive_days',`More than ${consecutive} consecutive working days.`,[staffId],items.filter(x=>sequence.includes(localDay(x.shift.start_at,data.timezone))).map(x=>x.shift.id));
   }
  }
 }
 const evaluated=[...baseRules,...data.rules.filter(x=>x.active&&!x.kind.startsWith('fair_')).map(x=>x.kind)];
 return {valid:!violations.length,passedRules:evaluated.filter(rule=>!violations.some(x=>x.rule===rule)),violations};
}
