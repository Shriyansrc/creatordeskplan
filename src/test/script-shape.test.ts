import {describe,it,expect} from 'vitest';
import {scriptSchema,scriptInputSchema} from '../lib/ai/contracts';
import {readFileSync} from 'node:fs';
const option={a:'A different line',b:'Another line'};
const input={topic:'Website choice',niche:'Small business',goal:'Helpful teaching',platform:'ig',painPoint:'Confusing jargon',researchKeywords:[]};
const draft={hook:'You only need one clear next step.',problem:'',solution:'Show the offer. Explain who it helps.',cta:'Save this check.',hashtags:['#website','#business','#design'],seoPhrase:'website choice',options:{hook:option,problem:option,solution:option,cta:option}};
describe('topic-responsive script shape',()=>{
 it('accepts older requests and explicit auto/brief/deep depth',()=>{expect(scriptInputSchema.parse(input).depth).toBeUndefined();for(const depth of ['auto','brief','deep'])expect(scriptInputSchema.parse({...input,depth}).depth).toBe(depth)});
 it('allows no separate problem setup without dropping required useful body',()=>{expect(scriptSchema.parse(draft).problem).toBe('');expect(scriptSchema.safeParse({...draft,solution:''}).success).toBe(false)});
 it('does not force a fixed word count across simple and deep topics',()=>{expect(scriptSchema.parse({...draft,solution:'One useful line.'}).solution).toBe('One useful line.');expect(scriptSchema.parse({...draft,solution:'A full worked example. '.repeat(40)}).solution.length).toBeGreaterThan(500)});
 it('keeps the prompt topic-first and the screen readable as a whole',()=>{const provider=readFileSync('src/lib/ai/provider.ts','utf8'),screen=readFileSync('src/routes/desk.plan.tsx','utf8');expect(provider).toContain('four equal paragraphs');expect(provider).toContain('storage slots');expect(screen).toContain('Let the topic decide');expect(screen).toContain('Read as one piece');expect(screen).toContain('depth: scriptDepth')});
});
