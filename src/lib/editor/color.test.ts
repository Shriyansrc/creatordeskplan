import { describe, expect, it } from 'vitest';
import { colorPixels } from './color';
const neutral = { brightness: 100, contrast: 100, saturation: 100, temperature: 0 };
describe('browser-independent video colour', () => {
 it('leaves neutral RGBA pixels unchanged', () => { const p = new Uint8ClampedArray([20,90,170,121]);colorPixels(p,neutral);expect([...p]).toEqual([20,90,170,121]); });
 it('makes every colour control change actual pixels and preserves alpha', () => {for(const settings of [{brightness:40},{contrast:150},{saturation:0},{temperature:70},{temperature:-70}]){const p=new Uint8ClampedArray([50,100,180,222]);colorPixels(p,{...neutral,...settings});expect([...p]).not.toEqual([50,100,180,222]);expect(p[3]).toBe(222);}});
 it('removes colour at zero saturation and warms/cools in opposite directions', () => {const gray=new Uint8ClampedArray([50,100,180,255]);colorPixels(gray,{...neutral,saturation:0});expect(gray[0]).toBe(gray[1]);expect(gray[1]).toBe(gray[2]);const warm=new Uint8ClampedArray([100,100,100,255]),cool=warm.slice();colorPixels(warm,{...neutral,temperature:50});colorPixels(cool,{...neutral,temperature:-50});expect(warm[0]).toBeGreaterThan(warm[2]!);expect(cool[2]).toBeGreaterThan(cool[0]!);});
});
