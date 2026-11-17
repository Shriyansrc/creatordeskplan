import {afterEach, describe, expect, it, vi} from 'vitest';
import {scriptSchema} from '../lib/ai/contracts';
const mocks=vi.hoisted(()=>({builtIn:vi.fn()}));
vi.mock('@lovable.dev/ai-gateway',()=>({generateChatCompletion:mocks.builtIn}));
import {generateValidated} from '../lib/ai/provider';

// Screenshot regression: a vague fear opening followed by the same fear again.
// These fixtures are authored review cases, NOT fresh model-generated outputs.
const screenshot={hook:'Pehli line galat bolne ke darr mein, tum baat shuru hi nahi kar paate.',problem:'Naye group mein lagta hai, kuch galat bol diya toh? Phir perfect line sochte reh jaate ho.'};
const options={a:'A different opening',b:'Another opening'};
const response={hook:screenshot.hook,problem:screenshot.problem,solution:'Mocked provider body, not a quality-approved draft.',cta:'Save this.',seoPhrase:'group conversation',hashtags:['#conversation','#group','#speaking'],options:{hook:options,problem:options,solution:options,cta:options}};
const settings={provider:'openai',apiKey:'fixture-not-a-real-key',model:'fixture-model'};
const cases=[
 {topic:'Joining a conversation in a new group',audience:'Students meeting new classmates',painPoint:'Cannot think of a first sentence',language:'Hinglish',format:'video',depth:'auto'},
 {topic:'What a domain and hosting each do',audience:'First-time shop owners buying a website',painPoint:'Confusing vendor terms',language:'English',format:'video',depth:'deep'},
 {topic:'A single useful check before posting',audience:'New creators',painPoint:'Vague openings',language:'Hindi',format:'text',depth:'brief'},
];
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();mocks.builtIn.mockReset()});
describe('cold-viewer provider request regression (mock transport, not output quality)',()=>{
 it.each(cases)('sends context, payoff, early delivery and nonrepetition rules for $topic',async input=>{
  const request=vi.fn(async(_url:unknown,_init:RequestInit)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}),{status:200,headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',request);
  const original=JSON.stringify(input);
  await generateValidated(settings,'script',input,scriptSchema);
  expect(request).toHaveBeenCalledTimes(1);
  const body=JSON.parse(request.mock.calls[0]![1]!.body as string);
  const system=body.messages[0].content;
  expect(system).toContain('does not know the product');
  expect(system).toContain('without the title');
  expect(system).toContain('what the person is trying to do and where it goes wrong');
  expect(system).toContain('Deliver the first useful line/example early');
  expect(system).toContain('must add NEW information');
  expect(system).toContain('point to where it is delivered');
  expect(system).toContain('unchanged body delivers');
  expect(system).toContain('four equal paragraphs');
  expect(system).not.toContain('The hook always opens with');
  expect(JSON.parse(body.messages[1].content)).toEqual(input);
  expect(JSON.stringify(input)).toBe(original);
 });
 it('uses the same rules for built-in provider and leaves stored rewrite input unchanged',async()=>{
  vi.stubEnv('LOVABLE_API_KEY','fixture-only');
  const input={...cases[0],current:{...screenshot,solution:'Existing body',cta:'Existing CTA'},instruction:'Make the opening clearer',searchPhrases:[],researchKeywords:[]};
  const before=JSON.stringify(input);
  mocks.builtIn.mockResolvedValue({choices:[{message:{content:JSON.stringify(response)}}]});
  await generateValidated({provider:undefined,apiKey:undefined,model:undefined},'script',input,scriptSchema);
  expect(mocks.builtIn).toHaveBeenCalledTimes(1);
  const sent=mocks.builtIn.mock.calls[0]![0];
  expect(sent.messages[0].content).toContain('COLD-VIEWER OPENING AND PAYOFF');
  expect(sent.messages[0].content).toContain('not paraphrase the opening fear');
  expect(sent.messages[0].content).toContain('Never offer or promise a DM');
  expect(JSON.stringify(input)).toBe(before);
 });
 it('does not disguise a semantic quality test as schema validation or silently rewrite a saved draft',async()=>{
  vi.stubEnv('LOVABLE_API_KEY','fixture-only');
  mocks.builtIn.mockResolvedValue({choices:[{message:{content:JSON.stringify(response)}}]});
  // A structurally valid weak opening is still accepted: model taste needs actual output review.
  const result=await generateValidated({provider:undefined,apiKey:undefined,model:undefined},'script',cases[0],scriptSchema);
  expect(result.hook).toBe(screenshot.hook);
  expect(result.problem).toBe(screenshot.problem);
  expect(mocks.builtIn).toHaveBeenCalledTimes(1);
 });
});
