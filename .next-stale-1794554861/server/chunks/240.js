"use strict";exports.id=240,exports.ids=[240],exports.modules={3240:(a,b,c)=>{c.d(b,{$0:()=>_,$C:()=>u,Az:()=>ag,C1:()=>t,CF:()=>V,DY:()=>D,EH:()=>K,Ep:()=>ac,F3:()=>m,Hl:()=>q,Iq:()=>Z,Ir:()=>aa,Is:()=>H,JH:()=>k,Je:()=>O,Ju:()=>p,LJ:()=>Y,M3:()=>L,M8:()=>N,Mh:()=>i,Mj:()=>I,O:()=>z,Pz:()=>E,RC:()=>x,Ri:()=>af,Wz:()=>T,Y1:()=>B,Yr:()=>ad,Yx:()=>y,_3:()=>M,ae:()=>l,ax:()=>U,cz:()=>G,d$:()=>r,d9:()=>J,gN:()=>A,hH:()=>j,ik:()=>Q,l2:()=>f,mm:()=>s,oc:()=>ab,ou:()=>n,ri:()=>$,rr:()=>w,u7:()=>P,uf:()=>W,ut:()=>h,wV:()=>X,wl:()=>v,xk:()=>R,xz:()=>o,yE:()=>S,yt:()=>C,zQ:()=>F,zr:()=>ae});var d=c(71617),e=c(43344);async function f(a,b){await (0,d.ll)`
    UPDATE companies SET security_page_checked = true, security_page_url = ${b}
    WHERE id = ${a}`}let g=(a,b)=>{if(!a)return b;try{return JSON.parse(a)}catch{return b}};async function h(a){let b=(0,d.Si)("run");return await (0,d.ll)`
    INSERT INTO runs (id, weights_json, switches_json, domains_submitted, duplicates_removed, status)
    VALUES (${b}, ${JSON.stringify(a.weights)}, ${JSON.stringify(a.switches)},
            ${a.domainsSubmitted}, ${a.duplicatesRemoved}, 'running')`,b}async function i(a){return(0,d.xH)`SELECT * FROM runs WHERE id = ${a}`}async function j(){return(0,d.xH)`SELECT * FROM runs ORDER BY started_at DESC LIMIT 1`}async function k(a,b="done"){await (0,d.ll)`UPDATE runs SET finished_at = now(), status = ${b} WHERE id = ${a}`}async function l(a,b,c){await (0,d.ll)`
    UPDATE runs SET weights_json = ${JSON.stringify(b)},
                    switches_json = ${JSON.stringify(c)}
    WHERE id = ${a}`}function m(a){return{...e.kZ,...g(a.weights_json,{})}}function n(a){return{...e.FN,...g(a.switches_json,{})}}async function o(a){let b=(0,d.Si)("co");return await (0,d.ll)`
    INSERT INTO companies (id, run_id, domain, normalized_domain, status, stage)
    VALUES (${b}, ${a.runId}, ${a.domain}, ${a.normalizedDomain}, 'pending', 'queued')
    ON CONFLICT (run_id, normalized_domain) DO NOTHING`,b}let p=3;async function q(a){return(await (0,d.ll)`
    UPDATE companies
    SET status = 'running', stage = 'fetching', claimed_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM companies
      WHERE run_id = ${a}
        AND (
          status = 'pending'
          OR (
            status = 'running'
            AND (
              claimed_at IS NULL
              OR claimed_at < now() - make_interval(secs => ${90})
            )
          )
        )
      ORDER BY (status = 'running') ASC, created_at ASC
      LIMIT 1
    )
    RETURNING *`)[0]??null}async function r(a,b){await (0,d.ll)`UPDATE companies SET stage = ${b} WHERE id = ${a}`}async function s(a){return(0,d.ll)`
    SELECT * FROM companies WHERE run_id = ${a} ORDER BY created_at ASC`}async function t(a){return(0,d.xH)`SELECT * FROM companies WHERE id = ${a}`}async function u(a){let b=await (0,d.ll)`
    SELECT COUNT(*) AS n FROM companies
    WHERE run_id = ${a} AND status IN ('pending', 'running')`;return Number(b[0]?.n??0)}function v(a){return{is_b2b_saas:a.is_b2b_saas,is_b2b_saas_evidence:g(a.is_b2b_saas_evidence_json,null),cert_status:a.cert_status,cert_status_evidence:g(a.cert_status_evidence_json,null),size_band:a.size_band,size_band_evidence:g(a.size_band_evidence_json,null),size_source:a.size_source??null,pressure_signals:g(a.pressure_signals_json,null),is_services:a.is_services}}async function w(a,b){await (0,d.ll)`
    UPDATE companies SET
      is_b2b_saas = ${b.is_b2b_saas},
      is_b2b_saas_evidence_json = ${b.is_b2b_saas_evidence?JSON.stringify(b.is_b2b_saas_evidence):null},
      cert_status = ${b.cert_status},
      cert_status_evidence_json = ${b.cert_status_evidence?JSON.stringify(b.cert_status_evidence):null},
      size_band = ${b.size_band},
      size_band_evidence_json = ${b.size_band_evidence?JSON.stringify(b.size_band_evidence):null},
      size_source = ${null===b.size_band?null:b.size_source},
      pressure_signals_json = ${b.pressure_signals?JSON.stringify(b.pressure_signals):null},
      is_services = ${b.is_services}
    WHERE id = ${a}`}async function x(a,b){await (0,d.ll)`
    UPDATE companies SET
      verdict = ${b.verdict}, timing_score = ${b.timing_score},
      independent_signals = ${b.independent_signals}, play = ${b.play},
      verdict_reason = ${b.verdict_reason}, rule_fired = ${b.rule_fired},
      fetches_used = ${b.fetches_used},
      missing_fields_json = ${JSON.stringify(b.missing_fields)},
      status = 'done', stage = 'done'
    WHERE id = ${a}`}async function y(a,b){await (0,d.ll)`
    UPDATE companies SET status = 'error', stage = 'error', error = ${b}
    WHERE id = ${a}`}async function z(a){await (0,d.ll)`UPDATE companies SET status = 'quarantined', stage = 'quarantined' WHERE id = ${a}`}async function A(a){await (0,d.ll)`
    INSERT INTO fetches (id, company_id, url, tier, status_code, word_count, ok, error, clean_text,
                         from_cache, delay_ms)
    VALUES (${(0,d.Si)("fe")}, ${a.companyId}, ${a.url}, ${a.tier}, ${a.statusCode},
            ${a.wordCount}, ${a.ok}, ${a.error}, ${a.cleanText},
            ${a.fromCache??!1}, ${a.delayMs??0})`}let B=7;async function C(a){try{let b=(await (0,d.ll)`
      SELECT clean_text, tier, links_json, job_links_json FROM page_cache
      WHERE url = ${a}
        AND fetched_at > now() - make_interval(days => ${B})`)[0];if(!b||null===b.links_json)return null;return{clean_text:b.clean_text,tier:b.tier,links:JSON.parse(b.links_json),job_links:JSON.parse(b.job_links_json??"[]")}}catch{return null}}async function D(a){try{await (0,d.ll)`
      INSERT INTO page_cache (url, tier, clean_text, word_count, links_json, job_links_json, fetched_at)
      VALUES (${a.url}, ${a.tier}, ${a.clean_text}, ${a.word_count},
              ${JSON.stringify(a.links)}, ${JSON.stringify(a.job_links)}, now())
      ON CONFLICT (url) DO UPDATE
        SET clean_text = EXCLUDED.clean_text,
            tier = EXCLUDED.tier,
            word_count = EXCLUDED.word_count,
            links_json = EXCLUDED.links_json,
            job_links_json = EXCLUDED.job_links_json,
            fetched_at = now()`}catch{}}async function E(a){let b=await (0,d.ll)`
    SELECT f.from_cache, COUNT(*) AS n
    FROM fetches f
    JOIN companies c ON c.id = f.company_id
    WHERE c.run_id = ${a} AND f.ok = true
    GROUP BY f.from_cache`,c=0,e=0;for(let a of b)a.from_cache?c+=Number(a.n):e+=Number(a.n);return{cached:c,live:e}}async function F(a){return(0,d.ll)`
    SELECT * FROM fetches WHERE company_id = ${a} ORDER BY fetched_at ASC`}async function G(a,b,c,e){for(let f of(await (0,d.ll)`DELETE FROM evidence_blocks WHERE company_id = ${a}`,e))await (0,d.ll)`
      INSERT INTO evidence_blocks
        (id, run_id, company_id, domain, kind, claim_id, tier, quote, reason)
      VALUES (${(0,d.Si)("eb")}, ${b}, ${a}, ${c}, ${f.kind},
              ${f.claim_id??null}, ${f.tier}, ${f.quote??null}, ${f.reason??null})`}async function H(a){return(0,d.ll)`
    SELECT * FROM evidence_blocks
    WHERE run_id = ${a}
    ORDER BY tier ASC, domain ASC, kind ASC`}async function I(a){return(await (0,d.ll)`
    SELECT url, clean_text FROM fetches
    WHERE company_id = ${a} AND ok = true AND clean_text IS NOT NULL
    ORDER BY fetched_at ASC`).map(a=>({url:a.url,text:a.clean_text??""}))}async function J(a){await (0,d.ll)`
    INSERT INTO loop_trace
      (id, company_id, iteration, empty_fields_json, chosen_url, chosen_reason, chosen_by,
       fetch_ok, fields_filled_json)
    VALUES (${(0,d.Si)("lt")}, ${a.companyId}, ${a.iteration},
            ${JSON.stringify(a.emptyFields)}, ${a.chosenUrl}, ${a.chosenReason},
            ${a.chosenBy}, ${a.fetchOk},
            ${a.fieldsFilled?JSON.stringify(a.fieldsFilled):null})`}async function K(a){return(0,d.ll)`
    SELECT * FROM loop_trace WHERE company_id = ${a} ORDER BY iteration ASC`}async function L(a,b){for(let c of(await (0,d.ll)`DELETE FROM signals WHERE company_id = ${a}`,b))await (0,d.ll)`
      INSERT INTO signals (id, company_id, signal_id, points, independence_group, quote,
                           source_url, tier, tier_reason)
      VALUES (${(0,d.Si)("sg")}, ${a}, ${c.signal_id}, ${c.points},
              ${c.independence_group}, ${c.quote}, ${c.source_url},
              ${c.tier??"asserted"}, ${c.tier_reason??null})`}async function M(a){return(0,d.ll)`
    SELECT * FROM signals WHERE company_id = ${a} ORDER BY signal_id ASC`}async function N(a){return(0,d.ll)`
    SELECT s.* FROM signals s
    JOIN companies c ON c.id = s.company_id
    WHERE c.run_id = ${a}
    ORDER BY s.company_id, s.signal_id`}function O(a){return a.map(a=>({signal_id:a.signal_id,points:a.points,independence_group:a.independence_group,quote:a.quote,source_url:a.source_url,tier:"verified"===a.tier?"verified":"asserted",tier_reason:a.tier_reason}))}async function P(a,b){for(let c of(await (0,d.ll)`DELETE FROM contacts WHERE company_id = ${a}`,b))await (0,d.ll)`
      INSERT INTO contacts (id, company_id, first_name, last_name, position, seniority,
                            department, email, confidence, hunter_type, ladder_rank,
                            selected, lost_reason, source)
      VALUES (${(0,d.Si)("ct")}, ${a}, ${c.first_name}, ${c.last_name}, ${c.position},
              ${c.seniority}, ${c.department}, ${c.email}, ${c.confidence}, ${c.hunter_type},
              ${c.ladder_rank}, ${c.selected}, ${c.lost_reason}, ${c.source})`}async function Q(a){return(0,d.ll)`
    SELECT * FROM contacts WHERE company_id = ${a}
    ORDER BY selected DESC, ladder_rank ASC, confidence DESC`}async function R(a,b){await (0,d.ll)`UPDATE contacts SET selected = false WHERE company_id = ${a}`,await (0,d.ll)`UPDATE contacts SET selected = true WHERE id = ${b} AND company_id = ${a}`}async function S(a,b){await (0,d.ll)`DELETE FROM pain_points WHERE company_id = ${a}`;for(let c=0;c<b.length;c++){let e=b[c];await (0,d.ll)`
      INSERT INTO pain_points (id, company_id, idx, text, quote, source_url, validated,
                               tier, tier_reason)
      VALUES (${(0,d.Si)("pp")}, ${a}, ${c}, ${e.text}, ${e.quote}, ${e.source_url},
              ${e.validated}, ${e.tier??"asserted"}, ${e.tier_reason??null})`}}async function T(a){return(0,d.ll)`
    SELECT * FROM pain_points WHERE company_id = ${a} ORDER BY idx ASC`}async function U(a,b){await (0,d.ll)`DELETE FROM drafts WHERE company_id = ${a}`;let c=(0,d.Si)("dr");return await (0,d.ll)`
    INSERT INTO drafts (id, company_id, subject, body, hook_quote, hook_url, validated, blocked_reason)
    VALUES (${c}, ${a}, ${b.subject}, ${b.body}, ${b.hook_quote}, ${b.hook_url},
            ${b.validated}, ${b.blocked_reason})`,c}async function V(a){return(0,d.xH)`
    SELECT * FROM drafts WHERE company_id = ${a} ORDER BY created_at DESC LIMIT 1`}async function W(a){return(0,d.xH)`SELECT * FROM drafts WHERE id = ${a}`}async function X(a,b,c){await (0,d.ll)`UPDATE drafts SET subject = ${b}, body = ${c} WHERE id = ${a}`}async function Y(a,b,c){await (0,d.ll)`UPDATE drafts SET validated = ${b}, blocked_reason = ${c}
            WHERE id = ${a}`}async function Z(a){await (0,d.ll)`
    INSERT INTO sends (id, draft_id, to_address, transport, status, error)
    VALUES (${(0,d.Si)("sn")}, ${a.draftId}, ${a.toAddress}, ${a.transport},
            ${a.status}, ${a.error})`}async function $(a){return(0,d.ll)`SELECT * FROM sends WHERE draft_id = ${a} ORDER BY sent_at DESC`}async function _(a){await (0,d.ll)`
    INSERT INTO feedback (id, company_id, domain, action, reason)
    VALUES (${(0,d.Si)("fb")}, ${a.companyId}, ${a.domain}, ${a.action}, ${a.reason})`}async function aa(){return new Map((await (0,d.ll)`
    SELECT DISTINCT ON (domain) domain, reason, created_at
    FROM feedback WHERE action = 'reject'
    ORDER BY domain, created_at DESC`).map(a=>[a.domain,a.reason??"no reason given"]))}async function ab(){return(0,d.ll)`SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50`}async function ac(a){return(0,d.xH)`
    SELECT * FROM feedback WHERE company_id = ${a} ORDER BY created_at DESC LIMIT 1`}async function ad(a){await (0,d.ll)`
    INSERT INTO quarantine (id, run_id, domain, reason_code, reason_text)
    VALUES (${(0,d.Si)("qa")}, ${a.runId}, ${a.domain}, ${a.reasonCode}, ${a.reasonText})`}async function ae(a){return(0,d.ll)`
    SELECT * FROM quarantine WHERE run_id = ${a} ORDER BY created_at ASC`}async function af(a){return(0,d.ll)`
    SELECT * FROM cost_ledger WHERE run_id = ${a} ORDER BY created_at ASC`}async function ag(a){let b=(await (0,d.ll)`
    SELECT COALESCE(SUM(cost_usd), 0) AS total,
           COUNT(*) AS calls,
           COUNT(*) FILTER (WHERE cache_hit) AS hits,
           COUNT(*) FILTER (WHERE NOT ok) AS failures
    FROM cost_ledger WHERE run_id = ${a}`)[0];return{totalUsd:Number(b?.total??0),calls:Number(b?.calls??0),cacheHits:Number(b?.hits??0),failures:Number(b?.failures??0)}}},43344:(a,b,c)=>{c.d(b,{FN:()=>g,Ri:()=>e,XS:()=>d,kZ:()=>f,qg:()=>h});let d={is_b2b_saas:null,is_b2b_saas_evidence:null,cert_status:null,cert_status_evidence:null,size_band:null,size_band_evidence:null,size_source:null,pressure_signals:null,is_services:null},e=["is_b2b_saas","size_band","cert_status","pressure_signals"],f={"S-01":40,"S-02":30,"S-03":30,"S-04":25,"S-05":15,"S-06":10,"S-07":15},g={strict_icp:!1,ai_enabled:!0,reader_enabled:!0,auto_send:!1},h="not stated"},55386:(a,b,c)=>{c.d(b,{EJ:()=>j,Tm:()=>i,_K:()=>h,ib:()=>g,vC:()=>f});class d extends Error{constructor(a,b){super(`Signal cannot start: required environment variable ${a} is not set. It is required because ${b} Add it to .env.local for local development or to the Vercel project settings for production. See .env.example for the full list.`),this.name="MissingEnvError"}}let e=a=>{let b=process.env[a];if(void 0===b)return null;let c=b.trim();return 0===c.length?null:c};function f(){let a=e("GMAIL_SEND_TO");if(!a)throw new d("GMAIL_SEND_TO","it is the hardcoded outbound recipient and the app must never fall back to a guessed address.");return a}function g(){return e("GMAIL_SEND_TO")}let h={databaseUrl:()=>e("DATABASE_URL"),geminiApiKey:()=>e("GEMINI_API_KEY"),openRouterApiKey:()=>e("OPENROUTER_API_KEY"),hunterApiKey:()=>e("HUNTER_API_KEY"),googleClientId:()=>e("GOOGLE_CLIENT_ID"),googleClientSecret:()=>e("GOOGLE_CLIENT_SECRET"),googleRefreshToken:()=>e("GOOGLE_REFRESH_TOKEN"),resendApiKey:()=>e("RESEND_API_KEY"),emailFrom:()=>e("EMAIL_FROM"),senderName:()=>e("SENDER_NAME")??"the Growth Lead at Sprinto",siteUrl:()=>e("NEXT_PUBLIC_SITE_URL"),costCeilingUsd:()=>{let a=e("AI_COST_CEILING_USD");if(!a)return 1;let b=Number(a);return Number.isFinite(b)&&b>0?b:1}},i={ai:()=>null!==h.geminiApiKey()||null!==h.openRouterApiKey(),hunter:()=>null!==h.hunterApiKey(),gmail:()=>null!==h.googleClientId()&&null!==h.googleClientSecret()&&null!==h.googleRefreshToken(),resend:()=>null!==h.resendApiKey()&&null!==h.emailFrom(),durableDb:()=>null!==h.databaseUrl()};function j(){let a=[];i.durableDb()||a.push({variable:"DATABASE_URL",effect:"Running on an in-memory PGlite database. Runs are not persisted and will disappear on restart. Fine locally, fatal on Vercel.",level:"error"}),i.ai()||a.push({variable:"GEMINI_API_KEY",effect:"Rules-only mode. Verdicts, scores and rule IDs are still produced by the deterministic engine; extraction falls back to keyword matching and no email is drafted.",level:"warn"}),i.hunter()||a.push({variable:"HUNTER_API_KEY",effect:"Point-of-contact lookup is unavailable. Contacts come from the seeded set and render a visible `seeded` badge.",level:"warn"}),i.gmail()||i.resend()||a.push({variable:"GOOGLE_REFRESH_TOKEN",effect:"Email sending isn't connected yet. Drafts are still written and checked — Approve & send will report the failure rather than pretend.",level:"warn"}),null===g()&&a.push({variable:"GMAIL_SEND_TO",effect:"The locked recipient is not set, so sending is disabled entirely. This is the one variable Signal refuses to guess.",level:"error"});let b=h.siteUrl();return b&&b.includes("localhost")&&"1"===process.env.VERCEL&&a.push({variable:"NEXT_PUBLIC_SITE_URL",effect:"Set to localhost in a deployed environment, so generated links will not resolve.",level:"error"}),a}},71617:(a,b,c)=>{c.d(b,{Si:()=>s,ll:()=>q,xH:()=>r});var d=c(73024),e=c.n(d),f=c(76760),g=c.n(f),h=c(55386);let i=globalThis,j=i.__signalDb??={driver:null,ready:null};function k(){return e().readFileSync(g().join(process.cwd(),"lib/db/schema.sql"),"utf8")}function l(a){return a.split(/;\s*$/m).map(a=>a.replace(/--[^\n]*/g,"").trim()).filter(a=>a.length>0)}let m=[1082,1114,1184],n=a=>a;async function o(){let a=h._K.databaseUrl();if(a){let{default:b}=await Promise.resolve().then(c.bind(c,2113)),d=b(a,{max:3,idle_timeout:20,prepare:!1,types:{timestampAsText:{to:1184,from:m,serialize:n,parse:n}}}),e={kind:"neon",query:async(a,b)=>await d.unsafe(a,b),close:async()=>{await d.end({timeout:5})}};for(let a of l(k()))await e.query(a,[]);return e}let{PGlite:b}=await Promise.resolve().then(c.bind(c,77556)),d=new b({parsers:Object.fromEntries(m.map(a=>[a,n]))}),e={kind:"pglite",query:async(a,b)=>(await d.query(a,b)).rows,close:async()=>{await d.close()}};for(let a of l(k()))await e.query(a,[]);return e}async function p(){return j.driver?j.driver:(j.ready??=o().then(a=>(j.driver=a,a)),j.ready)}async function q(a,...b){let c="";for(let d=0;d<a.length;d++)c+=a[d],d<b.length&&(c+=`$${d+1}`);let d=await p();return await d.query(c,b)}async function r(a,...b){let c=await q(a,...b);return c.length>0?c[0]:null}function s(a){return`${a}_${crypto.randomUUID().replace(/-/g,"").slice(0,20)}`}}};