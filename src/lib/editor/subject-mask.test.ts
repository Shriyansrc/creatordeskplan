import {beforeEach,describe,expect,it,vi} from 'vitest';
import {clearSubjectMasks,maskAt,prepareSubjectMasks,subjectMasksReady} from './subject-mask';
import {createProject,clipFromAsset} from './project';
import type {ClipAsset} from './types';
const asset={sourceId:'a',name:'fixture',duration:40,width:192,height:320,url:'blob:qa'} as ClipAsset;
const project=()=>({...createProject(),clips:[{...clipFromAsset(asset),trimIn:1,trimOut:3}]});
beforeEach(()=>clearSubjectMasks());
describe('local masks safety boundaries',()=>{
 it('does not claim masks exist before processing',()=>{expect(maskAt('a',1)).toBeNull();expect(subjectMasksReady(project())).toBe(false)});
 it('honors pre-cancel before creating worker or reading a file',async()=>{const worker=vi.fn();vi.stubGlobal('Worker',worker);const a=new AbortController();a.abort();await expect(prepareSubjectMasks(project(),[asset],a.signal,()=>{})).rejects.toThrow('Canceled');expect(worker).not.toHaveBeenCalled();vi.unstubAllGlobals()});
 it('rejects an over-limit source duration despite sped-up timeline',async()=>{const p=project();p.clips[0]!.trimOut=40;p.clips[0]!.speed=4;await expect(prepareSubjectMasks(p,[asset],new AbortController().signal,()=>{})).rejects.toThrow('30 seconds')});
 it('rejects empty edit',async()=>{await expect(prepareSubjectMasks(createProject(),[],new AbortController().signal,()=>{})).rejects.toThrow('Import a video')});
 it('clear is safe with no prior masks',()=>{clearSubjectMasks();clearSubjectMasks();expect(maskAt('unknown',0)).toBeNull()});
});
