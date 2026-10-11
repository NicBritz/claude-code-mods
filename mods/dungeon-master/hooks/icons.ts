// The tool rows' pixel items, from the same tileset as the party's heroes.
// Long weapons lie at 45 degrees, as an inventory shows them, so they fill
// their square instead of standing as a thin line.

import { ITEMS, type ItemName } from './items'

export const ICON_SIZE = 20

export function iconSvg(name: ItemName, size = ICON_SIZE): string {
  const item = ITEMS[name]
  const isLong = item.height > item.width * 1.6
  if (!isLong) {
    const side = Math.max(item.width, item.height)
    const dx = (side - item.width) / 2
    const dy = (side - item.height) / 2
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-dx} ${-dy} ${side} ${side}" width="${size}" height="${size}" shape-rendering="crispEdges">${item.paths}</svg>`
  }
  const side = Math.ceil((item.width + item.height) * Math.SQRT1_2) + 1
  const half = side / 2

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<g transform="translate(${half} ${half}) rotate(45) translate(${-item.width / 2} ${-item.height / 2})">${item.paths}</g></svg>`
  )
}
