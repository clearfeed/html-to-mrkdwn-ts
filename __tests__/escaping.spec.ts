import htmlToMrkdwn from '../src/index'

/**
 * Slack's API returns message text with `&`, `<` and `>` escaped, and consumers render
 * mrkdwn back to HTML assuming that. Text converted here must come out the same shape,
 * or a tag the author typed reaches the DOM as live markup.
 */
describe('entity escaping', () => {
  describe('author text', () => {
    it('escapes a tag the author typed', () => {
      expect(htmlToMrkdwn('<p>&lt;hello&gt; hii &lt;/hello&gt;</p>').text).toEqual(
        '&lt;hello&gt; hii &lt;/hello&gt;'
      )
    })

    it('escapes an ampersand', () => {
      expect(htmlToMrkdwn('<p>A &amp; B</p>').text).toEqual('A &amp; B')
    })

    it('escapes a tag inside a code block', () => {
      expect(htmlToMrkdwn('<pre><code>&lt;div class="x"&gt;</code></pre>').text).toEqual(
        '```\n&lt;div class="x"&gt;\n```'
      )
    })

    it('escapes markup that would otherwise execute', () => {
      expect(htmlToMrkdwn('<p>&lt;img src=x onerror=alert(1)&gt;</p>').text).toEqual(
        '&lt;img src=x onerror=alert(1)&gt;'
      )
    })
  })

  describe('generated markup is not escaped', () => {
    it('keeps a link usable', () => {
      expect(htmlToMrkdwn('<a href="https://x.com">docs</a>').text).toEqual(
        '<https://x.com|docs>'
      )
    })

    it('keeps an image usable', () => {
      expect(htmlToMrkdwn('<img src="https://x.com/a.png" alt="a" />').text).toEqual(
        '<https://x.com/a.png|a>'
      )
    })

    it('keeps a mention usable', () => {
      const html = '<span class="mention" data-mention-tag="<@U123>">@ashish</span>'
      expect(htmlToMrkdwn(html).text).toEqual('<@U123>')
    })

    it('keeps a mention usable alongside escaped author text', () => {
      const html =
        '<p>&lt;hello&gt; cc <span class="mention" data-mention-tag="<@U123>">@ashish</span> ' +
        '<a href="https://x.com">docs</a></p>'
      expect(htmlToMrkdwn(html).text).toEqual('&lt;hello&gt; cc <@U123> <https://x.com|docs>')
    })

    it('leaves a span without a mention tag to the default handling', () => {
      expect(htmlToMrkdwn('<p>a <span>b</span> c</p>').text).toEqual('a b c')
    })

    /**
     * Not every producer carries the tag on an element. `parseAndNormalizeQuillHtml`
     * writes it into a text node, where it arrives entity-escaped; escaping that one
     * level further would store a mention nobody is notified by.
     */
    it('keeps a mention a producer wrote into a text node', () => {
      expect(htmlToMrkdwn('<p>hey <span>&lt;@U123&gt;</span> look</p>').text).toEqual(
        'hey <@U123> look'
      )
    })

    it('keeps a channel mention written into a text node', () => {
      expect(htmlToMrkdwn('<p>see &lt;#C0123|general&gt;</p>').text).toEqual(
        'see <#C0123|general>'
      )
    })

    it('keeps a usergroup mention written into a text node', () => {
      expect(htmlToMrkdwn('<p>cc &lt;!subteam^S123&gt;</p>').text).toEqual('cc <!subteam^S123>')
    })

    it('keeps a broadcast command written into a text node', () => {
      expect(htmlToMrkdwn('<p>&lt;!here&gt; ping</p>').text).toEqual('<!here> ping')
    })
  })

  /**
   * `pre`/`code` are translated with `noEscape`, which returns the text node before the
   * visitor reaches `textReplace`. Escaping the source HTML is what reaches them.
   */
  /**
   * The rewrite runs on the source HTML, so a tag has to be stepped over rather than
   * assumed entity-free. `&amp;` in a query string is ordinary HTML; escaping it a
   * second level leaves the translated link pointing somewhere else.
   */
  describe('attributes are left alone', () => {
    it('does not change an escaped ampersand in an href', () => {
      expect(htmlToMrkdwn('<a href="https://example.com?a=1&amp;b=2">link</a>').text).toEqual(
        '<https://example.com?a=1&b=2|link>'
      )
    })

    it('does not change escaped angle brackets in an href', () => {
      expect(htmlToMrkdwn('<a href="https://example.com?q=&lt;t&gt;">link</a>').text).toEqual(
        '<https://example.com?q=<t>|link>'
      )
    })

    it('does not change an escaped ampersand in an img src', () => {
      expect(htmlToMrkdwn('<img src="https://x.com/a.png?w=1&amp;h=2" alt="a" />').text).toEqual(
        '<https://x.com/a.png?w=1&h=2|a>'
      )
    })

    it('does not change entities in a title attribute', () => {
      expect(htmlToMrkdwn('<a href="https://x.com" title="A &amp; B">link</a>').text).toEqual(
        '<https://x.com "A & B"|link>'
      )
    })

    /** A `>` inside a quoted value must not end the tag early. */
    it('steps over a quoted attribute containing an angle bracket', () => {
      expect(htmlToMrkdwn('<a href="https://x.com" title="a &gt; b">link</a>').text).toEqual(
        '<https://x.com "a > b"|link>'
      )
    })

    it('escapes author text alongside an attribute it left alone', () => {
      expect(
        htmlToMrkdwn('<p>use &lt;div&gt; <a href="https://x.com?a=1&amp;b=2">docs</a></p>').text
      ).toEqual('use &lt;div&gt; <https://x.com?a=1&b=2|docs>')
    })

    it('leaves a comment out of the escaping', () => {
      expect(htmlToMrkdwn('<!-- a &amp; b --><p>&lt;i&gt;</p>').text).toEqual('&lt;i&gt;')
    })
  })

  describe('code blocks reached despite noEscape', () => {
    const appServerTranslators = {
      pre: { noEscape: true, preserveWhitespace: true, surroundingNewlines: 1 }
    }

    it('escapes a tag in a code block under the app-server pre override', () => {
      expect(
        htmlToMrkdwn('<pre><code>&lt;div&gt;hello&lt;/div&gt;</code></pre>', {}, appServerTranslators)
          .text
      ).toEqual('```\n&lt;div&gt;hello&lt;/div&gt;\n```')
    })

    it('escapes a tag in an inline code span', () => {
      expect(htmlToMrkdwn('<p>use <code>&lt;div&gt;</code> here</p>').text).toEqual(
        'use `&lt;div&gt;` here'
      )
    })

    it('escapes an ampersand inside a code block', () => {
      expect(htmlToMrkdwn('<pre><code>a &amp;&amp; b</code></pre>').text).toEqual(
        '```\na &amp;&amp; b\n```'
      )
    })

    it('preserves indentation inside a code block', () => {
      expect(
        htmlToMrkdwn('<pre><code>&lt;a&gt;\n    &lt;b&gt;x&lt;/b&gt;\n&lt;/a&gt;</code></pre>').text
      ).toEqual('```\n&lt;a&gt;\n    &lt;b&gt;x&lt;/b&gt;\n&lt;/a&gt;\n```')
    })
  })

  describe('shape parity with Slack', () => {
    it('produces what Slack would have stored for the same message', () => {
      // Slack escapes `<` and `>` in message text; this must match.
      expect(htmlToMrkdwn('<p>use &lt;div&gt; here</p>').text).toEqual('use &lt;div&gt; here')
    })

    it('keeps an entity the author typed literally', () => {
      // `&amp;lt;` is the author writing the characters `&lt;`, not a `<`.
      expect(htmlToMrkdwn('<p>&amp;lt;</p>').text).toEqual('&amp;lt;')
    })
  })
})
