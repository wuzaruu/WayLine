import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
const base=path.resolve(process.argv[2] || 'work/ets-gtfs');
const out=path.resolve('public/data');
function csv(line){const a=[];let s='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===','&&!q){a.push(s.trim());s='';}else s+=c;}a.push(s.trim());return a;}
async function read(name,fn){let header;for await(const line of readline.createInterface({input:fs.createReadStream(path.join(base,name)),crlfDelay:Infinity})){if(!line.trim())continue;const v=csv(line);if(!header){header=v;continue;}const o={};header.forEach((h,i)=>o[h]=v[i]||'');fn(o);}}
const routes=new Map(),stops=new Map(),groups=new Map(),shapes=new Map(),chosen=new Map();
await read('routes.txt',r=>{if(r.agency_id==='1'&&r.route_type==='3')routes.set(r.route_id,{id:r.route_id,number:r.route_short_name.replace(/^0+(?=\d)/,''),name:r.route_long_name,variants:[]});});
await read('stops.txt',s=>stops.set(s.stop_id,{id:s.stop_id,code:s.stop_code,name:s.stop_name,lat:+s.stop_lat,lng:+s.stop_lon,description:s.stop_desc,platform:s.platform_code,wheelchairBoarding:s.wheelchair_boarding}));
await read('trips.txt',t=>{if(!routes.has(t.route_id))return;const key=[t.route_id,t.direction_id,t.trip_headsign,t.shape_id].join('|');let g=groups.get(key);if(!g){g={route:t.route_id,direction:t.direction_id,headsign:t.trip_headsign,shape:t.shape_id,trip:t.trip_id,count:0};groups.set(key,g);}g.count++;});
const patterns=new Map();for(const g of groups.values()){const key=[g.route,g.direction,g.headsign].join('|');if(!patterns.has(key)||patterns.get(key).count<g.count)patterns.set(key,g);}
for(const g of patterns.values()){chosen.set(g.trip,{...g,stops:[]});shapes.set(g.shape,[]);}
const seconds=t=>t.split(':').reduce((n,v)=>n*60+Number(v),0);
await read('stop_times.txt',s=>{const g=chosen.get(s.trip_id);if(g&&stops.has(s.stop_id))g.stops.push({...stops.get(s.stop_id),seq:+s.stop_sequence,time:seconds(s.departure_time||s.arrival_time)});});
await read('shapes.txt',s=>{if(shapes.has(s.shape_id))shapes.get(s.shape_id).push([+s.shape_pt_lat,+s.shape_pt_lon,+s.shape_pt_sequence]);});
fs.mkdirSync(out,{recursive:true});
const perRoute=new Map();
for(const g of chosen.values()){const pts=shapes.get(g.shape).sort((a,b)=>a[2]-b[2]).map(p=>p.slice(0,2));if(pts.length<2||g.stops.length<2)continue;const r=routes.get(g.route);const id=String(r.variants.length);const ss=g.stops.sort((a,b)=>a.seq-b.seq).map(({seq,...s})=>s);const durationSeconds=ss.at(-1).time-ss[0].time;const startTime=ss[0].time;ss.forEach(s=>{s.elapsed=s.time-startTime;delete s.time;});const v={id,direction:g.direction,headsign:g.headsign,stops:ss,path:pts,durationSeconds};r.variants.push({id,headsign:g.headsign,direction:g.direction,stops:ss.length,from:ss[0].name,to:ss.at(-1).name,durationSeconds});if(!perRoute.has(g.route))perRoute.set(g.route,[]);perRoute.get(g.route).push(v);}
for(const [id,variants]of perRoute)fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify({id,variants}));
let feed;await read('feed_info.txt',f=>feed=f);
const index={source:'Edmonton Transit Service',url:'https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/GTFS/gtfs.zip',terms:'https://data.edmonton.ca/stories/s/City-of-Edmonton-Open-Data-Terms-of-Use/msh8-if28/',downloadedAt:new Date().toISOString(),feedStart:feed.feed_start_date,feedEnd:feed.feed_end_date,version:feed.feed_version,routes:[...routes.values()].filter(r=>r.variants.length).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}))};
fs.writeFileSync(path.join(out,'routes.json'),JSON.stringify(index));
console.log(JSON.stringify({routes:index.routes.length,variants:[...perRoute.values()].reduce((n,v)=>n+v.length,0),feedStart:index.feedStart,feedEnd:index.feedEnd,defaultRoute:routes.get('008')},null,2));
