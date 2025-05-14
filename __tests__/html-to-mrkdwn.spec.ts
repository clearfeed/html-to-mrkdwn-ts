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

  it('When text contains underscores we need to preserve the input underscores ', () => {
    const html = ` <div dir="auto"><i>hello_dark_ness</i></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: '_hello_dark_ness_'
    })
  })
})
