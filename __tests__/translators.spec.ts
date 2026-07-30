import htmlToMrkdwn from '../src/index'

describe('translators', () => {
  it('multiple translators in action', () => {
    const html = `
<div>
  <h1>A Title</h1>
  <a href="https://foo.bar">
    <img src="https://foo.bar/baz.jpg" alt="baz" />
  </a>
</div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: 'https://foo.bar/baz.jpg',
      text: '*A Title*\n\n<https://foo.bar|baz > '
    })
    const justLink = `<a href="https://miro.medium.com/max/1400/1\\*mk1-6aYaf\\_Bes1E3Imhc0A.jpeg">baby yoda</a>`
    const actualJustLink = htmlToMrkdwn(justLink)
    expect(actualJustLink).toEqual({
      image: '',
      text: '<https://miro.medium.com/max/1400/1\\%2Amk1-6aYaf\\%5FBes1E3Imhc0A.jpeg|baby yoda>'
    })
  })

  it('translate links', () => {
    const html = `<a href="foo.bar">test</a>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({ image: '', text: '<foo.bar|test>' })
  })

  it('translate links with title', () => {
    const html = `<a href="foo.bar" title="bar">test</a>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: '<foo.bar "bar"|test>'
    })
  })

  it('translate links with special chars encoding', () => {
    const html = `<a href="foo.bar(1)_*" title="bar">test</a>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: '<foo.bar%281%29%5F%2A "bar"|test>'
    })
  })

  it('translate headings', () => {
    const html = `<div><h1>test1</h1><h2>test2</h2><h3>test3</h3><h4>test4</h4><h5>test5</h5><h6>test6</h6></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: '*test1*\n\n*test2*\n\n*test3*\n\n*test4*\n\n*test5*\n\n*test6*'
    })
  })

  /**
   * A nested bold tag is not the only way to hit a leading delimiter - a heading with no bold
   * tag at all reaches it whenever its own text starts with one. `<h2>*Starred</h2>` used to
   * produce unbalanced `**Starred*`.
   */
  it('translate headings whose text starts with the bold delimiter', () => {
    const html = `<div><h2>*Starred</h2></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({ image: '', text: '*Starred*' })
  })

  /**
   * Delimiters elsewhere in a heading's text were already stripped before the leading-delimiter
   * fix; these pin that down as unchanged.
   */
  it('translate headings with a delimiter elsewhere in the text', () => {
    const html = `<div><h1>Trailing*</h1><h2>2 * 3 = 6</h2></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({ image: '', text: '*Trailing*\n\n*2  3 = 6*' })
  })

  /**
   * Slack renders headings as bold, so a heading whose content is itself bold has the same
   * delimiter applied twice. These used to come out unbalanced (`**Heading2*`), which Slack
   * cannot parse and therefore renders as literal asterisks.
   */
  it('translate headings containing bold text', () => {
    const html = `<div><h1><strong>test1</strong></h1><h2><strong>test2</strong></h2><h3><strong>test3</strong></h3><h4><strong>test4</strong></h4><h5><strong>test5</strong></h5><h6><strong>test6</strong></h6></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: '',
      text: '*test1*\n\n*test2*\n\n*test3*\n\n*test4*\n\n*test5*\n\n*test6*'
    })
  })

  it('translate headings containing bold text via <b>', () => {
    const html = `<div><h2><b>test2</b></h2></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({ image: '', text: '*test2*' })
  })

  it('translate headings that are only partially bold', () => {
    const html = `<div><h2>Plain <strong>Bold</strong></h2></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({ image: '', text: '*Plain Bold*' })
  })

  it('translate a Zendesk comment with bold headings', () => {
    const html = `<div class="zd-comment" dir="auto"><h1 style="margin-left: 0px;" dir="auto"><strong>Heading1&nbsp;</strong></h1>&nbsp;<br><h2 style="margin-left: 0px;" dir="auto"><strong>Heading2</strong></h2><h2 style="margin-left: 0px;" dir="auto">&nbsp;</h2><h3 style="margin-left: 0px;" dir="auto"><strong>Heading3</strong></h3>&nbsp;<br><h4 style="margin-left: 0px;" dir="auto"><strong>Heading4</strong></h4></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual.text).toEqual('*Heading1* \n\n  \n*Heading2*\n\n*Heading3*\n\n  \n*Heading4*')
    // Every delimiter must be balanced, otherwise Slack renders them literally
    expect(actual.text.split('*').length - 1).toEqual(8)
  })

  it('translate img', () => {
    const html = `<div><img src='foo.jpg' alt='foo' /></div>`
    const actual = htmlToMrkdwn(html)
    expect(actual).toEqual({
      image: 'foo.jpg',
      text: '<foo.jpg|foo>'
    })
  })
})
