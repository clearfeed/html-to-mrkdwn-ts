import htmlToMrkdwn from '../src/index'

describe('Transform HTML to Slack mrdkwn', () => {
  it('When HTML text contains strikethrough', () => {
    const html = `<div><s>Strikethrough Text</s></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: '~Strikethrough Text~'
    })
  })

  it('When HTML text contains Bold', () => {
    const html = `<div><strong>Bold Text</strong></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: '*Bold Text*'
    })
  })

  it('When HTML text contains an unordered list, top-level bullet points have no leading indentation', () => {
    const html = `<p>test</p><ul><li>first</li><li>second</li><li>third</li></ul>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: 'test\n• first\n• second\n• third'
    })
  })

  it('When HTML text contains a nested unordered list, nested bullets are indented 3 spaces per level', () => {
    const html = `<ul><li>parent<ul><li>child</li></ul></li></ul>`
    const actual = htmlToMrkdwn(html)
    // top-level: no indent, nested: 3 spaces
    expect(actual.text).toContain('• parent')
    expect(actual.text).toContain('   • child')
  })
})
