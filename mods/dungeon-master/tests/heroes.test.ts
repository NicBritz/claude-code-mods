import { describe, expect, test } from 'claude-code/testing'

import { HEROES, heroSvg, overlordSvg } from '../hooks/heroes'
import { croppedFigure, figureTop } from '../hooks/characters'
import { SPRITES } from '../hooks/sprites'

const CLASSES = ['Fighter', 'Paladin', 'Wizard', 'Sorcerer', 'Ranger', 'Bard', 'Barbarian', 'Druid', 'Monk', 'Rogue', 'Warlock', 'Cleric']

// Every pixel run the generator writes: "M<x> <y>h<run>v1h-<run>z".
function runs(frame: string): { x: number; y: number; w: number }[] {
  return [...frame.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) }))
}

describe('the party', () => {
  test('twelve heroes, one per class, in their fixed slots', () => {
    expect(HEROES.map(hero => hero.title)).toEqual(CLASSES)
    expect(new Set(HEROES.map(hero => hero.name)).size).toBe(12)
    expect(new Set(HEROES.map(hero => hero.sprite)).size).toBe(12)
  })

  test('every sprite has four idle and four run frames on the 16x28 grid', () => {
    for (const hero of HEROES) {
      const sprite = SPRITES[hero.sprite]
      expect(sprite.idle.length).toBe(4)
      expect(sprite.run.length).toBe(4)
      for (const frame of [...sprite.idle, ...sprite.run]) {
        const cells = runs(frame)
        expect(cells.length > 0).toBe(true)
        for (const { x, y, w } of cells) {
          expect(x >= 0 && y >= 0 && x + w <= 16 && y < 28).toBe(true)
        }
      }
    }
  })

  test('every line is short and has no em dash', () => {
    for (const hero of HEROES) {
      const lines = [...hero.done, ...hero.error, ...hero.stopped, hero.ask('run the tests')]
      for (const line of lines) {
        expect(line.includes('—')).toBe(false)
        expect(line.length <= 60).toBe(true)
      }
    }
  })

  test('compacting, the runes move frame to frame and the scroll sits inside the cropped strip picture', () => {
    for (const look of [-1, 0, 6]) {
      const top = figureTop(look) - 2
      const draw = (frame: number) => (look < 0 ? overlordSvg('idle', frame, true, top) : heroSvg(look, false, frame, undefined, true, top))
      expect(draw(0)).not.toBe(draw(1))
      expect(draw(0)).toContain(`translate(${look < 0 ? 12 : 4} ${top})`)
      const cropTop = Number(/viewBox="0 (-?\d+)/.exec(croppedFigure(draw(0), look, 3).svg)?.[1])
      expect(top).toBeGreaterThanOrEqual(cropTop)
    }
  })
})
