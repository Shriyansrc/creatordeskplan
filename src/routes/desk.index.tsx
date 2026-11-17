import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { PlanResult } from "@/lib/ai/contracts";
import { useDesk } from "@/desk/store";

export const Route = createFileRoute("/desk/")({ component: Home });

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function parseLocalDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y,m,d]=s.split('-').map(Number); const date=new Date(y!,m!-1,d!,12);
  return localDate(date)===s ? date : null;
}
const ordinal=(d:Date)=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
type WeekPlan = {data:PlanResult; at:string; startDate?:string};
function rollingWeek(plan:WeekPlan|null,now:Date) {
  const explicit=plan?.startDate ? parseLocalDate(plan.startDate) : null;
  const made=plan && !plan.startDate ? new Date(plan.at) : null;
  const start=explicit ?? (made && Number.isFinite(made.getTime()) ? parseLocalDate(localDate(made)) : null);
  const days=Array.from({length:7},(_,i)=>{
    const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i,12);
    const day=start ? ordinal(date)-ordinal(start)+1 : null;
    const entries=day===null ? [] : (plan?.data.calendar ?? []).filter(c=>c.day===day);
    const topics=entries.flatMap(c=>{const t=plan?.data.topics.find(t=>t.id===c.topicId);return t?[t]:[]});
    return {date,key:localDate(date),day,topics};
  });
  return {days,start,legacy:!!plan&&!plan.startDate};
}

function Home() {
  const d = useDesk();
  const [today,setToday]=useState(()=>new Date());
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const refresh=()=>{clearTimeout(timer);const now=new Date();setToday(now);const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);timer=setTimeout(refresh,Math.min(next.getTime()-now.getTime()+100,60000));};
    refresh();window.addEventListener("focus",refresh);
    return ()=>{clearTimeout(timer);window.removeEventListener("focus",refresh);};
  },[]);
  const week=rollingWeek(d.plan,today);
  const names={yt:"YouTube",ig:"Instagram",li:"LinkedIn",x:"X"};
  const step = !d.niche ? { to: "/desk/niche", title: "Choose your niche", text: "AI suggests niches from your topic and audience. You pick one.", cta: "Find my niche" } : !d.plan ? { to: "/desk/plan", title: "Build your first 30-day plan", text: "Research, ranked topics and a calendar that fits the time you told us you have.", cta: "Build my first plan" } : { to: "/desk/plan", title: "Open your plan", text: "Your ranked topics and calendar are ready.", cta: "Open plan" };
  return (
    <>
      <h1>Welcome to your desk</h1>
      <p style={{ fontSize: 21, margin: "10px 0 24px" }}>{d.plan ? "Your plan is your daily starting point." : "No plan yet. Build your first one and this page becomes your daily starting point."}</p>
      <div className="dk-g2" style={{ gridTemplateColumns: "1.1fr 1fr", alignItems: "stretch" }}>
        <div className="dk-choice" style={{ cursor: "default" }}>
          <div className="dk-label">Next up</div>
          <h2>{step.title}</h2>
          <p style={{ margin: "12px 0 22px" }}>{step.text}</p>
          <Link to={step.to} className="dk-btn">{step.cta}</Link>
        </div>
        <div className="dk-panel">
          <div className="dk-label">Your week</div>
          <div className="dk-week" aria-label="Next seven days">{week.days.map((day,i)=><div key={day.key} aria-current={i===0?"date":undefined}><b>{day.date.toLocaleDateString(undefined,{weekday:"short"})}</b><div style={{fontSize:12,marginTop:4}}>{day.date.toLocaleDateString(undefined,{day:"numeric",month:"short"})}</div><i style={{background:day.topics.length?"var(--blue)":undefined}} /></div>)}</div>
          {d.plan && week.start && <p style={{fontSize:13,margin:"12px 0"}}>Plan day 1: {week.start.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}{week.legacy?" (saved creation date; no start date was stored)":""}. Dates use your device's local time.</p>}
          {d.plan && !week.start && <p style={{fontSize:15}}>This saved plan has no usable start date. Open the plan to view its day-by-day topics. No dates have been changed.</p>}
          {week.days.filter(day=>day.topics.length).map(day=><div key={day.key} style={{marginTop:12}}><div className="dk-label">{day.key===localDate(today)?"Today":day.date.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})} · Day {day.day}</div>{day.topics.map(topic=><Link key={topic.id} to="/desk/plan" style={{display:"block",fontSize:15,marginTop:6}}>{topic.title} <span style={{fontSize:12}}>({names[topic.platform]})</span></Link>)}</div>)}
          {d.plan && week.start && !week.days.some(day=>day.topics.length) && <p style={{fontSize:15}}>No topics from this plan fall in the next seven days. Your original schedule has not been restarted.</p>}
          {!d.plan && <p style={{ fontSize: 15 }}>Your scheduled topics appear here once you create a plan.</p>}
        </div>
      </div>
      <div className="dk-label" style={{ marginTop: 34 }}>Your videos</div>
      <div className="dk-empty">Videos you script, record, drop in or edit appear here.<br />Nothing is pre-made for you.</div>
    </>
  );
          }
