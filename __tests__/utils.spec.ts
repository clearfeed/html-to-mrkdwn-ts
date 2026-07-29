import { findFirstImageSrc, tagSurround } from '../src/utils'

it('findFirstImageSrc', () => {
  const firstImgUrl = 'https://foo.bar/images/first.png'
  const html = `<div><img src="${firstImgUrl}" /><img src="second.jpg" /></div>`
  const actual = findFirstImageSrc(html)
  expect(actual).toEqual(firstImgUrl)
})

describe('tagSurround', () => {
  it('surrounds plain content', () => {
    expect(tagSurround('Title', '*')).toEqual('*Title*')
  })

  it('moves leading/trailing space outside the delimiters', () => {
    expect(tagSurround('  Title  ', '*')).toEqual(' *Title* ')
  })

  it('strips a nested delimiter that is not at position 0', () => {
    expect(tagSurround('Title*', '*')).toEqual('*Title*')
  })

  /**
   * Regression: a nested delimiter at position 0 used to survive, so content already
   * wrapped by a same-delimiter tag was surrounded again into unbalanced `**Title*`.
   */
  it('strips a nested delimiter at position 0', () => {
    expect(tagSurround('*Title*', '*')).toEqual('*Title*')
  })

  it('strips nested delimiters regardless of how many occur', () => {
    expect(tagSurround('*a* and *b*', '*')).toEqual('*a and b*')
  })

  it('preserves an escaped delimiter', () => {
    expect(tagSurround('\\*lit*', '*')).toEqual('*\\*lit*')
  })

  it('supports a multi-character delimiter', () => {
    expect(tagSurround('**Title**', '**')).toEqual('**Title**')
  })

  it('does not surround content that is only whitespace', () => {
    expect(tagSurround('   ', '*')).toEqual('   ')
  })
})
