import { describe, expect, test } from 'claude-code/testing'

import { diePicture, headingPicture, iconPicture, rolledFace } from '../hooks/art'

describe('the art', () => {
  test('the rolled d20 always lands on 1 to 20, and every face turns up', () => {
    const seen = new Set<number>()
    for (let frame = -50; frame < 5000; frame++) {
      const face = rolledFace(frame)
      expect(face >= 1 && face <= 20 && Number.isInteger(face)).toBe(true)
      seen.add(face)
    }
    expect(seen.size).toBe(20)
  })

  test('the die turns and changes face as the frames pass', () => {
    const faces = new Set(Array.from({ length: 8 }, (_, frame) => diePicture(frame, 22, '#F0A04B', '#1C1814', '#F5EEDF').svg))
    expect(faces.size).toBeGreaterThan(5)
    expect(diePicture(3, 22, '#F0A04B', '#1C1814', '#F5EEDF')).toMatchObject({ width: 22, height: 22 })
  })

  test('icons take the theme colour; headings are fantasy or the app font', () => {
    expect(iconPicture('party', 20, '#ABCDEF').svg).toContain('#ABCDEF')
    expect(headingPicture('fantasy', 'The Party', '#F0A04B', '#000')?.height).toBe(18)
    expect(headingPicture('app', 'The Party', '#F0A04B', '#000')).toBeNull()
  })
})

describe('the character select screen', () => {
  test('the arrows walk every look and wrap round; every sheet is complete', async () => {
    const { LOOKS, sheetOf, stepLook, portraitSvg, modifier } = await import('../hooks/characters')
    expect(LOOKS).toHaveLength(13)
    let look = -1
    const seen = new Set<number>()
    for (let i = 0; i < 13; i++) {
      seen.add(look)
      look = stepLook(look, 1)
    }
    expect(seen.size).toBe(13)
    expect(look).toBe(-1)
    expect(stepLook(-1, -1)).toBe(11)
    for (const one of LOOKS) {
      const sheet = sheetOf(one)
      expect(sheet.tale.length).toBeGreaterThan(20)
      expect(sheet.tale).not.toContain('—')
      expect(sheet.scores).toHaveLength(6)
      const art = portraitSvg(one, 120)
      expect(art.height).toBe(120)
      expect(art.svg).toContain('<animate')
    }
    expect([8, 10, 11, 12, 18].map(modifier)).toEqual(['-1', '+0', '+0', '+1', '+4'])
  })
})
